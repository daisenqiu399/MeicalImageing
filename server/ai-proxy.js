const http = require('http');
const { URL } = require('url');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config();

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const PHI_FIELDS = new Set([
  'PatientName',
  'PatientID',
  'PatientId',
  'PatientBirthDate',
  'PatientAge',
  'PatientSex',
  'PatientWeight',
  'PatientAddress',
  'OtherPatientIDs',
  'OtherPatientNames',
  'IssuerOfPatientID',
  'InstitutionName',
  'InstitutionAddress',
  'ReferringPhysicianName',
  'PerformingPhysicianName',
  'OperatorsName',
  'AccessionNumber',
  'imageIds',
  'PixelData',
  'BulkDataURI',
  'bulkDataURI',
]);

function createConfig(overrides = {}) {
  return {
    provider: process.env.AI_PROVIDER || 'deepseek',
    port: Number(process.env.AI_PROXY_PORT || process.env.PROXY_PORT || 3001),
    apiKey: process.env.AI_API_KEY || process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.AI_BASE_URL || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    model: process.env.AI_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 20000),
    redactPhi: process.env.AI_REDACT_PHI !== 'false',
    rateLimit: Number(process.env.RATE_LIMIT || 60),
    logLevel: process.env.LOG_LEVEL || 'info',
    ...overrides,
  };
}

function log(config, level, message, meta) {
  const enabledLevels = {
    error: 0,
    info: 1,
    debug: 2,
  };
  const configuredLevel = enabledLevels[config.logLevel] ?? 1;
  const currentLevel = enabledLevels[level] ?? 1;

  if (currentLevel > configuredLevel) {
    return;
  }

  const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[ai-proxy] ${level.toUpperCase()} ${message}${suffix}`);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, JSON_HEADERS);
  res.end(JSON.stringify(payload));
}

function sendEmpty(res, statusCode) {
  res.writeHead(statusCode, JSON_HEADERS);
  res.end();
}

function createRateLimiter(limitPerMinute) {
  const windows = new Map();

  return {
    allow(ipAddress) {
      const now = Date.now();
      const windowStart = now - 60_000;
      const requests = (windows.get(ipAddress) || []).filter(timestamp => timestamp > windowStart);

      if (requests.length >= limitPerMinute) {
        windows.set(ipAddress, requests);
        return false;
      }

      requests.push(now);
      windows.set(ipAddress, requests);
      return true;
    },
  };
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }

  return req.socket.remoteAddress || 'unknown';
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let rawBody = '';

    req.on('data', chunk => {
      rawBody += chunk;
    });

    req.on('end', () => {
      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (error) {
        reject(new Error('Request body must be valid JSON.'));
      }
    });

    req.on('error', reject);
  });
}

function redactPhiPayload(value) {
  if (Array.isArray(value)) {
    return value.map(item => redactPhiPayload(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.entries(value).reduce((result, [key, entryValue]) => {
    if (PHI_FIELDS.has(key)) {
      return result;
    }

    result[key] = redactPhiPayload(entryValue);
    return result;
  }, {});
}

function stripCodeFences(value) {
  return value
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function uniqueWarnings(warnings) {
  return [...new Set((warnings || []).filter(Boolean))];
}

function buildWarnings(payload, warningsFromModel = []) {
  const warnings = [...warningsFromModel];

  if (!Array.isArray(payload.measurements) || payload.measurements.length === 0) {
    warnings.push('No measurements were available. The draft is based on metadata only.');
  }

  return uniqueWarnings(warnings);
}

function coerceModelResult(rawContent) {
  const strippedContent = stripCodeFences(rawContent || '');

  if (!strippedContent) {
    return {
      summary: '',
      draftMarkdown: '',
      warnings: ['The model returned an empty response.'],
    };
  }

  try {
    const parsed = JSON.parse(strippedContent);

    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      draftMarkdown: typeof parsed.draftMarkdown === 'string' ? parsed.draftMarkdown : '',
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    };
  } catch (_error) {
    return {
      summary: strippedContent,
      draftMarkdown: strippedContent,
      warnings: ['The model response was not valid JSON and was returned as raw text.'],
    };
  }
}

function buildMessages(payload) {
  const systemPrompt = [
    'You are a medical imaging report drafting assistant.',
    'You must only use the structured metadata and measurements provided by the user.',
    'Do not claim image findings that are not explicitly present in the payload.',
    'Do not include patient identifiers, accession numbers, institution names, or clinician names.',
    'The output language must be Simplified Chinese.',
    'Return strict JSON only with this shape:',
    '{"summary":"string","draftMarkdown":"string","warnings":["string"]}',
    'The markdown draft must contain these sections:',
    '## 检查摘要',
    '## 关键测量',
    '## 建议表述',
    '## 需人工确认',
  ].join('\n');

  const userPrompt = [
    'Generate a concise Chinese report draft from the following structured context.',
    'If measurements are missing, say the draft is metadata-based and keep the wording conservative.',
    JSON.stringify(payload, null, 2),
  ].join('\n\n');

  return [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: userPrompt,
    },
  ];
}

async function callModel(payload, config) {
  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(config.timeoutMs),
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      messages: buildMessages(payload),
    }),
  });

  const responseText = await response.text();
  let responseData = {};

  try {
    responseData = responseText ? JSON.parse(responseText) : {};
  } catch (_error) {
    responseData = {};
  }

  if (!response.ok) {
    const message =
      responseData.error?.message ||
      responseData.message ||
      `Model request failed with status ${response.status}.`;
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  const content = responseData.choices?.[0]?.message?.content || '';
  const result = coerceModelResult(content);

  return {
    model: responseData.model || config.model,
    ...result,
  };
}

async function handleReportDraft(req, res, config, limiter) {
  const requestId = crypto.randomUUID();
  const ipAddress = getClientIp(req);

  if (!limiter.allow(ipAddress)) {
    sendJson(res, 429, {
      requestId,
      error: {
        code: 'rate_limited',
        message: 'Too many AI requests from this client. Please retry in a minute.',
      },
    });
    return;
  }

  if (!config.apiKey) {
    sendJson(res, 500, {
      requestId,
      error: {
        code: 'missing_api_key',
        message: 'AI_API_KEY is not configured for the local proxy.',
      },
    });
    return;
  }

  const body = await readJsonBody(req);
  const payload = config.redactPhi ? redactPhiPayload(body) : body;

  if (!payload.studyContext) {
    sendJson(res, 400, {
      requestId,
      error: {
        code: 'invalid_payload',
        message: 'studyContext is required.',
      },
    });
    return;
  }

  log(config, 'info', 'Generating AI report draft', {
    requestId,
    model: config.model,
    measurements: Array.isArray(payload.measurements) ? payload.measurements.length : 0,
  });

  const modelResult = await callModel(payload, config);

  sendJson(res, 200, {
    requestId,
    model: modelResult.model,
    summary: modelResult.summary,
    draftMarkdown: modelResult.draftMarkdown,
    warnings: buildWarnings(payload, modelResult.warnings),
  });
}

function createServer(overrides = {}) {
  const config = createConfig(overrides);
  const limiter = createRateLimiter(config.rateLimit);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'OPTIONS') {
      sendEmpty(res, 204);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/healthz') {
      sendJson(res, 200, {
        status: 'ok',
        provider: config.provider,
        model: config.model,
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/ai/report-draft') {
      try {
        await handleReportDraft(req, res, config, limiter);
      } catch (error) {
        log(config, 'error', 'AI report draft failed', {
          message: error.message,
        });
        sendJson(res, error.statusCode || 500, {
          requestId: crypto.randomUUID(),
          error: {
            code: 'ai_proxy_error',
            message: error.message || 'AI proxy request failed.',
          },
        });
      }
      return;
    }

    sendJson(res, 404, {
      error: {
        code: 'not_found',
        message: 'Route not found.',
      },
    });
  });
}

if (require.main === module) {
  const config = createConfig();
  const server = createServer(config);

  server.listen(config.port, () => {
    log(config, 'info', `AI proxy listening on http://localhost:${config.port}`, {
      provider: config.provider,
      model: config.model,
    });
  });
}

module.exports = {
  buildWarnings,
  coerceModelResult,
  createConfig,
  createServer,
  redactPhiPayload,
  stripCodeFences,
};

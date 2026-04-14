const http = require('http');
const { URL } = require('url');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { buildPdfFilename, renderReportPdfBuffer } = require('./render-report-pdf');

dotenv.config();

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const BINARY_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const DEFAULT_TIMEOUT_MS = 60000;
const MAX_CAPTURE_COUNT = 4;
const MAX_CHAT_MESSAGES = 12;

const PROVIDER_DEFAULTS = {
  kimi: {
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k-vision-preview',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
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

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}

function getProviderDefaults(provider) {
  return PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.kimi;
}

function normalizeTimeoutMs(value, fallback = DEFAULT_TIMEOUT_MS) {
  const parsedValue = parseOptionalNumber(value);

  if (parsedValue === undefined || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
}

function createConfig(overrides = {}) {
  const provider = process.env.AI_PROVIDER || 'kimi';
  const defaults = getProviderDefaults(provider);

  return {
    provider,
    port: Number(process.env.AI_PROXY_PORT || process.env.PROXY_PORT || 3001),
    apiKey:
      process.env.AI_API_KEY || process.env.MOONSHOT_API_KEY || process.env.DEEPSEEK_API_KEY || '',
    baseUrl:
      process.env.AI_BASE_URL ||
      process.env.MOONSHOT_BASE_URL ||
      process.env.DEEPSEEK_BASE_URL ||
      defaults.baseUrl,
    model:
      process.env.AI_MODEL ||
      process.env.MOONSHOT_MODEL ||
      process.env.DEEPSEEK_MODEL ||
      defaults.model,
    temperature: parseOptionalNumber(process.env.AI_TEMPERATURE),
    timeoutMs: normalizeTimeoutMs(process.env.AI_TIMEOUT_MS),
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

function sendBinary(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    ...BINARY_HEADERS,
    ...headers,
  });
  res.end(body);
}

function openSseStream(res) {
  res.writeHead(200, SSE_HEADERS);
  res.flushHeaders?.();
}

function sendSseEvent(res, eventName, payload = {}) {
  if (res.writableEnded) {
    return;
  }

  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function closeSseStream(res) {
  if (!res.writableEnded) {
    res.end();
  }
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
      } catch (_error) {
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

function parseJsonResponseText(responseText) {
  try {
    return responseText ? JSON.parse(responseText) : {};
  } catch (_error) {
    return {};
  }
}

function toText(value, fallback = '') {
  if (typeof value !== 'string') {
    return fallback;
  }

  return value.replace(/\r\n/g, '\n').trim();
}

function normalizeReportObject(report = {}) {
  return {
    title: toText(report.title, 'AI影像报告草稿') || 'AI影像报告草稿',
    examSummary: toText(report.examSummary),
    findings: toText(report.findings),
    impression: toText(report.impression),
    recommendations: toText(report.recommendations),
    manualReview: toText(report.manualReview),
  };
}

function normalizeReportExportDocumentMeta(documentMeta = {}) {
  return {
    institutionName: toText(documentMeta.institutionName),
    patientName: toText(documentMeta.patientName),
    patientSex: toText(documentMeta.patientSex),
    patientAge: toText(documentMeta.patientAge),
    patientId: toText(documentMeta.patientId),
    accessionNumber: toText(documentMeta.accessionNumber),
    studyDate: toText(documentMeta.studyDate),
    studyDescription: toText(documentMeta.studyDescription),
    modality: toText(documentMeta.modality),
    seriesDescription: toText(documentMeta.seriesDescription),
  };
}

function buildDraftMarkdown(reportInput = {}) {
  const report = normalizeReportObject(reportInput);

  return [
    `# ${report.title}`,
    '',
    '## 检查摘要',
    report.examSummary || '待补充',
    '',
    '## 影像所见',
    report.findings || '待补充',
    '',
    '## 印象',
    report.impression || '待补充',
    '',
    '## 建议',
    report.recommendations || '待补充',
    '',
    '## 需人工确认',
    report.manualReview || '需结合原始影像与临床资料进行人工复核。',
  ].join('\n');
}

function buildSummary(reportInput = {}, fallbackSummary = '') {
  const report = normalizeReportObject(reportInput);

  return report.examSummary || report.impression || toText(fallbackSummary);
}

function buildWarnings(payload, warningsFromModel = []) {
  const warnings = [...warningsFromModel];

  if (!Array.isArray(payload.measurements) || payload.measurements.length === 0) {
    warnings.push(
      'No measurements were available. The draft is based on screenshots and metadata.'
    );
  }

  if (payload.capturePolicy?.includeOverlays) {
    warnings.push('Captured screenshots preserve on-screen overlays and may include identifiers.');
  }

  return uniqueWarnings(warnings);
}

function hasMeaningfulReport(report = {}) {
  if (!report || typeof report !== 'object') {
    return false;
  }

  return ['title', 'examSummary', 'findings', 'impression', 'recommendations', 'manualReview'].some(
    field => Boolean(toText(report[field]))
  );
}

function normalizeConversationMessages(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .map((message, index) => ({
      id: toText(message?.id, `message-${index + 1}`),
      role: message?.role === 'assistant' ? 'assistant' : 'user',
      content: toText(message?.content),
      createdAt: toText(message?.createdAt),
    }))
    .filter(message => message.content);
}

function trimConversationMessages(messages = [], maxMessages = MAX_CHAT_MESSAGES) {
  const normalizedMessages = normalizeConversationMessages(messages);
  return normalizedMessages.slice(-maxMessages);
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    const error = new Error('messages must contain at least one user message.');
    error.statusCode = 400;
    throw error;
  }

  messages.forEach((message, index) => {
    if (!message || typeof message !== 'object') {
      const error = new Error(`messages[${index}] must be an object.`);
      error.statusCode = 400;
      throw error;
    }

    if (!['user', 'assistant'].includes(message.role)) {
      const error = new Error(`messages[${index}].role must be "user" or "assistant".`);
      error.statusCode = 400;
      throw error;
    }

    if (!toText(message.content)) {
      const error = new Error(`messages[${index}].content must be a non-empty string.`);
      error.statusCode = 400;
      throw error;
    }
  });

  const normalizedMessages = normalizeConversationMessages(messages);

  if (!normalizedMessages.length) {
    const error = new Error('messages must contain at least one non-empty user message.');
    error.statusCode = 400;
    throw error;
  }

  if (normalizedMessages[0].role !== 'user') {
    const error = new Error('messages must start with a user message.');
    error.statusCode = 400;
    throw error;
  }

  if (normalizedMessages[normalizedMessages.length - 1].role !== 'user') {
    const error = new Error('messages must end with a user message.');
    error.statusCode = 400;
    throw error;
  }
}

function coerceModelResult(rawContent) {
  const strippedContent = stripCodeFences(rawContent || '');

  if (!strippedContent) {
    return {
      assistantMessage: '',
      summary: '',
      report: normalizeReportObject(),
      draftMarkdown: '',
      warnings: ['The model returned an empty response.'],
    };
  }

  try {
    const parsed = JSON.parse(strippedContent);
    const report = normalizeReportObject(parsed.report || {});
    const summary = buildSummary(report, parsed.summary);
    const draftMarkdown =
      typeof parsed.draftMarkdown === 'string' && parsed.draftMarkdown.trim()
        ? parsed.draftMarkdown.trim()
        : buildDraftMarkdown(report);
    const assistantMessage =
      toText(parsed.assistantMessage) ||
      toText(parsed.reply) ||
      toText(parsed.answer) ||
      summary ||
      draftMarkdown;

    return {
      assistantMessage,
      summary,
      report,
      draftMarkdown,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    };
  } catch (_error) {
    const report = normalizeReportObject({
      findings: strippedContent,
      manualReview: '模型响应未返回结构化 JSON，请人工整理后再使用。',
    });

    return {
      assistantMessage: strippedContent,
      summary: strippedContent,
      report,
      draftMarkdown: buildDraftMarkdown(report),
      warnings: ['The model response was not valid JSON and was converted into a fallback report.'],
    };
  }
}

function validateCaptures(captures, options = {}) {
  const { required = true } = options;

  if (!Array.isArray(captures) || captures.length === 0) {
    if (!required) {
      return;
    }

    const error = new Error('captures must contain 1 to 4 screenshots.');
    error.statusCode = 400;
    throw error;
  }

  if (captures.length > MAX_CAPTURE_COUNT) {
    const error = new Error('captures cannot contain more than 4 screenshots.');
    error.statusCode = 400;
    throw error;
  }

  captures.forEach((capture, index) => {
    if (!capture || typeof capture !== 'object') {
      const error = new Error(`captures[${index}] must be an object.`);
      error.statusCode = 400;
      throw error;
    }

    if (typeof capture.dataUrl !== 'string' || !capture.dataUrl.startsWith('data:image/')) {
      const error = new Error(`captures[${index}].dataUrl must be a data URL image.`);
      error.statusCode = 400;
      throw error;
    }
  });
}

function buildPromptContext(payload) {
  const { captures = [], messages = [], reportState, sessionId, stream, ...rest } = payload;
  const currentReport = hasMeaningfulReport(reportState)
    ? normalizeReportObject(reportState)
    : null;

  return {
    ...rest,
    sessionId: toText(sessionId),
    currentReport,
    conversationMessageCount: Array.isArray(messages) ? messages.length : 0,
    captures: captures.map((capture, index) => ({
      index: index + 1,
      viewportId: capture.viewportId,
      studyInstanceUID: capture.studyInstanceUID,
      seriesInstanceUID: capture.seriesInstanceUID,
      seriesDescription: capture.seriesDescription,
      modality: capture.modality,
      capturedAt: capture.capturedAt,
      includeAnnotations: capture.includeAnnotations,
      width: capture.width,
      height: capture.height,
    })),
  };
}

function buildMessages(payload) {
  const systemPrompt = [
    'You are a medical imaging diagnostic conversation assistant.',
    'Primary evidence comes from the provided screenshots. Use structured metadata only as supporting context.',
    'The conversation is between a clinician and the assistant.',
    'Each reply must address the latest user question and also update the structured report snapshot.',
    'Do not claim findings that are not visible in the screenshots or explicit in the structured payload.',
    'Do not include patient identifiers, accession numbers, institution names, or clinician names.',
    'Keep the language conservative and note uncertainty when the screenshots are insufficient.',
    'The output language must be Simplified Chinese.',
    'Return strict JSON only with this shape:',
    '{"assistantMessage":"string","summary":"string","report":{"title":"string","examSummary":"string","findings":"string","impression":"string","recommendations":"string","manualReview":"string"},"draftMarkdown":"string","warnings":["string"]}',
    'Output exactly one compact JSON object on a single line.',
    'The first top-level key must be assistantMessage.',
    'assistantMessage must be a conversational reply for the clinician.',
    'report must always be a full report object, not partial fields.',
    'Do not wrap the JSON in markdown code fences or add any prefix/suffix text.',
    'draftMarkdown must contain these sections:',
    '## 检查摘要',
    '## 影像所见',
    '## 印象',
    '## 建议',
    '## 需人工确认',
  ].join('\n');

  const promptContext = buildPromptContext(payload);
  const conversationMessages = trimConversationMessages(payload.messages);
  const userContent = [
    {
      type: 'text',
      text: [
        '以下是当前多轮影像诊断会话的事实依据。',
        '截图为主要依据，结构化上下文仅作为辅助信息。',
        '如果已有当前报告快照，请在保留有效内容的基础上修订，不要无故丢失已确认信息。',
        '如果截图不足以支持明确结论，请在“需人工确认”中说明。',
        '结构化上下文如下：',
        JSON.stringify(promptContext, null, 2),
      ].join('\n\n'),
    },
  ];

  (payload.captures || []).forEach((capture, index) => {
    userContent.push({
      type: 'text',
      text: `关键截图 ${index + 1}: ${JSON.stringify(
        {
          viewportId: capture.viewportId,
          seriesDescription: capture.seriesDescription,
          modality: capture.modality,
          capturedAt: capture.capturedAt,
          width: capture.width,
          height: capture.height,
        },
        null,
        2
      )}`,
    });
    userContent.push({
      type: 'image_url',
      image_url: {
        url: capture.dataUrl,
      },
    });
  });

  return [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: userContent,
    },
    ...conversationMessages.map(message => ({
      role: message.role,
      content: message.content,
    })),
  ];
}

function shouldSendTemperature(config) {
  if (config.temperature === undefined) {
    return false;
  }

  if (config.provider === 'kimi' && /kimi-k2\.5/i.test(config.model)) {
    return false;
  }

  return true;
}

function buildModelRequestBody(payload, config, options = {}) {
  const body = {
    model: config.model,
    messages: buildMessages(payload),
  };

  if (options.stream) {
    body.stream = true;
  }

  if (shouldSendTemperature(config)) {
    body.temperature = config.temperature;
  }

  return body;
}

function parseSseBlock(rawBlock) {
  const lines = rawBlock.split(/\r?\n/);
  const dataLines = [];
  let eventName = 'message';

  lines.forEach(line => {
    if (!line || line.startsWith(':')) {
      return;
    }

    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim() || 'message';
      return;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  });

  if (!dataLines.length) {
    return null;
  }

  return {
    event: eventName,
    data: dataLines.join('\n'),
  };
}

async function readSseStream(stream, onEvent) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');

    let separatorIndex = buffer.indexOf('\n\n');
    while (separatorIndex !== -1) {
      const rawBlock = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const parsedEvent = parseSseBlock(rawBlock);
      if (parsedEvent) {
        await onEvent(parsedEvent);
      }

      separatorIndex = buffer.indexOf('\n\n');
    }
  }

  buffer += decoder.decode();
  const trailingEvent = parseSseBlock(buffer.trim());
  if (trailingEvent) {
    await onEvent(trailingEvent);
  }
}

function decodeJsonEscapeCharacter(value) {
  const escapeMap = {
    '"': '"',
    '\\': '\\',
    '/': '/',
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
  };

  return escapeMap[value] ?? value;
}

function extractAssistantMessagePrefix(rawContent) {
  if (!rawContent) {
    return {
      value: '',
      complete: false,
      found: false,
    };
  }

  const match = /"assistantMessage"\s*:\s*"/.exec(rawContent);
  if (!match) {
    return {
      value: '',
      complete: false,
      found: false,
    };
  }

  let index = match.index + match[0].length;
  let value = '';

  while (index < rawContent.length) {
    const char = rawContent[index];

    if (char === '"') {
      return {
        value,
        complete: true,
        found: true,
      };
    }

    if (char === '\\') {
      index += 1;
      if (index >= rawContent.length) {
        break;
      }

      const escapeToken = rawContent[index];
      if (escapeToken === 'u') {
        const unicodeDigits = rawContent.slice(index + 1, index + 5);
        if (!/^[0-9a-fA-F]{4}$/.test(unicodeDigits)) {
          break;
        }

        value += String.fromCharCode(parseInt(unicodeDigits, 16));
        index += 5;
        continue;
      }

      value += decodeJsonEscapeCharacter(escapeToken);
      index += 1;
      continue;
    }

    value += char;
    index += 1;
  }

  return {
    value,
    complete: false,
    found: true,
  };
}

function isTimeoutError(error) {
  if (!error) {
    return false;
  }

  return (
    error.name === 'TimeoutError' ||
    error.name === 'AbortError' ||
    error.code === 'UND_ERR_CONNECT_TIMEOUT' ||
    /aborted due to timeout/i.test(error.message || '') ||
    /timed out/i.test(error.message || '')
  );
}

function normalizeModelRequestError(error, config) {
  if (isTimeoutError(error)) {
    const timeoutError = new Error(
      `Upstream AI request timed out after ${config.timeoutMs}ms. Increase AI_TIMEOUT_MS or use a faster model.`
    );
    timeoutError.statusCode = 504;
    return timeoutError;
  }

  return error;
}

function createModelResponseError(responseData, statusCode) {
  const message =
    responseData.error?.message ||
    responseData.message ||
    `Model request failed with status ${statusCode}.`;
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function buildModelResultFromResponseData(responseData, config) {
  const content = responseData.choices?.[0]?.message?.content || '';
  const result = coerceModelResult(content);

  return {
    model: responseData.model || config.model,
    ...result,
  };
}

async function callModel(payload, config) {
  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
  let response;
  let responseText;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(config.timeoutMs),
      body: JSON.stringify(buildModelRequestBody(payload, config)),
    });
    responseText = await response.text();
  } catch (error) {
    throw normalizeModelRequestError(error, config);
  }

  const responseData = parseJsonResponseText(responseText);

  if (!response.ok) {
    throw createModelResponseError(responseData, response.status);
  }

  return buildModelResultFromResponseData(responseData, config);
}

async function openModelStream(payload, config) {
  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
  let response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      signal: AbortSignal.timeout(config.timeoutMs),
      body: JSON.stringify(buildModelRequestBody(payload, config, { stream: true })),
    });
  } catch (error) {
    throw normalizeModelRequestError(error, config);
  }

  if (!response.ok) {
    let responseText = '';

    try {
      responseText = await response.text();
    } catch (_error) {
      responseText = '';
    }

    const responseData = parseJsonResponseText(responseText);
    throw createModelResponseError(responseData, response.status);
  }

  return response;
}

async function callModelStream(payload, config, callbacks = {}) {
  const response = callbacks.streamResponse || (await openModelStream(payload, config));
  const onDelta = typeof callbacks.onDelta === 'function' ? callbacks.onDelta : () => {};
  const responseContentType = response.headers?.get?.('content-type') || '';
  let upstreamModel = config.model;
  let rawContent = '';
  let emittedAssistantMessage = '';

  if (!responseContentType.includes('text/event-stream')) {
    let responseText = '';

    try {
      responseText = await response.text();
    } catch (error) {
      throw normalizeModelRequestError(error, config);
    }

    const responseData = parseJsonResponseText(responseText);
    if (!response.ok) {
      throw createModelResponseError(responseData, response.status);
    }

    return buildModelResultFromResponseData(responseData, config);
  }

  if (!response.body) {
    const error = new Error('Upstream AI provider returned an empty stream body.');
    error.statusCode = 502;
    throw error;
  }

  try {
    await readSseStream(response.body, ({ data }) => {
      if (!data || data === '[DONE]') {
        return;
      }

      const chunk = parseJsonResponseText(data);
      upstreamModel = chunk.model || upstreamModel;
      const deltaContent = chunk.choices?.[0]?.delta?.content;

      if (typeof deltaContent !== 'string' || !deltaContent) {
        return;
      }

      rawContent += deltaContent;
      const assistantMessageState = extractAssistantMessagePrefix(rawContent);
      if (!assistantMessageState.found) {
        return;
      }

      const nextAssistantMessage = assistantMessageState.value;
      if (nextAssistantMessage.length <= emittedAssistantMessage.length) {
        return;
      }

      const nextDelta = nextAssistantMessage.slice(emittedAssistantMessage.length);
      emittedAssistantMessage = nextAssistantMessage;
      onDelta(nextDelta);
    });
  } catch (error) {
    throw normalizeModelRequestError(error, config);
  }

  const result = {
    model: upstreamModel || config.model,
    ...coerceModelResult(rawContent),
  };

  if (
    typeof result.assistantMessage === 'string' &&
    result.assistantMessage.length > emittedAssistantMessage.length
  ) {
    const finalDelta = result.assistantMessage.slice(emittedAssistantMessage.length);
    emittedAssistantMessage = result.assistantMessage;
    onDelta(finalDelta);
  }

  return result;
}

function ensureAiRequestAllowed(req, res, config, limiter) {
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
    return null;
  }

  if (!config.apiKey) {
    sendJson(res, 500, {
      requestId,
      error: {
        code: 'missing_api_key',
        message: 'AI_API_KEY is not configured for the local proxy.',
      },
    });
    return null;
  }

  return requestId;
}

function validateStudyContext(payload, requestId, res) {
  if (payload && payload.studyContext) {
    return true;
  }

  sendJson(res, 400, {
    requestId,
    error: {
      code: 'invalid_payload',
      message: 'studyContext is required.',
    },
  });
  return false;
}

function buildDefaultDraftMessages() {
  return [
    {
      role: 'user',
      content:
        '请基于当前影像图、测量结果和上下文生成中文初诊报告，并说明主要影像依据与不确定性。',
    },
  ];
}

function buildReportExportOptions(body, fallbackRequestId) {
  const payload = body && typeof body === 'object' ? body : {};

  validateCaptures(payload.captures, { required: false });

  const report = normalizeReportObject(payload.report || {});
  const summary = buildSummary(report, payload.summary);
  const documentMeta = normalizeReportExportDocumentMeta(payload.documentMeta || {});
  const studyDescription = documentMeta.studyDescription || toText(payload.studyDescription);

  return {
    report,
    summary,
    captures: Array.isArray(payload.captures) ? payload.captures.slice(0, MAX_CAPTURE_COUNT) : [],
    model: toText(payload.model),
    requestId: toText(payload.requestId, fallbackRequestId),
    studyDescription,
    documentMeta: {
      ...documentMeta,
      studyDescription,
    },
  };
}

async function handleAiChat(req, res, config, limiter) {
  const requestId = ensureAiRequestAllowed(req, res, config, limiter);
  if (!requestId) {
    return;
  }

  const body = await readJsonBody(req);
  const rawPayload = config.redactPhi ? redactPhiPayload(body) : body;
  const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};

  if (!validateStudyContext(payload, requestId, res)) {
    return;
  }

  validateCaptures(payload.captures);
  validateMessages(payload.messages);

  log(config, 'info', 'Generating AI chat response', {
    requestId,
    model: config.model,
    captures: payload.captures.length,
    messages: trimConversationMessages(payload.messages).length,
    measurements: Array.isArray(payload.measurements) ? payload.measurements.length : 0,
  });

  if (payload.stream === true) {
    const streamResponse = await openModelStream(payload, config);

    openSseStream(res);
    sendSseEvent(res, 'meta', {
      requestId,
      model: config.model,
    });

    try {
      const modelResult = await callModelStream(payload, config, {
        onDelta: delta => {
          if (!delta) {
            return;
          }

          sendSseEvent(res, 'delta', {
            delta,
          });
        },
        streamResponse,
      });

      sendSseEvent(res, 'result', {
        requestId,
        model: modelResult.model,
        assistantMessage: modelResult.assistantMessage,
        summary: modelResult.summary,
        report: modelResult.report,
        draftMarkdown: modelResult.draftMarkdown,
        warnings: buildWarnings(payload, modelResult.warnings),
      });
      sendSseEvent(res, 'done', {});
      closeSseStream(res);
      return;
    } catch (error) {
      const normalizedError = normalizeModelRequestError(error, config);

      log(config, 'error', 'AI chat stream failed', {
        requestId,
        message: normalizedError.message,
      });
      sendSseEvent(res, 'error', {
        code: 'ai_proxy_error',
        message: normalizedError.message || 'AI proxy request failed.',
      });
      closeSseStream(res);
      return;
    }
  }

  const modelResult = await callModel(payload, config);

  sendJson(res, 200, {
    requestId,
    model: modelResult.model,
    assistantMessage: modelResult.assistantMessage,
    summary: modelResult.summary,
    report: modelResult.report,
    warnings: buildWarnings(payload, modelResult.warnings),
  });
}

async function handleReportDraft(req, res, config, limiter) {
  const requestId = ensureAiRequestAllowed(req, res, config, limiter);
  if (!requestId) {
    return;
  }

  const body = await readJsonBody(req);
  const rawPayload = config.redactPhi ? redactPhiPayload(body) : body;
  const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};

  if (!validateStudyContext(payload, requestId, res)) {
    return;
  }

  validateCaptures(payload.captures);
  const chatPayload = {
    ...payload,
    messages:
      Array.isArray(payload.messages) && payload.messages.length
        ? payload.messages
        : buildDefaultDraftMessages(),
  };

  validateMessages(chatPayload.messages);

  log(config, 'info', 'Generating AI report draft', {
    requestId,
    model: config.model,
    captures: chatPayload.captures.length,
    messages: trimConversationMessages(chatPayload.messages).length,
    measurements: Array.isArray(chatPayload.measurements) ? chatPayload.measurements.length : 0,
  });

  const modelResult = await callModel(chatPayload, config);

  sendJson(res, 200, {
    requestId,
    model: modelResult.model,
    summary: modelResult.summary,
    report: modelResult.report,
    draftMarkdown: modelResult.draftMarkdown,
    warnings: buildWarnings(chatPayload, modelResult.warnings),
  });
}

async function handleReportExport(req, res) {
  const requestId = crypto.randomUUID();
  const body = await readJsonBody(req);
  const pdfBuffer = await renderReportPdfBuffer(buildReportExportOptions(body, requestId));
  const filename = buildPdfFilename();

  sendBinary(res, 200, pdfBuffer, {
    'Content-Type': 'application/pdf',
    'Content-Length': Buffer.byteLength(pdfBuffer),
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Access-Control-Expose-Headers': 'Content-Disposition, X-Request-Id',
    'X-Request-Id': requestId,
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

    if (req.method === 'POST' && url.pathname === '/api/ai/chat') {
      try {
        await handleAiChat(req, res, config, limiter);
      } catch (error) {
        log(config, 'error', 'AI chat failed', {
          message: error.message,
        });

        if (res.headersSent) {
          closeSseStream(res);
          return;
        }

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

    if (req.method === 'POST' && url.pathname === '/api/ai/report-draft') {
      try {
        await handleReportDraft(req, res, config, limiter);
      } catch (error) {
        log(config, 'error', 'AI report draft failed', {
          message: error.message,
        });

        if (res.headersSent) {
          closeSseStream(res);
          return;
        }

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

    if (req.method === 'POST' && url.pathname === '/api/ai/report-export') {
      try {
        await handleReportExport(req, res, config);
      } catch (error) {
        log(config, 'error', 'AI report export failed', {
          message: error.message,
        });

        if (res.headersSent) {
          closeSseStream(res);
          return;
        }

        sendJson(res, error.statusCode || 500, {
          requestId: crypto.randomUUID(),
          error: {
            code: 'ai_proxy_error',
            message: error.message || 'AI report export failed.',
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
  buildDraftMarkdown,
  buildMessages,
  buildDefaultDraftMessages,
  buildModelRequestBody,
  buildSummary,
  buildWarnings,
  coerceModelResult,
  createConfig,
  createServer,
  buildReportExportOptions,
  handleAiChat,
  handleReportDraft,
  handleReportExport,
  normalizeReportObject,
  normalizeReportExportDocumentMeta,
  redactPhiPayload,
  shouldSendTemperature,
  stripCodeFences,
  validateCaptures,
  validateMessages,
};

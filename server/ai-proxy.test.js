const http = require('http');
const {
  buildReportExportOptions,
  buildMessages,
  buildModelRequestBody,
  coerceModelResult,
  createConfig,
  createServer,
  shouldSendTemperature,
  validateCaptures,
  validateMessages,
} = require('./ai-proxy');
const { closeBrowser } = require('./render-report-pdf');
const nativeFetch = global.fetch;
const svgCaptureDataUrl = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="100%" height="100%" fill="#111827"/><circle cx="120" cy="120" r="62" fill="#22c55e"/><text x="210" y="132" fill="#ffffff" font-size="28">CT</text></svg>'
).toString('base64')}`;

function chunkString(value, size) {
  const chunks = [];

  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size));
  }

  return chunks;
}

function createMockStreamBody(chunks, options = {}) {
  let index = 0;

  return {
    getReader() {
      return {
        read: async () => {
          if (options.failAfterChunks !== undefined && index >= options.failAfterChunks) {
            throw new Error(options.errorMessage || 'stream broke');
          }

          if (index >= chunks.length) {
            return {
              done: true,
              value: undefined,
            };
          }

          const nextChunk = chunks[index];
          index += 1;

          return {
            done: false,
            value: Buffer.from(nextChunk, 'utf8'),
          };
        },
      };
    },
  };
}

function createStreamingModelResponse(modelContent, options = {}) {
  const model = options.model || 'test-model';
  const chunkSize = options.chunkSize || 24;
  const contentChunks = chunkString(modelContent, chunkSize);
  const sseChunks = contentChunks.map(
    contentChunk =>
      `data: ${JSON.stringify({
        model,
        choices: [
          {
            index: 0,
            delta: {
              content: contentChunk,
            },
            finish_reason: null,
          },
        ],
      })}\n\n`
  );

  if (options.includeDone !== false) {
    sseChunks.push('data: [DONE]\n\n');
  }

  return {
    ok: true,
    status: 200,
    headers: {
      get: headerName =>
        headerName && headerName.toLowerCase() === 'content-type'
          ? 'text/event-stream; charset=utf-8'
          : null,
    },
    body: createMockStreamBody(sseChunks, options),
  };
}

function parseSseResponseBody(bodyBuffer) {
  return bodyBuffer
    .toString('utf8')
    .split(/\r?\n\r?\n/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => {
      const lines = block.split(/\r?\n/);
      const eventLine = lines.find(line => line.startsWith('event:'));
      const dataLine = lines.find(line => line.startsWith('data:'));
      const rawData = dataLine ? dataLine.slice('data:'.length).trim() : '{}';

      return {
        event: eventLine ? eventLine.slice('event:'.length).trim() : 'message',
        data: JSON.parse(rawData),
      };
    });
}

function sendRequest(server, path, payload) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const request = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        },
        response => {
          const chunks = [];

          response.on('data', chunk => chunks.push(chunk));
          response.on('end', () => {
            server.close(() => {
              resolve({
                statusCode: response.statusCode,
                headers: response.headers,
                body: Buffer.concat(chunks),
              });
            });
          });
        }
      );

      request.on('error', error => {
        server.close(() => reject(error));
      });
      request.write(JSON.stringify(payload));
      request.end();
    });
  });
}

describe('ai-proxy helpers', () => {
  const payload = {
    studyContext: {
      StudyDescription: 'CT Chest',
    },
    activeViewport: {
      viewportId: 'viewport-1',
    },
    measurements: [],
    capturePolicy: {
      includeOverlays: true,
      phiRedaction: 'disabled',
    },
    messages: [
      {
        role: 'user',
        content: '请给出当前关键图的初诊报告。',
      },
    ],
    captures: [
      {
        viewportId: 'viewport-1',
        seriesDescription: 'Chest CT',
        modality: 'CT',
        capturedAt: '2026-04-14T10:00:00.000Z',
        width: 1600,
        height: 900,
        dataUrl: svgCaptureDataUrl,
      },
    ],
  };

  beforeEach(() => {
    delete process.env.AI_TIMEOUT_MS;
  });

  afterEach(() => {
    delete process.env.AI_PROVIDER;
    delete process.env.AI_MODEL;
    delete process.env.AI_BASE_URL;
    delete process.env.AI_API_KEY;
    delete process.env.AI_TEMPERATURE;
    delete process.env.AI_TIMEOUT_MS;
    global.fetch = nativeFetch;
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await closeBrowser();
  });

  it('defaults to kimi-compatible configuration', () => {
    delete process.env.AI_PROVIDER;
    delete process.env.AI_MODEL;
    delete process.env.AI_BASE_URL;
    delete process.env.AI_API_KEY;
    delete process.env.AI_TEMPERATURE;

    const config = createConfig();

    expect(config.provider).toBe('kimi');
    expect(config.baseUrl).toBe('https://api.moonshot.cn/v1');
    expect(config.model).toBe('moonshot-v1-8k-vision-preview');
    expect(config.timeoutMs).toBe(60000);
  });

  it('omits temperature for kimi-k2.5 models', () => {
    const config = createConfig({
      provider: 'kimi',
      model: 'kimi-k2.5',
      temperature: 0.6,
    });

    expect(shouldSendTemperature(config)).toBe(false);

    const body = buildModelRequestBody(payload, config);
    expect(body.temperature).toBeUndefined();
  });

  it('builds multimodal messages with image content parts and conversation history', () => {
    const messages = buildMessages(payload);
    const contextMessage = messages[1];

    expect(Array.isArray(contextMessage.content)).toBe(true);
    expect(contextMessage.content.some(item => item.type === 'image_url')).toBe(true);
    expect(contextMessage.content.some(item => item.type === 'text')).toBe(true);
    expect(messages[2]).toMatchObject({
      role: 'user',
      content: '请给出当前关键图的初诊报告。',
    });
  });

  it('coerces structured model responses into a normalized report', () => {
    const result = coerceModelResult(
      JSON.stringify({
        assistantMessage: '结合关键图，当前更倾向右肺下叶炎性小结节。',
        summary: '胸部 CT 平扫。',
        report: {
          title: '胸部 CT AI 草稿',
          examSummary: '胸部 CT 平扫。',
          findings: '右肺下叶见小结节。',
          impression: '考虑炎性结节。',
          recommendations: '建议结合随访。',
          manualReview: '需结合原始影像人工确认。',
        },
        warnings: ['注意截图仅供参考。'],
      })
    );

    expect(result.assistantMessage).toContain('右肺下叶炎性小结节');
    expect(result.summary).toBe('胸部 CT 平扫。');
    expect(result.report.title).toBe('胸部 CT AI 草稿');
    expect(result.draftMarkdown).toContain('## 影像所见');
    expect(result.warnings).toEqual(['注意截图仅供参考。']);
  });

  it('rejects empty capture lists', () => {
    expect(() => validateCaptures([])).toThrow('captures must contain 1 to 4 screenshots.');
  });

  it('rejects chat payloads that do not end with a user message', () => {
    expect(() =>
      validateMessages([
        { role: 'user', content: '先给出总结。' },
        { role: 'assistant', content: '已给出总结。' },
      ])
    ).toThrow('messages must end with a user message.');
  });

  it('serves /api/ai/chat with assistantMessage and report fields', async () => {
    global.fetch = jest.fn(async () => {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            model: 'test-model',
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    assistantMessage: '当前关键图提示右肺下叶小结节，建议结合随访。',
                    summary: '胸部 CT 平扫。',
                    report: {
                      title: '胸部 CT AI 草稿',
                      examSummary: '胸部 CT 平扫。',
                      findings: '右肺下叶见小结节。',
                      impression: '考虑炎性结节。',
                      recommendations: '建议三个月后复查。',
                      manualReview: '需结合原始薄层序列复核。',
                    },
                    warnings: ['截图仅覆盖部分层面。'],
                  }),
                },
              },
            ],
          }),
      };
    });

    const server = createServer({
      apiKey: 'test-key',
      baseUrl: 'http://example.com/v1',
      model: 'test-model',
      redactPhi: false,
    });
    const response = await sendRequest(server, '/api/ai/chat', payload);
    const json = JSON.parse(response.body.toString('utf8'));

    expect(response.statusCode).toBe(200);
    expect(json.assistantMessage).toContain('右肺下叶小结节');
    expect(json.report.impression).toBe('考虑炎性结节。');
    expect(json.warnings).toContain('截图仅覆盖部分层面。');
  });

  it('streams /api/ai/chat as SSE events when stream mode is requested', async () => {
    const modelContent = JSON.stringify({
      assistantMessage: '当前关键图提示右肺下叶小结节，建议结合随访。',
      summary: '胸部 CT 平扫。',
      report: {
        title: '胸部 CT AI 草稿',
        examSummary: '胸部 CT 平扫。',
        findings: '右肺下叶见小结节。',
        impression: '考虑炎性结节。',
        recommendations: '建议三个月后复查。',
        manualReview: '需结合原始薄层序列复核。',
      },
      draftMarkdown:
        '# 胸部 CT AI 草稿\n\n## 检查摘要\n胸部 CT 平扫。\n\n## 影像所见\n右肺下叶见小结节。\n\n## 印象\n考虑炎性结节。\n\n## 建议\n建议三个月后复查。\n\n## 需人工确认\n需结合原始薄层序列复核。',
      warnings: ['截图仅覆盖部分层面。'],
    });

    global.fetch = jest.fn(async () => createStreamingModelResponse(modelContent));

    const server = createServer({
      apiKey: 'test-key',
      baseUrl: 'http://example.com/v1',
      model: 'test-model',
      redactPhi: false,
    });
    const response = await sendRequest(server, '/api/ai/chat', {
      ...payload,
      stream: true,
    });
    const events = parseSseResponseBody(response.body);
    const deltaText = events
      .filter(event => event.event === 'delta')
      .map(event => event.data.delta)
      .join('');
    const resultEvent = events.find(event => event.event === 'result');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(events[0]).toMatchObject({
      event: 'meta',
      data: {
        model: 'test-model',
      },
    });
    expect(events.some(event => event.event === 'delta')).toBe(true);
    expect(resultEvent.data.assistantMessage).toBe(deltaText);
    expect(resultEvent.data.report.impression).toBe('考虑炎性结节。');
    expect(events[events.length - 1].event).toBe('done');
  });

  it('emits an SSE error event if the upstream stream breaks mid-response', async () => {
    const modelContent = JSON.stringify({
      assistantMessage: '当前关键图提示右肺下叶小结节，建议结合随访。',
      summary: '胸部 CT 平扫。',
      report: {
        title: '胸部 CT AI 草稿',
        examSummary: '胸部 CT 平扫。',
        findings: '右肺下叶见小结节。',
        impression: '考虑炎性结节。',
        recommendations: '建议三个月后复查。',
        manualReview: '需结合原始薄层序列复核。',
      },
      warnings: [],
    });

    global.fetch = jest.fn(async () =>
      createStreamingModelResponse(modelContent, {
        failAfterChunks: 2,
        errorMessage: 'upstream stream broke',
        includeDone: false,
      })
    );

    const server = createServer({
      apiKey: 'test-key',
      baseUrl: 'http://example.com/v1',
      model: 'test-model',
      redactPhi: false,
    });
    const response = await sendRequest(server, '/api/ai/chat', {
      ...payload,
      stream: true,
    });
    const events = parseSseResponseBody(response.body);

    expect(response.statusCode).toBe(200);
    expect(events.some(event => event.event === 'meta')).toBe(true);
    expect(events.some(event => event.event === 'error')).toBe(true);
    expect(events.find(event => event.event === 'error').data.message).toContain(
      'upstream stream broke'
    );
  });

  it('returns 504 when the upstream request times out', async () => {
    global.fetch = jest.fn(async () => {
      const timeoutError = new Error('The operation was aborted due to timeout');
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    });

    const server = createServer({
      apiKey: 'test-key',
      baseUrl: 'http://example.com/v1',
      model: 'test-model',
      redactPhi: false,
      timeoutMs: 45000,
    });
    const response = await sendRequest(server, '/api/ai/chat', payload);
    const json = JSON.parse(response.body.toString('utf8'));

    expect(response.statusCode).toBe(504);
    expect(json.error.message).toContain('timed out after 45000ms');
  });

  it('keeps documentMeta values for local PDF export while whitelisting fields', () => {
    const options = buildReportExportOptions(
      {
        report: {
          title: '胸部 CT AI 草稿',
          findings: '右肺下叶见小结节。',
        },
        summary: '胸部 CT 平扫。',
        captures: payload.captures,
        model: 'test-model',
        requestId: 'request-export-1',
        studyDescription: 'Should be replaced',
        documentMeta: {
          institutionName: '示例医院',
          patientName: 'Alice Example',
          patientSex: 'F',
          patientAge: '034Y',
          patientId: 'P-001',
          accessionNumber: 'ACC-001',
          studyDate: '2026-04-14',
          studyDescription: 'CT Chest',
          modality: 'CT',
          seriesDescription: 'Chest CT',
          PatientName: 'Should not survive',
        },
        ignored: {
          PatientName: 'Nope',
        },
      },
      'fallback-request'
    );

    expect(options.requestId).toBe('request-export-1');
    expect(options.documentMeta).toEqual({
      institutionName: '示例医院',
      patientName: 'Alice Example',
      patientSex: 'F',
      patientAge: '034Y',
      patientId: 'P-001',
      accessionNumber: 'ACC-001',
      studyDate: '2026-04-14',
      studyDescription: 'CT Chest',
      modality: 'CT',
      seriesDescription: 'Chest CT',
    });
    expect(options.studyDescription).toBe('CT Chest');
    expect(options.documentMeta.PatientName).toBeUndefined();
    expect(options.ignored).toBeUndefined();
  });

  it('serves /api/ai/report-export as a pdf download', async () => {
    const server = createServer({
      redactPhi: false,
    });
    const response = await sendRequest(server, '/api/ai/report-export', {
      report: {
        title: '胸部 CT AI 草稿',
        examSummary: '胸部 CT 平扫。',
        findings: '右肺下叶见小结节。',
        impression: '考虑炎性结节。',
        recommendations: '建议结合随访。',
        manualReview: '需结合原始影像人工确认。',
      },
      summary: '胸部 CT 平扫。',
      captures: payload.captures,
      model: 'test-model',
      requestId: 'request-123',
      studyDescription: 'CT Chest',
      documentMeta: {
        institutionName: '示例医院',
        patientName: 'Alice Example',
        patientSex: 'F',
        patientAge: '034Y',
        patientId: 'P-001',
        accessionNumber: 'ACC-001',
        studyDate: '2026-04-14',
        studyDescription: 'CT Chest',
        modality: 'CT',
        seriesDescription: 'Chest CT',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('study-ai-report-');
    expect(response.body.length).toBeGreaterThan(1000);
  }, 30000);

  it('serves /api/ai/report-export with documentMeta even when PHI redaction is enabled', async () => {
    const server = createServer();
    const response = await sendRequest(server, '/api/ai/report-export', {
      report: {
        title: '胸部 CT AI 草稿',
        examSummary: '胸部 CT 平扫。',
        findings: '右肺下叶见小结节。',
        impression: '考虑炎性结节。',
        recommendations: '建议结合随访。',
        manualReview: '需结合原始影像人工确认。',
      },
      summary: '胸部 CT 平扫。',
      captures: payload.captures,
      documentMeta: {
        institutionName: '示例医院',
        patientName: 'Alice Example',
        patientSex: 'F',
        patientAge: '034Y',
        patientId: 'P-001',
        accessionNumber: 'ACC-001',
        studyDate: '2026-04-14',
        studyDescription: 'CT Chest',
        modality: 'CT',
        seriesDescription: 'Chest CT',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.body.length).toBeGreaterThan(1000);
  }, 30000);
});

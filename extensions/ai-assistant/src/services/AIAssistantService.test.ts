import AIAssistantService, { EVENTS } from './AIAssistantService';

jest.mock('../utils/buildReportContext', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    studyContext: {
      StudyDescription: 'CT Chest',
    },
    activeViewport: {
      viewportId: 'viewport-1',
    },
    measurements: [],
  })),
}));

jest.mock('../utils/captureViewport', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../utils/exportReportPdf', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const nativeFetch = global.fetch;

function chunkString(value, size) {
  const chunks = [];

  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size));
  }

  return chunks;
}

function createMockStreamBody(chunks, options = {}) {
  let index = 0;
  const encoder = new TextEncoder();

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
            value: encoder.encode(nextChunk),
          };
        },
      };
    },
  };
}

function createStreamingResponse(payload, options = {}) {
  const assistantMessage =
    typeof payload.assistantMessage === 'string' ? payload.assistantMessage : '';
  const deltaChunks = chunkString(assistantMessage, options.chunkSize || 18);
  const sseChunks = deltaChunks.map(
    deltaChunk =>
      `event: delta\ndata: ${JSON.stringify({
        delta: deltaChunk,
      })}\n\n`
  );

  return {
    ok: true,
    status: 200,
    headers: {
      get: headerName =>
        headerName.toLowerCase() === 'content-type' ? 'text/event-stream; charset=utf-8' : null,
    },
    body: createMockStreamBody(
      [
        `event: meta\ndata: ${JSON.stringify({
          requestId: typeof payload.requestId === 'string' ? payload.requestId : 'request-123',
          model: typeof payload.model === 'string' ? payload.model : 'test-model',
        })}\n\n`,
        ...sseChunks,
        `event: result\ndata: ${JSON.stringify(payload)}\n\n`,
        'event: done\ndata: {}\n\n',
      ],
      options
    ),
  };
}

function createJsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    headers: {
      get: headerName =>
        headerName.toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : null,
    },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

function createService() {
  const service = new AIAssistantService({
    configuration: {
      endpoint: '/api/ai/chat',
    },
    servicesManager: {
      services: {},
    },
  });

  service['state'] = {
    ...service.getState(),
    captures: [
      {
        id: 'capture-1',
        dataUrl: 'data:image/png;base64,abc',
        width: 512,
        height: 512,
        viewportId: 'viewport-1',
        capturedAt: '2026-04-14T10:00:00.000Z',
        includeAnnotations: true,
      },
    ],
  };

  return service;
}

describe('AIAssistantService streaming chat', () => {
  beforeAll(() => {
    if (!global.CustomEvent) {
      global.CustomEvent = class CustomEvent {
        constructor(type, eventInitDict) {
          this.type = type;
          this.detail = eventInitDict?.detail;
        }
      };
    }

    if (!global.document) {
      global.document = {
        body: {
          dispatchEvent: jest.fn(),
        },
      };
    }
  });

  afterEach(() => {
    global.fetch = nativeFetch;
    jest.restoreAllMocks();
  });

  it('updates the assistant message incrementally while consuming an SSE response', async () => {
    const payload = {
      requestId: 'request-123',
      model: 'test-model',
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
    };
    const service = createService();
    const streamedValues = [];

    service.subscribe(EVENTS.STATE_CHANGED, nextState => {
      const assistantMessage = nextState.result?.assistantMessage;

      if (assistantMessage) {
        streamedValues.push(assistantMessage);
      }
    });

    global.fetch = jest.fn(async () => createStreamingResponse(payload, { chunkSize: 12 }));

    const result = await service.sendChatMessage('请给出当前关键图的初诊报告。');
    const state = service.getState();

    expect(result.assistantMessage).toBe(payload.assistantMessage);
    expect(streamedValues.some(value => value.length < payload.assistantMessage.length)).toBe(true);
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1].content).toBe(payload.assistantMessage);
    expect(state.result?.report?.impression).toBe('考虑炎性结节。');
    expect(state.requestId).toBe('request-123');
  });

  it('falls back to the JSON response path when streaming is unavailable', async () => {
    const payload = {
      requestId: 'request-456',
      model: 'test-model',
      assistantMessage: '请结合随访复核右肺下叶结节。',
      summary: '胸部 CT 平扫。',
      report: {
        title: '胸部 CT AI 草稿',
        examSummary: '胸部 CT 平扫。',
        findings: '右肺下叶见小结节。',
        impression: '考虑炎性结节。',
        recommendations: '建议结合随访。',
        manualReview: '需人工确认。',
      },
      warnings: [],
    };
    const service = createService();

    global.fetch = jest.fn(async () => createJsonResponse(payload));

    const result = await service.sendChatMessage('解释印象依据');

    expect(result.requestId).toBe('request-456');
    expect(result.assistantMessage).toBe(payload.assistantMessage);
    expect(service.getState().messages[1].content).toBe(payload.assistantMessage);
  });

  it('rolls back the pending assistant message if the stream fails', async () => {
    const payload = {
      requestId: 'request-789',
      model: 'test-model',
      assistantMessage: '当前关键图提示右肺下叶小结节，建议结合随访。',
      summary: '胸部 CT 平扫。',
      report: {
        title: '胸部 CT AI 草稿',
        examSummary: '胸部 CT 平扫。',
        findings: '右肺下叶见小结节。',
        impression: '考虑炎性结节。',
        recommendations: '建议结合随访。',
        manualReview: '需人工确认。',
      },
      warnings: [],
    };
    const service = createService();

    global.fetch = jest.fn(async () =>
      createStreamingResponse(payload, {
        chunkSize: 14,
        failAfterChunks: 3,
        errorMessage: 'stream broke',
      })
    );

    await expect(service.sendChatMessage('继续解释本次印象依据')).rejects.toThrow('stream broke');

    const state = service.getState();
    expect(state.chatStatus).toBe('error');
    expect(state.messages).toEqual([]);
    expect(state.result?.assistantMessage || '').toBe('');
  });
});

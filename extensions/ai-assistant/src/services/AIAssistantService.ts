import { PubSubService } from '@ohif/core';
import buildReportContext from '../utils/buildReportContext';
import buildExportDocumentMeta from '../utils/buildExportDocumentMeta';
import captureViewport, { AIAssistantCapture } from '../utils/captureViewport';
import exportReportPdf from '../utils/exportReportPdf';
import {
  AIAssistantStructuredReport,
  buildDraftMarkdown,
  buildSummary,
  normalizeStructuredReport,
} from '../utils/reportUtils';

const EVENTS = {
  STATE_CHANGED: 'event::aiAssistantService:stateChanged',
};

const MAX_CAPTURE_COUNT = 4;
const DEFAULT_CHAT_ENDPOINT = '/api/ai/chat';
const DEFAULT_EXPORT_ENDPOINT = '/api/ai/report-export';
const DEFAULT_DRAFT_PROMPT =
  '请基于当前关键图、测量结果和脱敏上下文生成中文初诊报告，并说明主要影像依据与不确定性。';

export type AIAssistantChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

export type AIAssistantResult = {
  requestId?: string;
  model?: string;
  assistantMessage?: string;
  summary?: string;
  report?: AIAssistantStructuredReport | null;
  draftMarkdown?: string;
  warnings?: string[];
};

type AIAssistantState = {
  chatStatus: 'idle' | 'loading' | 'success' | 'error';
  result: AIAssistantResult | null;
  error: string | null;
  requestId: string | null;
  updatedAt: number | null;
  captures: AIAssistantCapture[];
  messages: AIAssistantChatMessage[];
  exportStatus: 'idle' | 'exporting' | 'success' | 'error';
  exportError: string | null;
};

type ReportContextOptions = {
  studyInstanceUID?: string;
  viewportId?: string;
  locale?: string;
};

type GenerateReportDraftOptions = ReportContextOptions & {
  captures?: AIAssistantCapture[];
  prompt?: string;
};

type SendChatMessageOptions = GenerateReportDraftOptions;

type ExportContext = {
  studyContext?: {
    StudyDescription?: string;
  };
};

type AIAssistantStreamEvent = {
  event: string;
  data: Record<string, unknown>;
};

function createMessageId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `message-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createChatMessage(
  role: 'user' | 'assistant',
  content: string,
  createdAt = new Date().toISOString()
): AIAssistantChatMessage {
  return {
    id: createMessageId(),
    role,
    content,
    createdAt,
  };
}

function normalizeMessageText(value: unknown) {
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '';
}

function cloneResult(result: AIAssistantResult | null): AIAssistantResult | null {
  if (!result) {
    return null;
  }

  return {
    ...result,
    report: result.report ? { ...result.report } : null,
    warnings: [...(result.warnings || [])],
  };
}

function replaceMessageContent(
  messages: AIAssistantChatMessage[],
  messageId: string,
  content: string
): AIAssistantChatMessage[] {
  return messages.map(message =>
    message.id === messageId
      ? {
          ...message,
          content,
        }
      : message
  );
}

function parseSseBlock(rawBlock: string): AIAssistantStreamEvent | null {
  const lines = rawBlock.split(/\r?\n/);
  const dataLines: string[] = [];
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

  try {
    return {
      event: eventName,
      data: JSON.parse(dataLines.join('\n')),
    };
  } catch (_error) {
    return {
      event: eventName,
      data: {
        message: dataLines.join('\n'),
      },
    };
  }
}

class AIAssistantService extends PubSubService {
  public static readonly EVENTS = EVENTS;

  public static REGISTRATION = {
    name: 'aiAssistantService',
    create: ({ configuration = {}, servicesManager }) => {
      return new AIAssistantService({ configuration, servicesManager });
    },
  };

  public readonly EVENTS = EVENTS;
  public servicesManager: AppTypes.ServicesManager;
  public configuration: {
    endpoint: string;
    exportEndpoint: string;
    defaultDraftPrompt: string;
  };

  private state: AIAssistantState = {
    chatStatus: 'idle',
    result: null,
    error: null,
    requestId: null,
    updatedAt: null,
    captures: [],
    messages: [],
    exportStatus: 'idle',
    exportError: null,
  };

  constructor({
    configuration = {},
    servicesManager,
  }: {
    configuration?: {
      endpoint?: string;
      exportEndpoint?: string;
      defaultDraftPrompt?: string;
    };
    servicesManager: AppTypes.ServicesManager;
  }) {
    super(EVENTS);
    this.servicesManager = servicesManager;
    this.configuration = {
      endpoint: configuration.endpoint || DEFAULT_CHAT_ENDPOINT,
      exportEndpoint: configuration.exportEndpoint || DEFAULT_EXPORT_ENDPOINT,
      defaultDraftPrompt: configuration.defaultDraftPrompt || DEFAULT_DRAFT_PROMPT,
    };
  }

  public getState(): AIAssistantState {
    return {
      ...this.state,
      captures: [...this.state.captures],
      messages: [...this.state.messages],
      result: this.state.result
        ? {
            ...this.state.result,
            report: this.state.result.report ? { ...this.state.result.report } : null,
            warnings: [...(this.state.result.warnings || [])],
          }
        : null,
    };
  }

  public buildReportContext(options: ReportContextOptions = {}) {
    return buildReportContext(this.servicesManager, options);
  }

  public async captureActiveViewport(
    options: ReportContextOptions = {}
  ): Promise<AIAssistantCapture> {
    if (this.state.captures.length >= MAX_CAPTURE_COUNT) {
      throw new Error(`You can only keep up to ${MAX_CAPTURE_COUNT} key screenshots.`);
    }

    const capture = await captureViewport(this.servicesManager, options);

    this._setState({
      captures: [...this.state.captures, capture],
      error: null,
      exportStatus: 'idle',
      exportError: null,
    });

    return capture;
  }

  public removeCapture(captureId: string): void {
    this._setState({
      captures: this.state.captures.filter(capture => capture.id !== captureId),
      error: null,
      exportStatus: 'idle',
      exportError: null,
    });
  }

  public moveCapture(captureId: string, direction: -1 | 1): void {
    const captures = [...this.state.captures];
    const currentIndex = captures.findIndex(capture => capture.id === captureId);

    if (currentIndex === -1) {
      return;
    }

    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= captures.length) {
      return;
    }

    const [capture] = captures.splice(currentIndex, 1);
    captures.splice(nextIndex, 0, capture);

    this._setState({
      captures,
      error: null,
      exportStatus: 'idle',
      exportError: null,
    });
  }

  public async sendChatMessage(
    content: string,
    options: SendChatMessageOptions = {}
  ): Promise<AIAssistantResult> {
    const normalizedContent = normalizeMessageText(content);
    const captures = Array.isArray(options.captures) ? options.captures : this.state.captures;

    if (!normalizedContent) {
      throw new Error('Enter a message before sending it to the AI assistant.');
    }

    if (!captures.length) {
      throw new Error('Add 1 to 4 key screenshots before starting the AI diagnosis chat.');
    }

    const previousMessages = [...this.state.messages];
    const previousResult = cloneResult(this.state.result);
    const userMessage = createChatMessage('user', normalizedContent);
    const pendingAssistantMessage = createChatMessage('assistant', '');
    const nextMessages = [...previousMessages, userMessage];
    const context = this.buildReportContext(options);
    const payload = {
      ...context,
      contextVersion: 'v3',
      capturePolicy: {
        includeOverlays: true,
        phiRedaction: 'disabled',
      },
      captures,
      messages: nextMessages,
      reportState: this.state.result?.report || null,
      stream: true,
    };

    this._setState({
      chatStatus: 'loading',
      error: null,
      requestId: null,
      messages: [...nextMessages, pendingAssistantMessage],
      result: previousResult
        ? {
            ...previousResult,
            assistantMessage: '',
            requestId: undefined,
            warnings: [],
          }
        : {
            assistantMessage: '',
            summary: '',
            report: null,
            draftMarkdown: '',
            warnings: [],
          },
      exportStatus: 'idle',
      exportError: null,
    });

    try {
      const response = await fetch(this.configuration.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(payload),
      });

      const result = await this._resolveChatResponse(response, {
        pendingAssistantMessageId: pendingAssistantMessage.id,
      });
      const assistantContent = normalizeMessageText(result.assistantMessage);

      this._setState({
        chatStatus: 'success',
        result,
        error: null,
        requestId: result.requestId || null,
        messages: replaceMessageContent(
          [...nextMessages, pendingAssistantMessage],
          pendingAssistantMessage.id,
          assistantContent
        ),
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI chat request failed.';

      this._setState({
        chatStatus: 'error',
        error: message,
        messages: previousMessages,
        result: previousResult,
      });

      throw error;
    }
  }

  public async generateReportDraft(
    options: GenerateReportDraftOptions = {}
  ): Promise<AIAssistantResult> {
    return this.sendChatMessage(options.prompt || this.configuration.defaultDraftPrompt, options);
  }

  public clearDraft(): void {
    this._setState({
      chatStatus: 'idle',
      result: null,
      error: null,
      requestId: null,
      captures: [],
      messages: [],
      exportStatus: 'idle',
      exportError: null,
    });
  }

  public async exportPdf(): Promise<string> {
    if (!this.state.result?.report) {
      throw new Error('Generate an AI diagnosis before exporting the PDF report.');
    }

    this._setState({
      exportStatus: 'exporting',
      exportError: null,
    });

    try {
      const context = this.buildReportContext() as ExportContext;
      const documentMeta = buildExportDocumentMeta(this.servicesManager);
      const filename = await exportReportPdf({
        endpoint: this.configuration.exportEndpoint,
        report: this.state.result.report,
        summary: this.state.result.summary,
        captures: this.state.captures,
        model: this.state.result.model,
        requestId: this.state.result.requestId,
        studyDescription: documentMeta.studyDescription || context.studyContext?.StudyDescription,
        documentMeta,
      });

      this._setState({
        exportStatus: 'success',
        exportError: null,
      });

      return filename;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to export the PDF report.';

      this._setState({
        exportStatus: 'error',
        exportError: message,
      });

      throw error;
    }
  }

  public onModeExit(): void {
    this.clearDraft();
  }

  private _buildResultFromPayload(
    data: Record<string, unknown>,
    assistantFallback = ''
  ): AIAssistantResult {
    const report = normalizeStructuredReport(
      (data.report as Partial<AIAssistantStructuredReport> | null | undefined) || null
    );
    const summary = buildSummary(report, typeof data.summary === 'string' ? data.summary : '');
    const assistantContent =
      normalizeMessageText(data.assistantMessage) ||
      normalizeMessageText(assistantFallback) ||
      summary ||
      buildDraftMarkdown(report);

    return {
      requestId: typeof data.requestId === 'string' ? data.requestId : undefined,
      model: typeof data.model === 'string' ? data.model : undefined,
      assistantMessage: assistantContent,
      summary,
      report,
      draftMarkdown:
        typeof data.draftMarkdown === 'string' && data.draftMarkdown.trim()
          ? data.draftMarkdown
          : buildDraftMarkdown(report),
      warnings: Array.isArray(data.warnings) ? (data.warnings as string[]) : [],
    };
  }

  private async _resolveChatResponse(
    response: Response,
    options: {
      pendingAssistantMessageId: string;
    }
  ): Promise<AIAssistantResult> {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream') && response.body) {
      return this._consumeChatStream(response.body, options);
    }

    const data = await this._parseResponse(response);

    if (!response.ok) {
      throw new Error(data?.error?.message || 'AI chat request failed.');
    }

    return this._buildResultFromPayload(data);
  }

  private async _consumeChatStream(
    stream: ReadableStream<Uint8Array>,
    options: {
      pendingAssistantMessageId: string;
    }
  ): Promise<AIAssistantResult> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let streamedAssistantMessage = '';
    let finalResult: AIAssistantResult | null = null;

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
          if (parsedEvent.event === 'meta') {
            const nextResult: AIAssistantResult = cloneResult(this.state.result) || {};

            if (typeof parsedEvent.data.requestId === 'string') {
              nextResult.requestId = parsedEvent.data.requestId;
            }

            if (typeof parsedEvent.data.model === 'string') {
              nextResult.model = parsedEvent.data.model;
            }

            this._setState({
              requestId:
                typeof parsedEvent.data.requestId === 'string' ? parsedEvent.data.requestId : null,
              result: nextResult,
            });
          }

          if (parsedEvent.event === 'delta') {
            const delta = typeof parsedEvent.data.delta === 'string' ? parsedEvent.data.delta : '';

            if (delta) {
              streamedAssistantMessage += delta;

              this._setState({
                messages: replaceMessageContent(
                  this.state.messages,
                  options.pendingAssistantMessageId,
                  streamedAssistantMessage
                ),
                result: {
                  ...(cloneResult(this.state.result) || {}),
                  assistantMessage: streamedAssistantMessage,
                },
              });
            }
          }

          if (parsedEvent.event === 'result') {
            finalResult = this._buildResultFromPayload(parsedEvent.data, streamedAssistantMessage);
          }

          if (parsedEvent.event === 'error') {
            throw new Error(
              typeof parsedEvent.data.message === 'string'
                ? parsedEvent.data.message
                : 'AI chat request failed.'
            );
          }
        }

        separatorIndex = buffer.indexOf('\n\n');
      }
    }

    buffer += decoder.decode();
    const trailingEvent = parseSseBlock(buffer.trim());
    if (trailingEvent) {
      if (trailingEvent.event === 'result') {
        finalResult = this._buildResultFromPayload(trailingEvent.data, streamedAssistantMessage);
      }

      if (trailingEvent.event === 'error') {
        throw new Error(
          typeof trailingEvent.data.message === 'string'
            ? trailingEvent.data.message
            : 'AI chat request failed.'
        );
      }
    }

    if (!finalResult) {
      throw new Error('AI chat stream ended before the final result was received.');
    }

    return finalResult;
  }

  private async _parseResponse(response: Response) {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      return response.json();
    }

    const text = await response.text();

    try {
      return JSON.parse(text);
    } catch (_error) {
      return {
        error: {
          message: text || 'Unexpected response from AI proxy.',
        },
      };
    }
  }

  private _setState(nextState: Partial<AIAssistantState>) {
    this.state = {
      ...this.state,
      ...nextState,
      updatedAt: Date.now(),
    };

    this._broadcastEvent(EVENTS.STATE_CHANGED, this.getState());
  }
}

export { EVENTS };
export default AIAssistantService;

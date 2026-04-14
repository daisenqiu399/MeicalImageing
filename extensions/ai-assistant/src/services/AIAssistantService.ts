import { PubSubService } from '@ohif/core';
import buildReportContext from '../utils/buildReportContext';

const EVENTS = {
  STATE_CHANGED: 'event::aiAssistantService:stateChanged',
};

type AIAssistantResult = {
  requestId?: string;
  model?: string;
  summary?: string;
  draftMarkdown?: string;
  warnings?: string[];
};

type AIAssistantState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  result: AIAssistantResult | null;
  error: string | null;
  requestId: string | null;
  updatedAt: number | null;
};

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
  };

  private state: AIAssistantState = {
    status: 'idle',
    result: null,
    error: null,
    requestId: null,
    updatedAt: null,
  };

  constructor({ configuration = {}, servicesManager }) {
    super(EVENTS);
    this.servicesManager = servicesManager;
    this.configuration = {
      endpoint: configuration.endpoint || '/api/ai/report-draft',
    };
  }

  public getState(): AIAssistantState {
    return { ...this.state };
  }

  public buildReportContext(options = {}) {
    return buildReportContext(this.servicesManager, options);
  }

  public async generateReportDraft(options = {}): Promise<AIAssistantResult> {
    const payload = this.buildReportContext(options);

    this._setState({
      status: 'loading',
      error: null,
      result: null,
      requestId: null,
    });

    try {
      const response = await fetch(this.configuration.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await this._parseResponse(response);

      if (!response.ok) {
        throw new Error(data?.error?.message || 'AI report draft request failed.');
      }

      const result = {
        requestId: data.requestId,
        model: data.model,
        summary: data.summary,
        draftMarkdown: data.draftMarkdown,
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
      };

      this._setState({
        status: 'success',
        result,
        error: null,
        requestId: result.requestId || null,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI report draft request failed.';

      this._setState({
        status: 'error',
        result: null,
        error: message,
      });

      throw error;
    }
  }

  public clearDraft(): void {
    this._setState({
      status: 'idle',
      result: null,
      error: null,
      requestId: null,
    });
  }

  public onModeExit(): void {
    this.clearDraft();
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

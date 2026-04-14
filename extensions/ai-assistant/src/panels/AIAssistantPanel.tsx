import React, { useEffect, useRef, useState } from 'react';
import { DicomMetadataStore, useSystem } from '@ohif/core';
import { buildPlainTextReport } from '../utils/reportUtils';

function useAIAssistantState(aiAssistantService) {
  const [state, setState] = useState(() =>
    aiAssistantService
      ? aiAssistantService.getState()
      : {
          chatStatus: 'idle',
          result: null,
          error: null,
          requestId: null,
          updatedAt: null,
          captures: [],
          messages: [],
          exportStatus: 'idle',
          exportError: null,
        }
  );

  useEffect(() => {
    if (!aiAssistantService) {
      return undefined;
    }

    setState(aiAssistantService.getState());

    const subscription = aiAssistantService.subscribe(
      aiAssistantService.EVENTS.STATE_CHANGED,
      nextState => {
        setState(nextState);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [aiAssistantService]);

  return state;
}

function useContextPreview(aiAssistantService, servicesManager) {
  const { measurementService, viewportGridService, displaySetService } = servicesManager.services;
  const getPreviewSnapshot = () => {
    if (!aiAssistantService) {
      return null;
    }

    try {
      return aiAssistantService.buildReportContext();
    } catch (_error) {
      return null;
    }
  };
  const [preview, setPreview] = useState(() => getPreviewSnapshot());

  useEffect(() => {
    if (!aiAssistantService) {
      return undefined;
    }

    const updatePreview = () => {
      setPreview(getPreviewSnapshot());
    };

    updatePreview();

    const subscriptions = [
      viewportGridService.subscribe(
        viewportGridService.EVENTS.ACTIVE_VIEWPORT_ID_CHANGED,
        updatePreview
      ),
      viewportGridService.subscribe(viewportGridService.EVENTS.GRID_STATE_CHANGED, updatePreview),
      displaySetService.subscribe(displaySetService.EVENTS.DISPLAY_SETS_ADDED, updatePreview),
      displaySetService.subscribe(displaySetService.EVENTS.DISPLAY_SETS_CHANGED, updatePreview),
      displaySetService.subscribe(displaySetService.EVENTS.DISPLAY_SETS_REMOVED, updatePreview),
      measurementService.subscribe(measurementService.EVENTS.MEASUREMENT_ADDED, updatePreview),
      measurementService.subscribe(measurementService.EVENTS.RAW_MEASUREMENT_ADDED, updatePreview),
      measurementService.subscribe(measurementService.EVENTS.MEASUREMENT_UPDATED, updatePreview),
      measurementService.subscribe(measurementService.EVENTS.MEASUREMENT_REMOVED, updatePreview),
      measurementService.subscribe(measurementService.EVENTS.MEASUREMENTS_CLEARED, updatePreview),
      DicomMetadataStore.subscribe(DicomMetadataStore.EVENTS.SERIES_ADDED, updatePreview),
      DicomMetadataStore.subscribe(DicomMetadataStore.EVENTS.INSTANCES_ADDED, updatePreview),
    ];

    return () => {
      subscriptions.forEach(subscription => subscription.unsubscribe());
    };
  }, [aiAssistantService, displaySetService, measurementService, viewportGridService]);

  return preview;
}

async function copyToClipboard(text: string) {
  if (!text) {
    return;
  }

  if (!navigator.clipboard?.writeText) {
    throw new Error('当前浏览器不支持剪贴板访问。');
  }

  await navigator.clipboard.writeText(text);
}

function formatMessageTimestamp(value?: string) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString();
}

function ReportSection({
  title,
  value,
  emptyText = '等待 AI 输出。',
}: {
  title: string;
  value?: string;
  emptyText?: string;
}) {
  return (
    <div className="rounded border border-white/10 bg-black/20 p-3">
      <div className="text-xs uppercase tracking-wide text-white/50">{title}</div>
      <div className="text-white/85 mt-2 whitespace-pre-wrap text-sm leading-6">
        {value || emptyText}
      </div>
    </div>
  );
}

function MessageBubble({ message }) {
  const isAssistant = message.role === 'assistant';

  return (
    <div className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[92%] rounded-2xl px-3 py-2 ${
          isAssistant
            ? 'text-white/85 border border-white/10 bg-black/30'
            : 'bg-primary-main text-black'
        }`}
      >
        <div
          className={`text-[11px] uppercase tracking-wide ${isAssistant ? 'text-white/45' : 'text-black/60'}`}
        >
          {isAssistant ? 'AI' : '你'}
        </div>
        <div className="mt-1 whitespace-pre-wrap text-sm leading-6">{message.content}</div>
        <div className={`mt-2 text-[10px] ${isAssistant ? 'text-white/35' : 'text-black/55'}`}>
          {formatMessageTimestamp(message.createdAt)}
        </div>
      </div>
    </div>
  );
}

export default function AIAssistantPanel() {
  const { servicesManager } = useSystem();
  const { aiAssistantService, uiNotificationService } = servicesManager.services;
  const state = useAIAssistantState(aiAssistantService);
  const preview = useContextPreview(aiAssistantService, servicesManager);
  const [messageInput, setMessageInput] = useState('');
  const conversationRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!conversationRef.current) {
      return;
    }

    conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [state.updatedAt]);

  if (!aiAssistantService) {
    return <div className="p-4 text-sm text-white/80">当前模式未启用 AI 诊断服务。</div>;
  }

  const measurementCount = preview?.measurements?.length || 0;
  const studyDescription = preview?.studyContext?.StudyDescription || '未命名检查';
  const seriesCount = preview?.studyContext?.numberOfSeries || 0;
  const activeSeriesLabel =
    preview?.activeViewport?.displaySets?.[0]?.SeriesDescription ||
    preview?.activeViewport?.displaySets?.[0]?.displaySetLabel ||
    '当前无活动序列';
  const copyText = buildPlainTextReport(state.result?.report, state.result?.summary || '');
  const isChatLoading = state.chatStatus === 'loading';
  const isExportLoading = state.exportStatus === 'exporting';

  const handleCapture = async () => {
    try {
      await aiAssistantService.captureActiveViewport();
      uiNotificationService.show({
        title: 'AI 诊断',
        message: '已将当前视口添加为关键截图。',
        type: 'success',
      });
    } catch (error) {
      uiNotificationService.show({
        title: 'AI 诊断',
        message: error instanceof Error ? error.message : '添加关键截图失败。',
        type: 'error',
      });
    }
  };

  const handleGenerate = async () => {
    try {
      await aiAssistantService.generateReportDraft();
    } catch (error) {
      uiNotificationService.show({
        title: 'AI 诊断',
        message: error instanceof Error ? error.message : '生成 AI 诊断失败。',
        type: 'error',
      });
    }
  };

  const handleSendMessage = async (content = messageInput) => {
    const normalizedContent = content.trim();

    if (!normalizedContent) {
      return;
    }

    try {
      await aiAssistantService.sendChatMessage(normalizedContent);
      setMessageInput('');
    } catch (error) {
      uiNotificationService.show({
        title: 'AI 诊断',
        message: error instanceof Error ? error.message : '发送 AI 消息失败。',
        type: 'error',
      });
    }
  };

  const handleCopyDraft = async () => {
    try {
      await copyToClipboard(copyText);
      uiNotificationService.show({
        title: 'AI 诊断',
        message: '报告文本已复制到剪贴板。',
        type: 'success',
      });
    } catch (error) {
      uiNotificationService.show({
        title: 'AI 诊断',
        message: error instanceof Error ? error.message : '复制到剪贴板失败。',
        type: 'error',
      });
    }
  };

  const handleExportPdf = async () => {
    try {
      const filename = await aiAssistantService.exportPdf();
      uiNotificationService.show({
        title: 'AI 诊断',
        message: `${filename} 已成功下载。`,
        type: 'success',
      });
    } catch (error) {
      uiNotificationService.show({
        title: 'AI 诊断',
        message: error instanceof Error ? error.message : '导出 PDF 报告失败。',
        type: 'error',
      });
    }
  };

  const handleClear = () => {
    aiAssistantService.clearDraft();
    setMessageInput('');
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-3 text-sm">
      <div className="rounded border border-white/10 bg-black/20 p-3">
        <div className="text-xs uppercase tracking-wide text-white/50">AI 诊断对话</div>
        <div className="mt-2 text-sm font-medium text-white">{studyDescription}</div>
        <div className="mt-2 space-y-1 text-xs text-white/70">
          <div>{`检查序列数：${seriesCount}`}</div>
          <div>{`当前序列：${activeSeriesLabel}`}</div>
          <div>{`上下文测量数：${measurementCount}`}</div>
          <div>{`已选关键截图：${state.captures.length}/4`}</div>
          <div>{`当前会话消息数：${state.messages.length}`}</div>
        </div>
      </div>

      <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs leading-5 text-red-100">
        当前截图会保留屏幕叠加层、标注以及任何可见标识信息。向院外发送前请先人工复核。
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="bg-primary-main rounded px-3 py-2 text-xs font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleCapture}
          disabled={state.captures.length >= 4 || isChatLoading}
        >
          添加关键图
        </button>
        <button
          type="button"
          className="border-white/15 rounded border px-3 py-2 text-xs text-white/80 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleGenerate}
          disabled={isChatLoading || state.captures.length === 0}
        >
          {isChatLoading ? '生成中...' : '生成诊断'}
        </button>
        <button
          type="button"
          className="border-white/15 rounded border px-3 py-2 text-xs text-white/80 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleCopyDraft}
          disabled={!state.result?.draftMarkdown}
        >
          复制报告
        </button>
        <button
          type="button"
          className="border-white/15 rounded border px-3 py-2 text-xs text-white/80 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleExportPdf}
          disabled={!state.result?.report || isExportLoading}
        >
          {isExportLoading ? '导出 PDF 中...' : '导出 PDF'}
        </button>
        <button
          type="button"
          className="border-white/15 rounded border px-3 py-2 text-xs text-white/80"
          onClick={handleClear}
        >
          清空会话
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-3">
          <div className="rounded border border-white/10 bg-black/20 p-3">
            <div className="text-xs uppercase tracking-wide text-white/50">关键截图</div>
            {state.captures.length ? (
              <div className="mt-3 grid grid-cols-1 gap-3">
                {state.captures.map((capture, index) => (
                  <div
                    key={capture.id}
                    className="rounded border border-white/10 bg-black/30 p-3"
                  >
                    <img
                      src={capture.dataUrl}
                      alt={`关键截图 ${index + 1}`}
                      className="h-36 w-full rounded object-cover"
                    />
                    <div className="mt-2 text-xs text-white/70">
                      <div>{`#${index + 1} ${capture.seriesDescription || '未命名序列'}`}</div>
                      <div>{`${capture.modality || '未知模态'} | ${new Date(
                        capture.capturedAt
                      ).toLocaleString()}`}</div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        className="border-white/15 rounded border px-2 py-1 text-[11px] text-white/80 disabled:opacity-40"
                        onClick={() => aiAssistantService.moveCapture(capture.id, -1)}
                        disabled={index === 0}
                      >
                        左移
                      </button>
                      <button
                        type="button"
                        className="border-white/15 rounded border px-2 py-1 text-[11px] text-white/80 disabled:opacity-40"
                        onClick={() => aiAssistantService.moveCapture(capture.id, 1)}
                        disabled={index === state.captures.length - 1}
                      >
                        右移
                      </button>
                      <button
                        type="button"
                        className="rounded border border-red-500/30 px-2 py-1 text-[11px] text-red-200"
                        onClick={() => aiAssistantService.removeCapture(capture.id)}
                      >
                        移除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-xs text-white/60">
                开始诊断对话前，请先添加 1 到 4 张当前视口关键截图。
              </div>
            )}
          </div>

          <div className="rounded border border-white/10 bg-black/20 p-3">
            <div className="text-xs uppercase tracking-wide text-white/50">对话</div>
            <div
              ref={conversationRef}
              className="mt-3 max-h-[320px] space-y-3 overflow-y-auto rounded border border-white/10 bg-black/30 p-3"
            >
              {state.messages.length ? (
                state.messages.map(message => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                  />
                ))
              ) : (
                <div className="text-xs leading-6 text-white/60">
                  请先添加关键截图，然后再提问，例如“请给出初诊报告”、“重点说明肺结节依据”或
                  “根据这张补充关键图修订印象”。
                </div>
              )}
              {isChatLoading ? (
                <div className="rounded border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/60">
                  AI 正在结合当前关键截图和上下文进行分析...
                </div>
              ) : null}
            </div>

            <div className="mt-3 rounded border border-white/10 bg-black/30 p-3">
              <textarea
                value={messageInput}
                onChange={event => setMessageInput(event.target.value)}
                onKeyDown={event => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault();
                    handleSendMessage();
                  }
                }}
                className="border-white/15 placeholder:text-white/35 min-h-[88px] w-full resize-y rounded border bg-black/20 px-3 py-2 text-sm text-white outline-none"
                placeholder="继续追问当前影像，例如：请解释本次印象的主要依据。"
                disabled={isChatLoading}
              />
              <div className="text-white/45 mt-2 flex items-center justify-between gap-3 text-[11px]">
                <div>按 Ctrl/Cmd + Enter 发送。</div>
                <button
                  type="button"
                  className="bg-primary-main rounded px-3 py-2 text-xs font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => handleSendMessage()}
                  disabled={isChatLoading || !messageInput.trim() || state.captures.length === 0}
                >
                  发送消息
                </button>
              </div>
            </div>
          </div>

          {state.error ? (
            <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100">
              {state.error}
            </div>
          ) : null}

          {state.exportError ? (
            <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100">
              {state.exportError}
            </div>
          ) : null}

          {state.result?.warnings?.length ? (
            <div className="rounded border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-100">
              {state.result.warnings.map(warning => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          ) : null}

          <ReportSection
            title="对话摘要"
            value={state.result?.assistantMessage || state.result?.summary || '暂无 AI 回复。'}
            emptyText="暂无 AI 回复。"
          />
          <ReportSection
            title="检查摘要"
            value={state.result?.report?.examSummary}
          />
          <ReportSection
            title="影像所见"
            value={state.result?.report?.findings}
          />
          <ReportSection
            title="印象"
            value={state.result?.report?.impression}
          />
          <ReportSection
            title="建议"
            value={state.result?.report?.recommendations}
          />
          <ReportSection
            title="需人工确认"
            value={state.result?.report?.manualReview}
          />

          {state.result?.model || state.result?.requestId ? (
            <div className="rounded border border-white/10 bg-black/20 p-3 text-[11px] text-white/40">
              <div>{`模型：${state.result?.model || '未知'}`}</div>
              <div>{`请求：${state.result?.requestId || '未知'}`}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

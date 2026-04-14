import React, { useEffect, useState } from 'react';
import { DicomMetadataStore, useSystem } from '@ohif/core';

function useAIAssistantState(aiAssistantService) {
  const [state, setState] = useState(() =>
    aiAssistantService
      ? aiAssistantService.getState()
      : {
          status: 'idle',
          result: null,
          error: null,
          requestId: null,
          updatedAt: null,
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
      viewportGridService.subscribe(viewportGridService.EVENTS.ACTIVE_VIEWPORT_ID_CHANGED, updatePreview),
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

  await navigator.clipboard.writeText(text);
}

export default function AIAssistantPanel() {
  const { servicesManager } = useSystem();
  const { aiAssistantService, uiNotificationService } = servicesManager.services;
  const state = useAIAssistantState(aiAssistantService);
  const preview = useContextPreview(aiAssistantService, servicesManager);

  if (!aiAssistantService) {
    return (
      <div className="p-4 text-sm text-white/80">
        AI assistant service is not available in the current mode.
      </div>
    );
  }
  const measurementCount = preview?.measurements?.length || 0;
  const studyDescription = preview?.studyContext?.StudyDescription || 'Unnamed study';
  const seriesCount = preview?.studyContext?.numberOfSeries || 0;
  const activeSeriesLabel =
    preview?.activeViewport?.displaySets?.[0]?.SeriesDescription ||
    preview?.activeViewport?.displaySets?.[0]?.displaySetLabel ||
    'No active series';

  const handleGenerate = async () => {
    try {
      await aiAssistantService.generateReportDraft();
    } catch (error) {
      uiNotificationService.show({
        title: 'AI Report Draft',
        message: error instanceof Error ? error.message : 'Failed to generate AI draft.',
        type: 'error',
      });
    }
  };

  const handleCopyDraft = async () => {
    try {
      await copyToClipboard(state.result?.draftMarkdown || '');
      uiNotificationService.show({
        title: 'AI Report Draft',
        message: 'Draft copied to clipboard.',
        type: 'success',
      });
    } catch (_error) {
      uiNotificationService.show({
        title: 'AI Report Draft',
        message: 'Clipboard access failed.',
        type: 'error',
      });
    }
  };

  const handleClear = () => {
    aiAssistantService.clearDraft();
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-sm">
      <div className="rounded border border-white/10 bg-black/20 p-3">
        <div className="text-xs uppercase tracking-wide text-white/50">AI Report Draft</div>
        <div className="mt-2 text-sm font-medium text-white">{studyDescription}</div>
        <div className="mt-2 space-y-1 text-xs text-white/70">
          <div>{`Series in study: ${seriesCount}`}</div>
          <div>{`Current series: ${activeSeriesLabel}`}</div>
          <div>{`Measurements in context: ${measurementCount}`}</div>
        </div>
        <div className="mt-3 text-xs text-white/60">
          Uses metadata plus measurements only. No image pixels are sent to the model.
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="rounded bg-primary-main px-3 py-2 text-xs font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleGenerate}
          disabled={state.status === 'loading'}
        >
          {state.status === 'loading' ? 'Generating...' : 'Generate Draft'}
        </button>
        <button
          type="button"
          className="rounded border border-white/15 px-3 py-2 text-xs text-white/80 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleCopyDraft}
          disabled={!state.result?.draftMarkdown}
        >
          Copy Draft
        </button>
        <button
          type="button"
          className="rounded border border-white/15 px-3 py-2 text-xs text-white/80"
          onClick={handleClear}
        >
          Clear
        </button>
      </div>

      {state.error ? (
        <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100">
          {state.error}
        </div>
      ) : null}

      {state.result?.warnings?.length ? (
        <div className="rounded border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-100">
          {state.result.warnings.map(warning => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}

      <div className="rounded border border-white/10 bg-black/20 p-3">
        <div className="text-xs uppercase tracking-wide text-white/50">Summary</div>
        <div className="mt-2 whitespace-pre-wrap text-sm text-white/85">
          {state.result?.summary || 'No AI summary yet.'}
        </div>
      </div>

      <div className="rounded border border-white/10 bg-black/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs uppercase tracking-wide text-white/50">Draft Markdown</div>
          {state.result?.requestId ? (
            <div className="text-[11px] text-white/40">{`Request ${state.result.requestId}`}</div>
          ) : null}
        </div>
        <textarea
          className="mt-2 min-h-[260px] w-full resize-y rounded border border-white/10 bg-black/30 p-3 text-xs leading-6 text-white/85 outline-none"
          readOnly
          value={state.result?.draftMarkdown || ''}
        />
        {state.result?.model ? (
          <div className="mt-2 text-[11px] text-white/40">{`Model: ${state.result.model}`}</div>
        ) : null}
      </div>
    </div>
  );
}

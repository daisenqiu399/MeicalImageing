import html2canvas from 'html2canvas';

const DEFAULT_MAX_EDGE = 1600;

export type AIAssistantCapture = {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
  viewportId: string;
  studyInstanceUID?: string;
  seriesInstanceUID?: string;
  seriesDescription?: string;
  modality?: string;
  capturedAt: string;
  includeAnnotations: boolean;
};

function createCaptureId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `capture-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function resizeCanvas(sourceCanvas: HTMLCanvasElement, maxEdge: number) {
  const longestEdge = Math.max(sourceCanvas.width, sourceCanvas.height);

  if (!longestEdge || longestEdge <= maxEdge) {
    return sourceCanvas;
  }

  const scale = maxEdge / longestEdge;
  const targetCanvas = document.createElement('canvas');
  targetCanvas.width = Math.max(1, Math.round(sourceCanvas.width * scale));
  targetCanvas.height = Math.max(1, Math.round(sourceCanvas.height * scale));

  const context = targetCanvas.getContext('2d');
  if (!context) {
    return sourceCanvas;
  }

  context.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);

  return targetCanvas;
}

function getViewportCaptureElement(viewportId: string): HTMLElement | null {
  const viewportElement = document.querySelector(`[data-viewportid="${viewportId}"]`) as
    | HTMLElement
    | null;

  if (!viewportElement) {
    return null;
  }

  return (
    (viewportElement.closest('[data-cy="viewport-pane"]') as HTMLElement | null) || viewportElement
  );
}

export default async function captureViewport(
  servicesManager,
  options: {
    viewportId?: string;
    maxEdge?: number;
  } = {}
): Promise<AIAssistantCapture> {
  const { viewportGridService, displaySetService } = servicesManager.services;
  const viewportId = options.viewportId || viewportGridService.getActiveViewportId();

  if (!viewportId) {
    throw new Error('No active viewport is available for capture.');
  }

  const captureElement = getViewportCaptureElement(viewportId);
  if (!captureElement) {
    throw new Error('Unable to locate the active viewport on screen.');
  }

  const viewportState = viewportGridService.getState()?.viewports?.get(viewportId);
  const displaySetInstanceUIDs = viewportState?.displaySetInstanceUIDs || [];
  const primaryDisplaySet = displaySetInstanceUIDs
    .map(uid => displaySetService.getDisplaySetByUID(uid))
    .filter(Boolean)[0];

  const canvas = await html2canvas(captureElement, {
    backgroundColor: '#000000',
    logging: false,
    scale: Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2),
    useCORS: true,
  });
  const normalizedCanvas = resizeCanvas(canvas, options.maxEdge || DEFAULT_MAX_EDGE);

  return {
    id: createCaptureId(),
    dataUrl: normalizedCanvas.toDataURL('image/png'),
    width: normalizedCanvas.width,
    height: normalizedCanvas.height,
    viewportId,
    studyInstanceUID: primaryDisplaySet?.StudyInstanceUID,
    seriesInstanceUID: primaryDisplaySet?.SeriesInstanceUID,
    seriesDescription: primaryDisplaySet?.SeriesDescription || primaryDisplaySet?.displaySetLabel,
    modality: primaryDisplaySet?.Modality,
    capturedAt: new Date().toISOString(),
    includeAnnotations: true,
  };
}

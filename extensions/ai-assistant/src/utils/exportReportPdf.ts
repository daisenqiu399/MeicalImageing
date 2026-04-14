import {
  AIAssistantStructuredReport,
  buildSummary,
  normalizeStructuredReport,
} from './reportUtils';
import { AIAssistantCapture } from './captureViewport';

const DEFAULT_EXPORT_ENDPOINT = '/api/ai/report-export';

type ExportReportPdfOptions = {
  endpoint?: string;
  report?: Partial<AIAssistantStructuredReport> | null;
  summary?: string;
  captures?: AIAssistantCapture[];
  model?: string;
  requestId?: string;
  studyDescription?: string;
};

function formatTimestampForFile(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}`;
}

export function buildPdfFilename(date = new Date()) {
  return `study-ai-report-${formatTimestampForFile(date)}.pdf`;
}

function parseFilenameFromHeader(headerValue?: string | null) {
  if (!headerValue) {
    return '';
  }

  const encodedMatch = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch (_error) {
      return encodedMatch[1];
    }
  }

  const plainMatch = headerValue.match(/filename="?([^"]+)"?/i);
  return plainMatch?.[1] || '';
}

async function readErrorMessage(response: Response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const json = await response.json();
    return json?.error?.message || 'Failed to export the PDF report.';
  }

  const text = await response.text();
  return text || 'Failed to export the PDF report.';
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default async function exportReportPdf(options: ExportReportPdfOptions) {
  const report = normalizeStructuredReport(options.report);
  const summary = buildSummary(report, options.summary);
  const response = await fetch(options.endpoint || DEFAULT_EXPORT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      report,
      summary,
      captures: options.captures || [],
      model: options.model,
      requestId: options.requestId,
      studyDescription: options.studyDescription,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const blob = await response.blob();
  const filename =
    parseFilenameFromHeader(response.headers.get('content-disposition')) || buildPdfFilename();

  triggerDownload(blob, filename);
  return filename;
}

export const DEFAULT_REPORT_TITLE = 'AI影像报告草稿';

export type AIAssistantStructuredReport = {
  title: string;
  examSummary: string;
  findings: string;
  impression: string;
  recommendations: string;
  manualReview: string;
};

function toNormalizedText(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  return value.replace(/\r\n/g, '\n').trim();
}

export function normalizeStructuredReport(
  value?: Partial<AIAssistantStructuredReport> | null
): AIAssistantStructuredReport {
  return {
    title: toNormalizedText(value?.title, DEFAULT_REPORT_TITLE) || DEFAULT_REPORT_TITLE,
    examSummary: toNormalizedText(value?.examSummary),
    findings: toNormalizedText(value?.findings),
    impression: toNormalizedText(value?.impression),
    recommendations: toNormalizedText(value?.recommendations),
    manualReview: toNormalizedText(value?.manualReview),
  };
}

export function buildDraftMarkdown(value?: Partial<AIAssistantStructuredReport> | null): string {
  const report = normalizeStructuredReport(value);

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

export function buildSummary(
  value?: Partial<AIAssistantStructuredReport> | null,
  fallbackSummary = ''
): string {
  const report = normalizeStructuredReport(value);

  return report.examSummary || report.impression || toNormalizedText(fallbackSummary);
}

export function buildPlainTextReport(
  value?: Partial<AIAssistantStructuredReport> | null,
  fallbackSummary = ''
): string {
  const markdown = buildDraftMarkdown(value);
  const summary = buildSummary(value, fallbackSummary);

  if (!summary) {
    return markdown;
  }

  return `${summary}\n\n${markdown}`;
}

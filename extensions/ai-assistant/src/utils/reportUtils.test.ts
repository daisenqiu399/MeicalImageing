import {
  DEFAULT_REPORT_TITLE,
  buildDraftMarkdown,
  buildSummary,
  normalizeStructuredReport,
} from './reportUtils';

describe('reportUtils', () => {
  it('normalizes report content with defaults', () => {
    expect(normalizeStructuredReport()).toEqual({
      title: DEFAULT_REPORT_TITLE,
      examSummary: '',
      findings: '',
      impression: '',
      recommendations: '',
      manualReview: '',
    });
  });

  it('builds markdown with the expected Chinese sections', () => {
    const markdown = buildDraftMarkdown({
      title: '肺部 CT AI 草稿',
      examSummary: '胸部 CT 平扫。',
      findings: '右肺下叶见结节影。',
      impression: '考虑炎性结节。',
      recommendations: '建议结合随访。',
      manualReview: '需医生确认结节性质。',
    });

    expect(markdown).toContain('# 肺部 CT AI 草稿');
    expect(markdown).toContain('## 检查摘要');
    expect(markdown).toContain('## 影像所见');
    expect(markdown).toContain('## 印象');
    expect(markdown).toContain('## 建议');
    expect(markdown).toContain('## 需人工确认');
  });

  it('prefers report content when building a summary', () => {
    expect(
      buildSummary(
        {
          examSummary: '',
          impression: '考虑轻度炎症。',
        },
        'fallback summary'
      )
    ).toBe('考虑轻度炎症。');
  });
});

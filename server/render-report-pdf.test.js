const { buildReportHtml } = require('./render-report-pdf');

const svgCaptureDataUrl = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="100%" height="100%" fill="#111827"/><circle cx="120" cy="120" r="62" fill="#22c55e"/><text x="210" y="132" fill="#ffffff" font-size="28">CT</text></svg>'
).toString('base64')}`;

describe('render-report-pdf template', () => {
  it('renders the branded header, info grid, and findings-only content', () => {
    const html = buildReportHtml({
      report: {
        title: '胸部 CT AI 草稿',
        examSummary: '胸部 CT 平扫。',
        findings: '影像所见\n右肺下叶见小结节。\n影像所见续\n左肺上叶另见微小结节。',
        impression: '考虑炎性结节。',
        recommendations: '建议结合随访。',
        manualReview: '需结合原始影像人工确认。',
      },
      captures: [
        {
          dataUrl: svgCaptureDataUrl,
          modality: 'CT',
          seriesDescription: 'Chest CT',
          capturedAt: '2026-04-14T10:00:00.000Z',
        },
      ],
      model: 'test-model',
      requestId: 'request-123',
      generatedAt: new Date('2026-04-14T10:20:00.000Z'),
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

    expect(html).toContain('基于ChatGPT的医学影像AI辅助报告单');
    expect(html).toContain('基于ChatGPT的医学影像AI辅助报告单（续页）');
    expect(html).toContain('data:image/jpeg;base64,');
    expect(html).not.toContain('<svg class="hospital-mark"');
    expect(html).toContain('示例医院');
    expect(html).toContain('姓名');
    expect(html).toContain('检查号');
    expect(html).toContain('模态/序列');
    expect(html).toContain('影像所见');
    expect(html).toContain('右肺下叶见小结节。');
    expect(html).toContain('左肺上叶另见微小结节。');
    expect(html).toContain('报告医生：');
    expect(html).toContain('审核医生：');
    expect(html).not.toContain('检查摘要');
    expect(html).not.toContain('AI印象');
    expect(html).not.toContain('AI建议');
    expect(html).not.toContain('人工复核');
    expect(html).not.toContain('影像所见续');
    expect(html).not.toContain('影像所见（续）');
  });

  it('creates appendix image pages when more than two captures are exported', () => {
    const html = buildReportHtml({
      report: {
        title: '胸部 CT AI 草稿',
        examSummary: '胸部 CT 平扫。',
        findings: '右肺下叶见小结节。',
        impression: '考虑炎性结节。',
        recommendations: '建议结合随访。',
        manualReview: '需结合原始影像人工确认。',
      },
      captures: [
        {
          dataUrl: svgCaptureDataUrl,
          modality: 'CT',
          seriesDescription: 'Chest CT',
          capturedAt: '2026-04-14T10:00:00.000Z',
        },
        {
          dataUrl: svgCaptureDataUrl,
          modality: 'CT',
          seriesDescription: 'Chest CT',
          capturedAt: '2026-04-14T10:01:00.000Z',
        },
        {
          dataUrl: svgCaptureDataUrl,
          modality: 'CT',
          seriesDescription: 'Chest CT',
          capturedAt: '2026-04-14T10:02:00.000Z',
        },
      ],
      documentMeta: {
        institutionName: '示例医院',
        studyDescription: 'CT Chest',
      },
    });

    expect(html).toContain('附页影像');
    expect(html).toContain('关键图 3');
    expect(html.match(/关键图/g).length).toBeGreaterThanOrEqual(3);
  });

  it('chunks long findings without creating continuation section titles', () => {
    const longFindings = Array.from({ length: 12 }, () =>
      '右肺下叶见小结节，边界尚清，周围未见明显毛刺或胸膜牵拉征象。'
    ).join('');
    const html = buildReportHtml({
      report: {
        findings: `影像所见\n${longFindings}`,
      },
      documentMeta: {
        institutionName: '示例医院',
        studyDescription: 'CT Chest',
      },
    });

    expect((html.match(/class="text-block"/g) || []).length).toBeGreaterThan(1);
    expect(html).toContain(longFindings.slice(0, 20));
    expect(html).not.toContain('影像所见（续）');
    expect(html).not.toContain('section-title');
  });
});

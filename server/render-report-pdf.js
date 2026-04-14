let chromium;
let jsPDF;

try {
  ({ chromium } = require('playwright'));
} catch (_error) {
  chromium = null;
}

try {
  ({ jsPDF } = require('jspdf'));
} catch (_error) {
  jsPDF = null;
}

let browserPromise = null;
let processHandlersRegistered = false;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTimestampForFile(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');

  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}`;
}

function buildPdfFilename(date = new Date()) {
  return `study-ai-report-${formatTimestampForFile(date)}.pdf`;
}

function buildSection(title, body) {
  return `
    <section class="report-section">
      <div class="section-title">${escapeHtml(title)}</div>
      <div class="section-body">${escapeHtml(body || '待补充')}</div>
    </section>
  `;
}

function buildCaptureCards(captures = []) {
  if (!captures.length) {
    return '';
  }

  return captures
    .slice(0, 4)
    .map((capture, index) => {
      return `
        <article class="capture-card">
          <div class="capture-label">关键图 ${index + 1}</div>
          <img class="capture-image" src="${capture.dataUrl}" alt="关键图 ${index + 1}" />
          <div class="capture-meta">
            ${escapeHtml(capture.seriesDescription || '未命名序列')}
            <span class="capture-divider">|</span>
            ${escapeHtml(capture.modality || '未知模态')}
            <span class="capture-divider">|</span>
            ${escapeHtml(new Date(capture.capturedAt).toLocaleString('zh-CN'))}
          </div>
        </article>
      `;
    })
    .join('');
}

function buildReportHtml({
  report,
  summary,
  captures = [],
  model,
  requestId,
  studyDescription,
  generatedAt = new Date(),
}) {
  const capturePage = captures.length
    ? `
      <section class="page page-break">
        <div class="page-title">关键截图</div>
        <div class="page-subtitle">
          以下截图保留当前视口中的原始覆盖层、标注与分割叠加，请人工复核后再外发。
        </div>
        <div class="capture-grid">
          ${buildCaptureCards(captures)}
        </div>
        <div class="footer">AI 初诊草稿，仅供医生复核，不作为最终诊断结论。</div>
      </section>
    `
    : '';

  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
      <head>
        <meta charset="UTF-8" />
        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            color: #111827;
            background: #f3f4f6;
            font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif;
          }

          .page {
            width: 794px;
            min-height: 1123px;
            padding: 44px 48px;
            background: #ffffff;
            margin: 0 auto 24px auto;
          }

          .page-break {
            page-break-before: always;
          }

          .page-title {
            font-size: 26px;
            font-weight: 700;
            color: #111827;
          }

          .page-subtitle {
            font-size: 13px;
            color: #6b7280;
            line-height: 1.6;
          }

          .meta-grid {
            display: block;
            padding: 10px 12px;
            border-radius: 12px;
            background: #f3f4f6;
            margin: 12px 0;
          }

          .meta-item {
            display: inline-block;
            width: 48%;
            font-size: 12px;
            color: #4b5563;
            line-height: 1.6;
            vertical-align: top;
            margin-bottom: 6px;
          }

          .report-section {
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            padding: 12px 14px;
            margin-bottom: 12px;
          }

          .section-title {
            font-size: 13px;
            font-weight: 700;
            color: #374151;
            letter-spacing: 0.04em;
          }

          .section-body {
            white-space: pre-wrap;
            word-break: break-word;
            font-size: 14px;
            line-height: 1.7;
          }

          .capture-grid {
            margin-top: 12px;
          }

          .capture-card {
            display: inline-block;
            width: 48%;
            vertical-align: top;
            margin: 0 1% 12px 0;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            padding: 10px;
          }

          .capture-label {
            font-size: 13px;
            font-weight: 700;
            color: #374151;
            margin-bottom: 8px;
          }

          .capture-image {
            width: 100%;
            height: 68mm;
            object-fit: cover;
            border-radius: 10px;
            background: #000000;
          }

          .capture-meta {
            font-size: 12px;
            color: #6b7280;
            line-height: 1.5;
            word-break: break-word;
            margin-top: 8px;
          }

          .capture-divider {
            padding: 0 4px;
          }

          .footer {
            padding-top: 12px;
            border-top: 1px solid #e5e7eb;
            color: #6b7280;
            font-size: 12px;
            margin-top: 12px;
          }
        </style>
      </head>
      <body>
        <section class="page">
          <div class="page-title">${escapeHtml(report.title)}</div>
          <div class="page-subtitle">
            ${escapeHtml(summary || '基于关键截图与结构化上下文生成的中文初诊草稿。')}
          </div>
          <div class="meta-grid">
            <div class="meta-item">生成时间：${escapeHtml(
              new Date(generatedAt).toLocaleString('zh-CN')
            )}</div>
            <div class="meta-item">检查名称：${escapeHtml(studyDescription || '未命名检查')}</div>
            <div class="meta-item">模型：${escapeHtml(model || 'Unknown')}</div>
            <div class="meta-item">请求编号：${escapeHtml(requestId || '未提供')}</div>
          </div>
          ${buildSection('检查摘要', report.examSummary)}
          ${buildSection('影像所见', report.findings)}
          ${buildSection('印象', report.impression)}
          ${buildSection('建议', report.recommendations)}
          ${buildSection('需人工确认', report.manualReview)}
          <div class="footer">AI 初诊草稿，仅供医生复核，不作为最终诊断结论。</div>
        </section>
        ${capturePage}
      </body>
    </html>
  `;
}

async function waitForImages(page) {
  await page.evaluate(() => {
    const pendingImages = Array.from(document.images).filter(image => !image.complete);

    return Promise.all(
      pendingImages.map(
        image =>
          new Promise(resolve => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
          })
      )
    ).then(() => undefined);
  });
}

async function closeBrowser() {
  if (!browserPromise) {
    return;
  }

  try {
    const browser = await browserPromise;
    await browser.close();
  } catch (_error) {
    // Best effort cleanup only.
  } finally {
    browserPromise = null;
  }
}

function registerProcessHandlers() {
  if (processHandlersRegistered) {
    return;
  }

  processHandlersRegistered = true;
  process.once('exit', () => {
    if (browserPromise) {
      browserPromise.then(browser => browser.close()).catch(() => undefined);
    }
  });
}

async function getBrowser() {
  if (!chromium) {
    const error = new Error(
      'Playwright is not available. Install Chromium support before using PDF export.'
    );
    error.statusCode = 500;
    throw error;
  }

  if (!browserPromise) {
    registerProcessHandlers();
    browserPromise = chromium.launch({ headless: true });
  }

  return browserPromise;
}

async function renderReportPdfBuffer(options) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: {
      width: 900,
      height: 1300,
    },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  try {
    if (!jsPDF) {
      const error = new Error('jsPDF is not available. Install the dependency before using PDF export.');
      error.statusCode = 500;
      throw error;
    }

    await page.setContent(buildReportHtml(options), {
      waitUntil: 'load',
    });
    await waitForImages(page);
    const pageLocator = page.locator('.page');
    const pageCount = await pageLocator.count();
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    for (let index = 0; index < pageCount; index++) {
      if (index > 0) {
        pdf.addPage();
      }

      const imageBuffer = await pageLocator.nth(index).screenshot({
        type: 'png',
      });

      pdf.addImage(`data:image/png;base64,${imageBuffer.toString('base64')}`, 'PNG', 0, 0, 210, 297);
    }

    return Buffer.from(pdf.output('arraybuffer'));
  } catch (error) {
    if (String(error.message || '').includes('Executable')) {
      error.statusCode = 500;
      error.message =
        'Chromium is not installed for Playwright. Run "npx playwright install chromium" to enable PDF export.';
    }
    throw error;
  } finally {
    await context.close();
  }
}

module.exports = {
  buildPdfFilename,
  buildReportHtml,
  closeBrowser,
  renderReportPdfBuffer,
};

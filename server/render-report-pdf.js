const fs = require('fs');
const path = require('path');

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
let reportLogoDataUrl;

const REPORT_TITLE = '基于ChatGPT的医学影像AI辅助报告单';
const REPORT_CONTINUATION_TITLE = `${REPORT_TITLE}（续页）`;
const REPORT_LOGO_PATH = path.resolve(__dirname, '..', '8dd3f078951b93f89c5664b8b0ca0cb6.jpg');

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

function displayValue(value, fallback = '-') {
  const text = String(value || '').trim();
  return text || fallback;
}

function formatDisplayDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString('zh-CN');
}

function buildFallbackMedicalMarkSvg() {
  return `
    <svg class="hospital-mark" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="10" y="10" width="44" height="44" rx="10" fill="#c62828"></rect>
      <rect x="27" y="18" width="10" height="28" fill="#ffffff"></rect>
      <rect x="18" y="27" width="28" height="10" fill="#ffffff"></rect>
    </svg>
  `;
}

function getReportLogoDataUrl() {
  if (reportLogoDataUrl !== undefined) {
    return reportLogoDataUrl;
  }

  try {
    const buffer = fs.readFileSync(REPORT_LOGO_PATH);
    reportLogoDataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
  } catch (_error) {
    reportLogoDataUrl = null;
  }

  return reportLogoDataUrl;
}

function buildReportLogo() {
  const logoDataUrl = getReportLogoDataUrl();

  if (logoDataUrl) {
    return `
      <img class="hospital-mark hospital-logo" src="${logoDataUrl}" alt="AI报告标识" />
    `;
  }

  return buildFallbackMedicalMarkSvg();
}

function buildInfoCell(label, value) {
  return `
    <div class="info-cell">
      <span class="info-label">${escapeHtml(label)}</span>
      <span class="info-value">${escapeHtml(displayValue(value))}</span>
    </div>
  `;
}

function buildInfoGrid(documentMeta = {}) {
  const modalitySeries = [
    String(documentMeta.modality || '').trim(),
    String(documentMeta.seriesDescription || '').trim(),
  ]
    .filter(Boolean)
    .join(' / ');

  const rows = [
    [
      ['姓名', documentMeta.patientName],
      ['性别', documentMeta.patientSex],
      ['年龄', documentMeta.patientAge],
      ['患者ID', documentMeta.patientId],
      ['检查号', documentMeta.accessionNumber],
    ],
    [
      ['检查日期', documentMeta.studyDate],
      ['检查名称', documentMeta.studyDescription],
      ['模态/序列', modalitySeries],
      ['送检科室', ''],
      ['床号', ''],
    ],
  ];

  return rows
    .map(
      row => `
        <div class="info-row">
          ${row.map(([label, value]) => buildInfoCell(label, value)).join('')}
        </div>
      `
    )
    .join('');
}

function buildCaptureCard(capture, index, baseIndex = 0) {
  return `
    <article class="capture-card">
      <div class="capture-card-header">
        <span class="capture-card-title">关键图 ${baseIndex + index + 1}</span>
        <span class="capture-card-meta">${escapeHtml(
          displayValue(capture.modality, '未知模态')
        )}</span>
      </div>
      <div class="capture-frame">
        <img class="capture-image" src="${capture.dataUrl}" alt="关键图 ${baseIndex + index + 1}" />
      </div>
      <div class="capture-caption">
        ${escapeHtml(displayValue(capture.seriesDescription, '未命名序列'))}
      </div>
      <div class="capture-subcaption">
        ${escapeHtml(displayValue(formatDisplayDateTime(capture.capturedAt), '未记录时间'))}
      </div>
    </article>
  `;
}

function buildMainCaptureSection(captures = []) {
  const mainCaptures = captures.slice(0, 2);

  if (!mainCaptures.length) {
    return '';
  }

  return `
    <section class="image-panel">
      <div class="block-heading">影像截图</div>
      <div class="capture-grid">
        ${mainCaptures.map((capture, index) => buildCaptureCard(capture, index)).join('')}
      </div>
    </section>
  `;
}

function chunkArray(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function splitTextChunk(line, maxLength) {
  if (line.length <= maxLength) {
    return [line];
  }

  const sentenceChunks = line.match(/[^。！？；]+[。！？；]?/g) || [line];
  const result = [];
  let currentChunk = '';

  sentenceChunks.forEach(sentence => {
    if (!sentence) {
      return;
    }

    if ((currentChunk + sentence).length > maxLength && currentChunk) {
      result.push(currentChunk.trim());
      currentChunk = sentence;
      return;
    }

    currentChunk += sentence;
  });

  if (currentChunk.trim()) {
    result.push(currentChunk.trim());
  }

  return result.flatMap(chunk => {
    if (chunk.length <= maxLength) {
      return [chunk];
    }

    return chunk.match(new RegExp(`.{1,${maxLength}}`, 'g')) || [chunk];
  });
}

function splitSectionBody(body, maxLength = 170) {
  const normalized = String(body || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const lines = normalized.length ? normalized : ['待补充'];

  return lines.flatMap(line => splitTextChunk(line, maxLength));
}

function normalizeFindingsForExport(body) {
  return String(body || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(
      line => line && !/^(#{1,6}\s*)?影像所见(?:（续）|续)?[：:]?$/u.test(line)
    )
    .join('\n');
}

function buildReportBlocks(report) {
  return splitSectionBody(normalizeFindingsForExport(report.findings))
    .map(
      chunk => `
        <article class="text-block">
          <div class="section-body">${escapeHtml(chunk)}</div>
        </article>
      `
    )
    .join('');
}

function buildContinuationHeader(documentMeta = {}) {
  return `
    <header class="continuation-header">
      <div class="continuation-title">生物与工程学院(健康医药现代产业学院)</div>
      <div class="continuation-subtitle">${REPORT_CONTINUATION_TITLE}</div>
      <div class="continuation-meta-line">
        检查名称：${escapeHtml(displayValue(documentMeta.studyDescription, '未命名检查'))}
      </div>
    </header>
  `;
}

function buildCompactFooter({ generatedAt, requestId, model }) {
  return `
    <footer class="compact-footer">
      <div class="footer-meta">
        <span>生成时间：${escapeHtml(displayValue(formatDisplayDateTime(generatedAt), '未记录'))}</span>
        <span>请求编号：${escapeHtml(displayValue(requestId, '未提供'))}</span>
        <span>模型：ChatGPT-3.5-turbo</span>
      </div>
      <div class="footer-disclaimer">AI辅助草稿，仅供医生复核，不作为最终诊断结论。</div>
    </footer>
  `;
}

function buildMainFooter(options) {
  return `
    <footer class="page-footer">
      <div class="signature-row">
        <div class="signature-item">报告医生：</div>
        <div class="signature-item">审核医生：</div>
      </div>
      ${buildCompactFooter(options)}
    </footer>
  `;
}

function buildAppendixPages(captures = [], footerHtml) {
  const appendixGroups = chunkArray(captures.slice(2), 2);

  return appendixGroups
    .map(
      (group, groupIndex) => `
        <section class="page appendix-page">
          <div class="page-inner">
            <header class="continuation-header appendix-header">
              <div class="continuation-title">附页影像</div>
              <div class="continuation-meta-line">补充关键截图，请结合原始影像人工复核。</div>
            </header>
            <section class="appendix-section">
              <div class="capture-grid">
                ${group
                  .map((capture, index) => buildCaptureCard(capture, index, 2 + groupIndex * 2))
                  .join('')}
              </div>
            </section>
            ${footerHtml}
          </div>
        </section>
      `
    )
    .join('');
}

function buildReportHtml({
  report,
  captures = [],
  model,
  requestId,
  studyDescription,
  generatedAt = new Date(),
  documentMeta = {},
}) {
  const normalizedDocumentMeta = {
    institutionName: String(documentMeta.institutionName || '').trim(),
    patientName: String(documentMeta.patientName || '').trim(),
    patientSex: String(documentMeta.patientSex || '').trim(),
    patientAge: String(documentMeta.patientAge || '').trim(),
    patientId: String(documentMeta.patientId || '').trim(),
    accessionNumber: String(documentMeta.accessionNumber || '').trim(),
    studyDate: String(documentMeta.studyDate || '').trim(),
    studyDescription: String(documentMeta.studyDescription || studyDescription || '').trim(),
    modality: String(documentMeta.modality || '').trim(),
    seriesDescription: String(documentMeta.seriesDescription || '').trim(),
  };
  const compactFooterHtml = buildCompactFooter({
    generatedAt,
    requestId,
    model,
  });
  const continuationHeaderHtml = buildContinuationHeader(normalizedDocumentMeta);
  const appendixPages = buildAppendixPages(captures, compactFooterHtml);

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
            background: #eef1f4;
            color: #1f2937;
            font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif;
          }

          #pages {
            width: 794px;
            margin: 0 auto;
            padding: 18px 0 8px;
          }

          .page {
            width: 794px;
            height: 1123px;
            background: #ffffff;
            margin: 0 auto 20px;
            padding: 32px 34px 28px;
            box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
          }

          .page-inner {
            height: 100%;
            display: flex;
            flex-direction: column;
            min-height: 0;
          }

          .report-header {
            display: grid;
            grid-template-columns: 80px 1fr;
            gap: 14px;
            align-items: center;
            border-bottom: 1px solid #9ca3af;
            padding-bottom: 12px;
          }

          .hospital-mark {
            width: 70px;
            height: 70px;
          }

          .hospital-logo {
            object-fit: contain;
          }

          .report-header-text {
            text-align: center;
          }

          .hospital-name {
            font-size: 28px;
            font-weight: 700;
            letter-spacing: 0.08em;
          }

          .report-name {
            font-size: 18px;
            font-weight: 700;
            margin-top: 4px;
          }

          .report-subtitle {
            font-size: 11px;
            color: #4b5563;
            margin-top: 4px;
          }

          .info-panel {
            margin-top: 10px;
            border-top: 1px solid #d1d5db;
            border-bottom: 1px solid #d1d5db;
          }

          .info-row {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            border-bottom: 1px solid #e5e7eb;
          }

          .info-row:last-child {
            border-bottom: none;
          }

          .info-cell {
            min-height: 44px;
            padding: 8px 10px;
            border-right: 1px solid #e5e7eb;
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
          }

          .info-cell:last-child {
            border-right: none;
          }

          .info-label {
            color: #4b5563;
            white-space: nowrap;
          }

          .info-value {
            flex: 1;
            min-width: 0;
            color: #111827;
            font-weight: 500;
            word-break: break-word;
          }

          .image-panel,
          .text-section,
          .appendix-section {
            margin-top: 12px;
          }

          .block-heading {
            font-size: 13px;
            font-weight: 700;
            border-left: 3px solid #1d4ed8;
            padding-left: 8px;
            margin-bottom: 8px;
          }

          .capture-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
          }

          .capture-card {
            border: 1px solid #d1d5db;
            padding: 8px;
            min-height: 252px;
          }

          .capture-card-header {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 8px;
            margin-bottom: 6px;
          }

          .capture-card-title {
            font-size: 12px;
            font-weight: 700;
          }

          .capture-card-meta {
            font-size: 10px;
            color: #6b7280;
          }

          .capture-frame {
            height: 180px;
            background: #020617;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid #111827;
          }

          .capture-image {
            width: 100%;
            height: 100%;
            object-fit: contain;
            background: #020617;
          }

          .capture-caption {
            margin-top: 6px;
            font-size: 11px;
            font-weight: 600;
          }

          .capture-subcaption {
            margin-top: 2px;
            font-size: 10px;
            color: #6b7280;
          }

          .text-section {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0;
          }

          .flow-slot {
            flex: 1;
            min-height: 0;
            overflow: hidden;
          }

          .text-block {
            margin-bottom: 10px;
            break-inside: avoid;
          }

          .section-body {
            font-size: 12px;
            line-height: 1.85;
            white-space: pre-wrap;
            word-break: break-word;
          }

          .page-footer {
            margin-top: 14px;
            border-top: 1px solid #9ca3af;
            padding-top: 10px;
          }

          .signature-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 8px;
            font-size: 12px;
          }

          .signature-item {
            min-height: 26px;
            border-bottom: 1px solid #d1d5db;
            padding-bottom: 6px;
          }

          .compact-footer {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }

          .footer-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 10px 18px;
            font-size: 10px;
            color: #4b5563;
          }

          .footer-disclaimer {
            font-size: 10px;
            color: #6b7280;
          }

          .continuation-header {
            border-bottom: 1px solid #d1d5db;
            padding-bottom: 8px;
          }

          .continuation-title {
            font-size: 16px;
            font-weight: 700;
          }

          .continuation-subtitle,
          .continuation-meta-line {
            font-size: 11px;
            color: #4b5563;
            margin-top: 4px;
          }

          .appendix-header .continuation-title {
            font-size: 18px;
          }

          #report-blocks {
            display: none;
          }
        </style>
      </head>
      <body>
        <div id="pages">
          <section class="page main-page">
            <div class="page-inner">
              <header class="report-header">
                ${buildReportLogo()}
                <div class="report-header-text">
                  <div class="hospital-name">生物与工程学院(健康医药现代产业学院)</div>
                  <div class="report-name">${REPORT_TITLE}</div>
                  <div class="report-subtitle">
                    检查名称：${escapeHtml(
                      displayValue(normalizedDocumentMeta.studyDescription, '未命名检查')
                    )}
                  </div>
                </div>
              </header>
              <section class="info-panel">
                ${buildInfoGrid(normalizedDocumentMeta)}
              </section>
              ${buildMainCaptureSection(captures)}
              <section class="text-section">
                <div class="block-heading">影像所见</div>
                <div class="flow-slot" data-flow-slot="main"></div>
              </section>
              ${buildMainFooter({
                generatedAt,
                requestId,
                model,
              })}
            </div>
          </section>
          <div id="report-blocks">${buildReportBlocks(report)}</div>
          <div id="appendix-pages">${appendixPages}</div>
        </div>
        <script>
          (function () {
            const blocksContainer = document.getElementById('report-blocks');
            const appendixPages = document.getElementById('appendix-pages');
            const mainSlot = document.querySelector('[data-flow-slot="main"]');
            const continuationHeaderHtml = ${JSON.stringify(continuationHeaderHtml)};
            const continuationFooterHtml = ${JSON.stringify(compactFooterHtml)};
            let continuationIndex = 1;

            function createContinuationPage() {
              continuationIndex += 1;

              const page = document.createElement('section');
              page.className = 'page continuation-page';
              page.innerHTML =
                '<div class="page-inner">' +
                continuationHeaderHtml +
                '<section class="text-section">' +
                '<div class="flow-slot" data-flow-slot="continuation-' +
                continuationIndex +
                '"></div>' +
                '</section>' +
                continuationFooterHtml +
                '</div>';

              appendixPages.parentNode.insertBefore(page, appendixPages);

              return page.querySelector('.flow-slot');
            }

            function paginateBlocks() {
              const blocks = Array.from(blocksContainer.children);
              let currentSlot = mainSlot;

              blocks.forEach(block => {
                currentSlot.appendChild(block);

                if (currentSlot.scrollHeight > currentSlot.clientHeight + 1) {
                  currentSlot.removeChild(block);
                  currentSlot = createContinuationPage();
                  currentSlot.appendChild(block);
                }
              });
            }

            paginateBlocks();
            document.body.dataset.paginationReady = 'true';
          })();
        </script>
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
    await page.waitForFunction(() => document.body?.dataset.paginationReady === 'true');
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

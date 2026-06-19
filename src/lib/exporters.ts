// 匯出與分析輔助工具（純函式，前端使用）。
// - 分析報告 HTML / Markdown 字串
// - 自訂樞紐分析計算

export interface ReportHighlight {
  label: string;
  value: string;
  detail?: string;
}

export interface ReportAnomaly {
  row: number;
  column: string;
  value: unknown;
  reason: string;
}

export interface ReportNumericColumn {
  name: string;
  numeric?: { sum: number; average: number; min: number; max: number };
}

export interface ReportCategoryMetric {
  categoryColumn: string;
  metricColumn: string;
  topRows: Array<{ value: string; total: number; count: number }>;
}

export interface ReportPayload {
  title: string;
  sheetName?: string;
  rowCount: number;
  columnCount: number;
  tableType?: string;
  headline?: string;
  highlights?: ReportHighlight[];
  insights?: string;
  anomalies?: ReportAnomaly[];
  numericColumns?: ReportNumericColumn[];
  categoryMetrics?: ReportCategoryMetric[];
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(n);
}

// 將 AI 洞察文字（**粗體** / - 條列）轉成簡單 HTML
function insightsToHtml(insights: string): string {
  const lines = insights.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim().length > 0);
  let html = '';
  let inList = false;
  for (const line of lines) {
    const bold = line.match(/^\*\*(.+?)\*\*\s*$/);
    if (bold) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h3>${esc(bold[1])}</h3>`;
      continue;
    }
    const item = line.match(/^[-•]\s+(.*)$/);
    if (item) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${esc(item[1])}</li>`;
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    html += `<p>${esc(line)}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}

export function buildReportHtml(p: ReportPayload): string {
  const highlights = (p.highlights ?? [])
    .map(
      (h) => `<div class="card"><div class="card-label">${esc(h.label)}</div>
      <div class="card-value">${esc(h.value)}</div>
      ${h.detail ? `<div class="card-detail">${esc(h.detail)}</div>` : ''}</div>`
    )
    .join('');

  const metrics = (p.numericColumns ?? [])
    .filter((c) => c.numeric)
    .map(
      (c) => `<tr><td>${esc(c.name)}</td><td>${fmt(c.numeric!.sum)}</td><td>${fmt(c.numeric!.average)}</td><td>${fmt(c.numeric!.min)}</td><td>${fmt(c.numeric!.max)}</td></tr>`
    )
    .join('');

  const rankings = (p.categoryMetrics ?? [])
    .map((cm) => {
      const total = cm.topRows.reduce((s, r) => s + r.total, 0) || 1;
      const rows = cm.topRows
        .map(
          (r, i) =>
            `<tr><td>${i + 1}</td><td>${esc(r.value)}</td><td>${fmt(r.total)}</td><td>${((r.total / total) * 100).toFixed(1)}%</td></tr>`
        )
        .join('');
      return `<h3>依「${esc(cm.categoryColumn)}」彙總「${esc(cm.metricColumn)}」Top ${cm.topRows.length}</h3>
      <table><thead><tr><th>#</th><th>${esc(cm.categoryColumn)}</th><th>${esc(cm.metricColumn)}</th><th>占比</th></tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join('');

  const anomalies = (p.anomalies ?? [])
    .map((a) => `<li><strong>${esc(a.column)}</strong>${a.row > 0 ? `（第 ${a.row} 列）` : ''}：${esc(a.reason)}</li>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="utf-8"><title>${esc(p.title)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,"PingFang TC","Microsoft JhengHei",sans-serif;color:#0f172a;margin:0;background:#f8fafc}
  .page{max-width:880px;margin:0 auto;padding:40px 32px}
  header{border-bottom:3px solid #4f46e5;padding-bottom:16px;margin-bottom:24px}
  h1{font-size:26px;margin:0 0 6px;color:#312e81}
  .meta{color:#64748b;font-size:13px}
  h2{font-size:19px;color:#4338ca;margin:28px 0 12px;border-left:4px solid #6366f1;padding-left:10px}
  h3{font-size:15px;color:#1e293b;margin:18px 0 8px}
  .headline{background:#eef2ff;border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.7}
  .cards{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:12px}
  .card{border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;background:#fff}
  .card-label{font-size:12px;color:#64748b}
  .card-value{font-size:16px;font-weight:700;margin-top:2px}
  .card-detail{font-size:12px;color:#64748b;margin-top:4px}
  table{width:100%;border-collapse:collapse;font-size:13px;background:#fff;margin-top:6px}
  th,td{border:1px solid #e2e8f0;padding:7px 10px;text-align:left}
  th{background:#f1f5f9;color:#334155}
  ul{line-height:1.8;font-size:14px}
  .insights p{font-size:14px;line-height:1.8;margin:6px 0}
  footer{margin-top:36px;color:#94a3b8;font-size:12px;text-align:center;border-top:1px solid #e2e8f0;padding-top:14px}
  @media print{body{background:#fff}.page{padding:0}}
</style></head>
<body><div class="page">
  <header>
    <h1>${esc(p.title)}</h1>
    <div class="meta">${p.sheetName ? `分頁：${esc(p.sheetName)} ・ ` : ''}資料規模：${fmt(p.rowCount)} 筆 × ${p.columnCount} 欄${p.tableType ? ` ・ 類型：${esc(p.tableType)}` : ''}</div>
  </header>
  ${p.headline ? `<h2>重點摘要</h2><div class="headline">${esc(p.headline)}</div>${highlights ? `<div class="cards">${highlights}</div>` : ''}` : ''}
  ${metrics ? `<h2>關鍵指標</h2><table><thead><tr><th>欄位</th><th>總計</th><th>平均</th><th>最小</th><th>最大</th></tr></thead><tbody>${metrics}</tbody></table>` : ''}
  ${rankings ? `<h2>分組排行</h2>${rankings}` : ''}
  ${p.insights ? `<h2>AI 深度洞察</h2><div class="insights">${insightsToHtml(p.insights)}</div>` : ''}
  ${anomalies ? `<h2>異常與風險</h2><ul>${anomalies}</ul>` : ''}
  <footer>由 AI 試算表助理產生 ・ ${new Date().toLocaleString()}</footer>
</div></body></html>`;
}

export function buildReportMarkdown(p: ReportPayload): string {
  const lines: string[] = [];
  lines.push(`# ${p.title}`, '');
  lines.push(
    `> ${p.sheetName ? `分頁：${p.sheetName} ・ ` : ''}資料規模：${fmt(p.rowCount)} 筆 × ${p.columnCount} 欄${p.tableType ? ` ・ 類型：${p.tableType}` : ''}`,
    ''
  );
  if (p.headline) {
    lines.push('## 重點摘要', '', p.headline, '');
    for (const h of p.highlights ?? []) {
      lines.push(`- **${h.label}**：${h.value}${h.detail ? `（${h.detail}）` : ''}`);
    }
    lines.push('');
  }
  const nums = (p.numericColumns ?? []).filter((c) => c.numeric);
  if (nums.length) {
    lines.push('## 關鍵指標', '', '| 欄位 | 總計 | 平均 | 最小 | 最大 |', '| --- | --- | --- | --- | --- |');
    for (const c of nums) {
      lines.push(`| ${c.name} | ${fmt(c.numeric!.sum)} | ${fmt(c.numeric!.average)} | ${fmt(c.numeric!.min)} | ${fmt(c.numeric!.max)} |`);
    }
    lines.push('');
  }
  for (const cm of p.categoryMetrics ?? []) {
    const total = cm.topRows.reduce((s, r) => s + r.total, 0) || 1;
    lines.push(`## 依「${cm.categoryColumn}」彙總「${cm.metricColumn}」`, '', '| # | 項目 | 數值 | 占比 |', '| --- | --- | --- | --- |');
    cm.topRows.forEach((r, i) => {
      lines.push(`| ${i + 1} | ${r.value} | ${fmt(r.total)} | ${((r.total / total) * 100).toFixed(1)}% |`);
    });
    lines.push('');
  }
  if (p.insights) {
    lines.push('## AI 深度洞察', '', p.insights, '');
  }
  if ((p.anomalies ?? []).length) {
    lines.push('## 異常與風險', '');
    for (const a of p.anomalies!) {
      lines.push(`- **${a.column}**${a.row > 0 ? `（第 ${a.row} 列）` : ''}：${a.reason}`);
    }
    lines.push('');
  }
  lines.push('---', `*由 AI 試算表助理產生 ・ ${new Date().toLocaleString()}*`);
  return lines.join('\n');
}

// ── 自訂樞紐分析 ───────────────────────────────────────────────
export type AggMethod = 'sum' | 'avg' | 'count' | 'min' | 'max';

export const AGG_LABELS: Record<AggMethod, string> = {
  sum: '加總',
  avg: '平均',
  count: '計數',
  min: '最小',
  max: '最大',
};

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  return Number(String(v).replace(/[, ]/g, ''));
}

export interface PivotRow {
  label: string;
  value: number;
  count: number;
}

// 依分組欄位彙總數值欄位（計數模式不需數值欄位）
export function computePivot(
  rows: unknown[][],
  groupIndex: number,
  metricIndex: number,
  agg: AggMethod,
  limit = 20
): PivotRow[] {
  const acc = new Map<string, { sum: number; count: number; min: number; max: number }>();
  for (const r of rows) {
    const key = String(r[groupIndex] ?? '（空白）');
    const num = agg === 'count' ? 1 : toNum(r[metricIndex]);
    if (agg !== 'count' && !Number.isFinite(num)) continue;
    const cur = acc.get(key) ?? { sum: 0, count: 0, min: Infinity, max: -Infinity };
    cur.sum += num;
    cur.count += 1;
    cur.min = Math.min(cur.min, num);
    cur.max = Math.max(cur.max, num);
    acc.set(key, cur);
  }
  const out: PivotRow[] = Array.from(acc.entries()).map(([label, v]) => {
    let value: number;
    switch (agg) {
      case 'avg': value = v.count ? v.sum / v.count : 0; break;
      case 'count': value = v.count; break;
      case 'min': value = v.min; break;
      case 'max': value = v.max; break;
      default: value = v.sum;
    }
    return { label, value, count: v.count };
  });
  return out.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, limit);
}

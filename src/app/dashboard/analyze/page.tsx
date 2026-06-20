'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, BarChart3, Bot, Database, Loader2, Send, TrendingUp, Layers, PieChart as PieChartIcon, Lightbulb, Trophy, Target, Gauge, Presentation as PresentationIcon, Download, Sparkles, FileText, FileDown, Table2, BookmarkPlus, Trash2, FolderDown, Globe } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getSelectedModel } from '@/lib/client-model';
import { buildDataProfile } from '@/lib/data-profile';
import { analyzeColumns, detectTableType, findAnomalies } from '@/lib/table-stats';
import { buildReportHtml, buildReportMarkdown, computePivot, AGG_LABELS, type AggMethod, type ReportPayload } from '@/lib/exporters';

type ChartType = 'bar' | 'pie' | 'line';

interface ChartSpec {
  type: ChartType;
  title: string;
  data: Array<{ label: string; value: number }>;
}

interface Message {
  role: 'user' | 'assistant';
  text: string;
  chart?: ChartSpec;
}

interface SheetData {
  sheetName: string;
  columns: string[];
  rows: any[][];
  rowCount?: number;
  columnCount?: number;
  tableType?: string;
}

interface Data {
  columns: string[];
  rows: any[][];
  sheetName?: string;
  fileName?: string;
  tableType?: string;
  columnAnalysis?: any[];
  sheets?: SheetData[];
  sheetCount?: number;
}

interface AnalysisResult {
  columnAnalysis: any[];
  tableType: string;
  anomalies: Array<{ row: number; column: string; value: any; reason: string }>;
  profile?: {
    rowCount: number;
    columnCount: number;
    columns: Array<{
      name: string;
      type: string;
      numeric?: { sum: number; average: number; min: number; max: number };
      topValues?: Array<{ value: string; count: number }>;
    }>;
    categoryMetrics: Array<{
      categoryColumn: string;
      metricColumn: string;
      topRows: Array<{ value: string; total: number; count: number }>;
    }>;
  };
  insights?: string;
}

interface PresentationReference {
  title: string;
  url: string;
  snippet?: string;
}

interface PresentationSlide {
  heading: string;
  bullets: string[];
  notes?: string;
  chart?: ChartSpec;
}

interface Presentation {
  title: string;
  subtitle: string;
  slides: PresentationSlide[];
  references?: PresentationReference[];
}

// 收藏到「我的報告」的項目：AI 文字回答或圖表
interface SavedItem {
  id: string;
  kind: 'text' | 'chart';
  text?: string;
  chart?: ChartSpec;
}

// 偵測使用者是否在要求畫圖表
const CHART_KEYWORDS = ['圖', '圖表', '畫', '繪', '視覺', 'chart', 'plot', '長條', '柱狀', '圓餅', '派', 'pie', '折線', '趨勢', 'line', 'bar', '分布', '佔比'];
function wantsChart(msg: string): boolean {
  const lower = msg.toLowerCase();
  return CHART_KEYWORDS.some((k) => lower.includes(k.toLowerCase()));
}

function detectChartType(msg: string): ChartType {
  const lower = msg.toLowerCase();
  if (/圓餅|派|pie|佔比|比例/.test(lower)) return 'pie';
  if (/折線|趨勢|line|走勢|變化/.test(lower)) return 'line';
  return 'bar';
}

function toNumber(v: any): number {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  return Number(String(v).replace(/[, ]/g, ''));
}

// 從資料與使用者訊息建立圖表規格（純前端、不需 AI、不扣點）
function buildChartFromData(columns: string[], rows: any[][], msg: string): ChartSpec | null {
  if (!columns.length || !rows.length) return null;

  const colIsNumeric = columns.map((_, ci) => {
    const vals = rows.map((r) => toNumber(r[ci])).filter((n) => Number.isFinite(n));
    return vals.length >= Math.max(2, rows.length * 0.5);
  });

  // 使用者訊息中若提到欄位名稱，優先採用
  const mentioned = columns
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c && msg.includes(c));
  const mentionedNumeric = mentioned.find(({ i }) => colIsNumeric[i]);
  const mentionedText = mentioned.find(({ i }) => !colIsNumeric[i]);

  const metricIndex = mentionedNumeric?.i ?? colIsNumeric.findIndex(Boolean);
  if (metricIndex < 0) return null;
  const categoryIndex =
    mentionedText?.i ??
    colIsNumeric.findIndex((isNum, i) => !isNum && i !== metricIndex);

  const type = detectChartType(msg);

  // 折線圖：依資料列順序呈現指標（適合時間/序列）
  if (type === 'line' || categoryIndex < 0) {
    const points = rows
      .map((r, idx) => ({
        label: categoryIndex >= 0 ? String(r[categoryIndex] ?? idx + 1) : `第${idx + 1}列`,
        value: toNumber(r[metricIndex]),
      }))
      .filter((p) => Number.isFinite(p.value))
      .slice(0, 40);
    if (!points.length) return null;
    return {
      type: 'line',
      title: `「${columns[metricIndex]}」${categoryIndex >= 0 ? `（依${columns[categoryIndex]}）` : '走勢'}`,
      data: points,
    };
  }

  // 長條 / 圓餅：依分類彙總指標
  const totals = new Map<string, number>();
  for (const r of rows) {
    const key = String(r[categoryIndex] ?? '（空白）');
    const val = toNumber(r[metricIndex]);
    if (!Number.isFinite(val)) continue;
    totals.set(key, (totals.get(key) ?? 0) + val);
  }
  let entries = Array.from(totals.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  if (type === 'pie') entries = entries.filter((e) => e.value > 0);
  entries = entries.slice(0, 8);
  if (!entries.length) return null;

  return {
    type,
    title: `依「${columns[categoryIndex]}」彙總「${columns[metricIndex]}」`,
    data: entries,
  };
}

interface Highlight {
  icon: 'trophy' | 'target' | 'alert' | 'gauge' | 'database';
  label: string;
  value: string;
  detail?: string;
  tone: 'indigo' | 'emerald' | 'amber' | 'rose';
}

// 由統計結果即時合成「重點摘要」：一句總結 + 可行動的重點卡（不需 AI、即時可靠）
function buildHighlights(
  analysis: AnalysisResult | null,
  data: Data
): { headline: string; items: Highlight[] } | null {
  if (!analysis?.profile) return null;
  const p = analysis.profile;
  const items: Highlight[] = [];

  items.push({
    icon: 'database',
    label: '資料規模',
    value: `${p.rowCount.toLocaleString()} 筆 × ${p.columnCount} 欄`,
    detail: data.sheetName ? `分頁：${data.sheetName}` : undefined,
    tone: 'indigo',
  });

  let headline = `這份資料共 ${p.rowCount.toLocaleString()} 筆紀錄`;

  const top = p.categoryMetrics?.[0];
  if (top && top.topRows.length) {
    const totalSum = top.topRows.reduce((s, r) => s + (r.total > 0 ? r.total : 0), 0);
    const first = top.topRows[0];
    const share = totalSum > 0 ? (first.total / totalSum) * 100 : 0;
    items.push({
      icon: 'trophy',
      label: `最高 ${top.metricColumn}`,
      value: `${first.value}：${first.total.toLocaleString()}`,
      detail: `依「${top.categoryColumn}」分組，占前 ${top.topRows.length} 名約 ${share.toFixed(0)}%`,
      tone: 'emerald',
    });
    headline += `，「${first.value}」的${top.metricColumn}最高（${first.total.toLocaleString()}）`;
    if (share >= 50) {
      items.push({
        icon: 'target',
        label: '集中度偏高',
        value: `前 1 名占 ${share.toFixed(0)}%`,
        detail: '高度集中於少數項目，建議分散風險或聚焦主力。',
        tone: 'amber',
      });
    }
  }

  const anomalies = analysis.anomalies ?? [];
  if (anomalies.length) {
    const a = anomalies[0];
    items.push({
      icon: 'alert',
      label: '異常提示',
      value: `${anomalies.length} 筆需留意`,
      detail: `例如第 ${a.row} 列「${a.column}」=${a.value}：${a.reason}`,
      tone: 'rose',
    });
    headline += `；偵測到 ${anomalies.length} 筆異常值需檢查`;
  } else {
    headline += '；未偵測到明顯異常';
  }

  const numericCols = p.columns.filter((c) => c.numeric);
  if (numericCols.length && numericCols[0].numeric) {
    const nc = numericCols[0];
    items.push({
      icon: 'gauge',
      label: `${nc.name} 概況`,
      value: `平均 ${Math.round(nc.numeric!.average).toLocaleString()}`,
      detail: `最小 ${nc.numeric!.min.toLocaleString()} / 最大 ${nc.numeric!.max.toLocaleString()}`,
      tone: 'indigo',
    });
  }

  headline += '。';
  return { headline, items: items.slice(0, 5) };
}

const HIGHLIGHT_ICON = { trophy: Trophy, target: Target, alert: AlertTriangle, gauge: Gauge, database: Database };
const HIGHLIGHT_TONE: Record<Highlight['tone'], string> = {
  indigo: 'text-indigo-600 bg-indigo-100',
  emerald: 'text-emerald-600 bg-emerald-100',
  amber: 'text-amber-600 bg-amber-100',
  rose: 'text-rose-600 bg-rose-100',
};

export default function AnalyzePage() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [presentationLoading, setPresentationLoading] = useState(false);
  const [presentationError, setPresentationError] = useState<string | null>(null);
  // 自訂樞紐分析
  const [pivotGroup, setPivotGroup] = useState<number>(-1);
  const [pivotMetric, setPivotMetric] = useState<number>(-1);
  const [pivotAgg, setPivotAgg] = useState<AggMethod>('sum');
  const [pivotChart, setPivotChart] = useState<ChartSpec | null>(null);
  // 我的報告（收藏）
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedData = sessionStorage.getItem('uploadedData');
    if (storedData) {
      const parsedData = JSON.parse(storedData) as Data;
      // 支援多分頁：若有 sheets 用它，否則用單頁
      const sheetList: SheetData[] =
        parsedData.sheets && parsedData.sheets.length > 0
          ? parsedData.sheets
          : [
              {
                sheetName: parsedData.sheetName || '工作表1',
                columns: parsedData.columns,
                rows: parsedData.rows,
              },
            ];
      setSheets(sheetList);
      setActiveSheet(0);
      activateSheet(parsedData, sheetList, 0);
    } else {
      router.push('/dashboard/upload');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const activateSheet = (base: Data, sheetList: SheetData[], index: number) => {
    const sheet = sheetList[index];
    const nextData: Data = {
      ...base,
      columns: sheet.columns,
      rows: sheet.rows,
      sheetName: sheet.sheetName,
      tableType: sheet.tableType || base.tableType,
    };
    setData(nextData);
    setMessages([
      {
        role: 'assistant',
        text: `我已載入分頁「${sheet.sheetName}」（共 ${sheet.rows.length} 筆、${sheet.columns.length} 個欄位）。${
          sheetList.length > 1 ? `此檔案共有 ${sheetList.length} 個分頁，可在上方切換逐頁分析。` : ''
        }我會先產生報表分析摘要；你也可以直接問我「哪個客戶營業額最高？」「異常在哪？」`,
      },
    ]);
    void loadAnalysis(nextData);
  };

  const handleSheetChange = (index: number) => {
    if (!data || index === activeSheet) return;
    setActiveSheet(index);
    setAnalysis(null);
    setPresentation(null);
    setPresentationError(null);
    setPivotChart(null);
    setPivotGroup(-1);
    setPivotMetric(-1);
    activateSheet(data, sheets, index);
  };

  // 收集分析報告所需的結構化資料（供 HTML / Markdown 匯出）
  const buildReportPayload = (): ReportPayload | null => {
    if (!data) return null;
    const highlights = buildHighlights(analysis, data);
    return {
      title: `${data.fileName || '資料'} 分析報告`,
      sheetName: data.sheetName,
      rowCount: data.rows.length,
      columnCount: data.columns.length,
      tableType: analysis?.tableType || data.tableType,
      headline: highlights?.headline,
      highlights: highlights?.items.map((it) => ({ label: it.label, value: it.value, detail: it.detail })),
      insights: analysis?.insights,
      anomalies: analysis?.anomalies,
      numericColumns: analysis?.profile?.columns
        .filter((c) => c.numeric)
        .map((c) => ({ name: c.name, numeric: c.numeric })),
      categoryMetrics: analysis?.profile?.categoryMetrics,
    };
  };

  const handleDownloadReport = (format: 'html' | 'md') => {
    const payload = buildReportPayload();
    if (!payload) return;
    if (format === 'html') {
      const html = buildReportHtml(payload);
      triggerDownload(new Blob([html], { type: 'text/html;charset=utf-8' }), `${payload.title}.html`);
    } else {
      const md = buildReportMarkdown(payload);
      triggerDownload(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${payload.title}.md`);
    }
  };

  // 將簡報匯出成真正的 PowerPoint (.pptx)
  const handleDownloadPptx = async () => {
    if (!presentation) return;
    const PptxGenJS = (await import('pptxgenjs')).default;
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';

    // 封面
    const cover = pptx.addSlide();
    cover.background = { color: '4F46E5' };
    cover.addText(presentation.title, { x: 0.6, y: 2.0, w: 12, h: 1.2, fontSize: 40, bold: true, color: 'FFFFFF' });
    cover.addText(presentation.subtitle, { x: 0.6, y: 3.3, w: 12, h: 0.8, fontSize: 20, color: 'E0E7FF' });

    // 內容頁
    for (const s of presentation.slides) {
      const slide = pptx.addSlide();
      slide.addText(s.heading, { x: 0.5, y: 0.4, w: 12.3, h: 0.8, fontSize: 26, bold: true, color: '4338CA' });
      slide.addShape(pptx.ShapeType.line, { x: 0.5, y: 1.2, w: 12.3, h: 0, line: { color: 'C7D2FE', width: 2 } });

      const hasChart = !!s.chart && s.chart.data.length > 0;
      const textW = hasChart ? 6.0 : 11.8;
      slide.addText(
        s.bullets.map((b) => ({ text: b, options: { bullet: true, fontSize: 16, color: '1E293B', breakLine: true } })),
        { x: 0.7, y: 1.5, w: textW, h: 5, valign: 'top' }
      );

      if (hasChart && s.chart) {
        const labels = s.chart.data.map((d) => d.label);
        const values = s.chart.data.map((d) => d.value);
        const chartData = [{ name: s.chart.title, labels, values }];
        const chartType =
          s.chart.type === 'pie'
            ? pptx.ChartType.pie
            : s.chart.type === 'line'
            ? pptx.ChartType.line
            : pptx.ChartType.bar;
        slide.addChart(chartType, chartData, {
          x: 7.0,
          y: 1.5,
          w: 5.8,
          h: 4.8,
          showTitle: true,
          title: s.chart.title,
          titleFontSize: 12,
          showLegend: s.chart.type === 'pie',
          legendPos: 'b',
          showValue: s.chart.type !== 'line',
          barDir: 'bar',
          chartColors: ['6366F1', '8B5CF6', 'EC4899', 'F59E0B', '10B981', '3B82F6', 'EF4444', '14B8A6'],
        });
      }
      if (s.notes) slide.addNotes(s.notes);
    }

    // 參考範例頁
    if (presentation.references && presentation.references.length) {
      const ref = pptx.addSlide();
      ref.addText('參考範例與延伸閱讀', { x: 0.5, y: 0.4, w: 12.3, h: 0.8, fontSize: 26, bold: true, color: '4338CA' });
      ref.addShape(pptx.ShapeType.line, { x: 0.5, y: 1.2, w: 12.3, h: 0, line: { color: 'C7D2FE', width: 2 } });
      ref.addText(
        presentation.references.map((r) => ({
          text: r.snippet ? `${r.title} — ${r.snippet}` : r.title,
          options: {
            bullet: true,
            fontSize: 14,
            color: '3730A3',
            breakLine: true,
            hyperlink: { url: r.url, tooltip: r.url },
          },
        })),
        { x: 0.7, y: 1.5, w: 11.8, h: 5, valign: 'top' }
      );
      ref.addText('資料來源為網路搜尋結果，僅供延伸參考。', {
        x: 0.7,
        y: 6.6,
        w: 11.8,
        h: 0.5,
        fontSize: 11,
        italic: true,
        color: '94A3B8',
      });
    }

    await pptx.writeFile({ fileName: `${presentation.title || '資料分析簡報'}.pptx` });
  };

  // 執行樞紐分析並產生圖表
  const handleRunPivot = () => {
    if (!data || pivotGroup < 0) return;
    const needMetric = pivotAgg !== 'count';
    if (needMetric && pivotMetric < 0) return;
    const result = computePivot(data.rows, pivotGroup, pivotMetric, pivotAgg);
    if (!result.length) {
      setPivotChart(null);
      return;
    }
    const metricLabel = pivotAgg === 'count' ? '筆數' : data.columns[pivotMetric];
    setPivotChart({
      type: 'bar',
      title: `依「${data.columns[pivotGroup]}」${AGG_LABELS[pivotAgg]}「${metricLabel}」`,
      data: result.map((r) => ({ label: r.label, value: Math.round(r.value * 100) / 100 })),
    });
  };

  // 收藏到「我的報告」
  const addSavedItem = (item: Omit<SavedItem, 'id'>) => {
    setSavedItems((prev) => [...prev, { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }]);
  };
  const removeSavedItem = (id: string) => setSavedItems((prev) => prev.filter((s) => s.id !== id));

  // 匯出整批收藏為獨立 HTML
  const handleExportSaved = () => {
    if (!savedItems.length) return;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const blocks = savedItems
      .map((it) => {
        if (it.kind === 'chart' && it.chart) {
          return `<section class="block"><h3>${esc(it.chart.title)}</h3>${buildChartSvg(it.chart)}</section>`;
        }
        const textHtml = (it.text || '')
          .split('\n')
          .map((l) => (l.match(/^\*\*(.+?)\*\*$/) ? `<h4>${esc(l.replace(/\*\*/g, ''))}</h4>` : `<p>${esc(l)}</p>`))
          .join('');
        return `<section class="block">${textHtml}</section>`;
      })
      .join('\n');
    const html = `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><title>我的報告</title>
<style>body{font-family:-apple-system,"PingFang TC","Microsoft JhengHei",sans-serif;background:#f8fafc;color:#0f172a;margin:0}
.page{max-width:900px;margin:0 auto;padding:40px 32px}h1{color:#312e81}
.block{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px;margin-bottom:18px}
.block h3{color:#4338ca;margin-top:0}.block p{line-height:1.7;margin:6px 0}svg{max-width:100%}</style></head>
<body><div class="page"><h1>我的報告</h1><p style="color:#64748b">${data?.fileName ? esc(data.fileName) + ' ・ ' : ''}共 ${savedItems.length} 項 ・ ${new Date().toLocaleString()}</p>${blocks}</div></body></html>`;
    triggerDownload(new Blob([html], { type: 'text/html;charset=utf-8' }), '我的報告.html');
  };

  // 使用 GPT-5.5 產生簡報（固定扣點 100）
  const handleGeneratePresentation = async () => {
    if (!data || presentationLoading) return;
    setPresentationLoading(true);
    setPresentationError(null);
    try {
      const profile = analysis?.profile ?? buildDataProfile(data.columns, data.rows);
      const sampleRows = data.rows.slice(0, 12);
      const response = await fetch('/api/presentation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns: data.columns, profile, sampleRows }),
      });
      if (response.ok) {
        const result = await response.json();
        setPresentation(result.presentation as Presentation);
      } else if (response.status === 402) {
        const result = await response.json().catch(() => ({}));
        setPresentationError(result.message || '點數不足（需 100 點），請至「設定」頁升級方案。');
      } else {
        const result = await response.json().catch(() => ({}));
        setPresentationError(result.error || '簡報產生失敗，請稍後再試。');
      }
    } catch (error) {
      console.error('Presentation error:', error);
      setPresentationError('發生錯誤，請稍後再試。');
    } finally {
      setPresentationLoading(false);
    }
  };

  // 將簡報下載為可獨立開啟的 HTML 檔（一頁一張投影片）
  const handleDownloadPresentation = () => {
    if (!presentation) return;
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const slidesHtml = presentation.slides
      .map((s, idx) => {
        const chartHtml = s.chart
          ? `<div class="chart">${buildChartSvg(s.chart)}</div>`
          : '';
        const bodyClass = s.chart ? 'body two-col' : 'body';
        return `<section class="slide">
      <div class="slide-head"><span class="badge">${idx + 1}</span><h2>${esc(s.heading)}</h2></div>
      <div class="${bodyClass}">
        <ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
        ${chartHtml}
      </div>
      ${s.notes ? `<p class="notes">備註：${esc(s.notes)}</p>` : ''}
      <div class="page-no">${idx + 1} / ${presentation.slides.length}</div>
    </section>`;
      })
      .join('\n');
    const refsHtml =
      presentation.references && presentation.references.length
        ? `<section class="slide">
      <div class="slide-head"><span class="badge">★</span><h2>參考範例與延伸閱讀</h2></div>
      <ul class="refs">${presentation.references
        .map(
          (r) =>
            `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a>${
              r.snippet ? `<div class="snip">${esc(r.snippet)}</div>` : ''
            }</li>`
        )
        .join('')}</ul>
      <p class="notes">資料來源為網路搜尋結果，僅供延伸參考。</p>
    </section>`
        : '';
    const html = `<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(presentation.title)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,"PingFang TC","Microsoft JhengHei",sans-serif;margin:0;background:#e9edf5;color:#1f2937}
  .deck{max-width:1040px;margin:0 auto;padding:28px 16px}
  .cover{position:relative;aspect-ratio:16/9;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;border-radius:16px;padding:64px 60px;display:flex;flex-direction:column;justify-content:center;box-shadow:0 10px 40px rgba(79,70,229,.25);margin-bottom:24px}
  .cover h1{font-size:44px;line-height:1.2;margin:0 0 16px;font-weight:800}
  .cover p{font-size:22px;opacity:.92;margin:0}
  .cover .tag{position:absolute;top:28px;left:60px;font-size:13px;letter-spacing:2px;opacity:.85;text-transform:uppercase}
  .slide{position:relative;aspect-ratio:16/9;background:#fff;margin:0 0 24px;padding:40px 48px 52px;border-radius:16px;box-shadow:0 6px 24px rgba(15,23,42,.08);overflow:hidden}
  .slide-head{display:flex;align-items:center;gap:12px;border-bottom:3px solid #eef2ff;padding-bottom:14px;margin-bottom:22px}
  .slide-head h2{font-size:28px;color:#4338ca;margin:0;font-weight:800}
  .badge{width:34px;height:34px;border-radius:9px;background:#4f46e5;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;flex:0 0 auto}
  .body{font-size:19px;line-height:1.85}
  .body.two-col{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:center}
  .body ul{margin:0;padding-left:24px}
  .body li{margin:6px 0}
  .chart{background:#f8fafc;border:1px solid #eef2ff;border-radius:12px;padding:10px}
  .chart svg{width:100%;height:auto;display:block}
  .notes{margin:18px 0 0;color:#64748b;font-size:14px;font-style:italic}
  .page-no{position:absolute;right:24px;bottom:16px;color:#cbd5e1;font-size:13px;font-weight:600}
  .refs{font-size:18px;line-height:1.7}
  .refs a{color:#4338ca;text-decoration:none;font-weight:600}
  .refs a:hover{text-decoration:underline}
  .refs .snip{color:#64748b;font-size:14px;font-weight:400;margin:2px 0 10px}
  @media print{body{background:#fff}.deck{padding:0}.slide,.cover{box-shadow:none;page-break-after:always;margin:0;border-radius:0}}
</style></head>
<body>
  <div class="deck">
    <div class="cover"><div class="tag">資料分析簡報</div><h1>${esc(presentation.title)}</h1><p>${esc(presentation.subtitle)}</p></div>
    ${slidesHtml}
    ${refsHtml}
  </div>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${presentation.title || '資料分析簡報'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadAnalysis = async (targetData: Data) => {
    setAnalysisLoading(true);
    try {
      // 在前端先算好統計（profile、欄位分析、異常），只把精簡結果送到後端做 AI 洞察。
      // 這樣即使資料超過萬筆也不會因為請求過大（Vercel 限制 4.5MB）而失敗。
      const columnAnalysis = analyzeColumns(targetData.columns, targetData.rows);
      const tableType = detectTableType(targetData.columns, targetData.rows);
      const anomalies = findAnomalies(targetData.columns, targetData.rows);
      const profile = buildDataProfile(targetData.columns, targetData.rows);
      const sampleRows = targetData.rows.slice(0, 12);

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columns: targetData.columns,
          profile,
          columnAnalysis,
          tableType,
          anomalies,
          sampleRows,
          model: getSelectedModel(),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setAnalysis(result);
      } else {
        // 後端 AI 失敗時，仍以前端算好的統計呈現（不阻擋頁面）。
        setAnalysis({ columnAnalysis, tableType, anomalies, profile });
      }
    } catch (error) {
      console.error('Load analysis error:', error);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || !data) return;

    const userMsg = input;
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setInput('');

    // 圖表請求：直接用前端資料產生圖表，不呼叫 AI、不扣點
    if (wantsChart(userMsg)) {
      const chart = buildChartFromData(data.columns, data.rows, userMsg);
      if (chart) {
        const typeLabel = chart.type === 'pie' ? '圓餅圖' : chart.type === 'line' ? '折線圖' : '長條圖';
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: `這是依你的需求產生的${typeLabel}：${chart.title}。若想換成其他欄位或圖型（長條／圓餅／折線），直接告訴我即可。`,
            chart,
          },
        ]);
        return;
      }
      // 無法產生圖表（例如沒有數值欄位）時，提示並改用 AI 回答
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: '這份資料目前找不到可繪圖的數值欄位，我改用文字幫你分析。',
        },
      ]);
    }

    setIsTyping(true);

    try {
      // 只送精簡的 profile + 樣本，避免萬筆資料超過請求大小限制。
      const profile = analysis?.profile ?? buildDataProfile(data.columns, data.rows);
      const sampleRows = data.rows.slice(0, 12);
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMsg,
          columns: data.columns,
          profile,
          sampleRows,
          model: getSelectedModel(),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setMessages((prev) => [...prev, { role: 'assistant', text: result.answer }]);
      } else if (response.status === 402) {
        const result = await response.json().catch(() => ({}));
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: result.message || '點數不足，請至「設定」頁升級方案。',
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: '抱歉，我無法回答這個問題。請稍後再試。' },
        ]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: '發生錯誤，請稍後再試。' },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
          <Database className="w-10 h-10 text-slate-400" />
        </div>
        <h3 className="text-xl font-semibold text-slate-900">尚未載入資料</h3>
        <p className="text-slate-500 text-center max-w-sm">
          你需要先載入資料來源才能使用 AI 資料分析功能。
        </p>
        <Button onClick={() => router.push('/dashboard/upload')} className="mt-4 gap-2">
          前往載入資料
        </Button>
      </div>
    );
  }

  const numericColumns = analysis?.profile?.columns.filter((column) => column.numeric) ?? [];
  const topMetric = analysis?.profile?.categoryMetrics[0];
  const rankingCharts = analysis?.profile?.categoryMetrics?.slice(0, 2) ?? [];
  const anomalies = analysis?.anomalies ?? [];
  // 圓餅圖：取第一組分組排行的佔比（只計正值）
  const pieMetric = analysis?.profile?.categoryMetrics?.[0];
  const pieSlices =
    pieMetric?.topRows
      .filter((row) => row.total > 0)
      .map((row) => ({ label: row.value, value: row.total })) ?? [];
  const insightLines =
    analysis?.insights
      ?.split('\n')
      .map((line) => line.replace(/\s+$/, ''))
      .filter((line) => line.trim().length > 0)
      .slice(0, 60) ?? [];
  const highlights = buildHighlights(analysis, data);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
      {/* Left column: summary + data preview (頁面自然捲動，避免內層卡死) */}
      <div className="flex flex-col gap-6 min-w-0">
      {/* 重點摘要：AI Data Analyst 風格的可行動總結 */}
      <Card className="border-indigo-100 overflow-hidden">
        <div className="p-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Lightbulb className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <h3 className="font-semibold">重點摘要</h3>
              <p className="text-xs text-indigo-100">把資料轉成可行動的重點，免 SQL、免公式</p>
            </div>
          </div>
          {highlights && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => handleDownloadReport('html')}
                title="下載報告（HTML，可用瀏覽器列印成 PDF）"
                className="flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 rounded-md px-2 py-1 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" /> HTML
              </button>
              <button
                onClick={() => handleDownloadReport('md')}
                title="下載報告（Markdown）"
                className="flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 rounded-md px-2 py-1 transition-colors"
              >
                <FileDown className="w-3.5 h-3.5" /> MD
              </button>
            </div>
          )}
        </div>
        {analysisLoading && !highlights ? (
          <div className="p-6 flex items-center gap-2 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> 正在整理重點摘要...
          </div>
        ) : highlights ? (
          <div className="p-4 space-y-4">
            <p className="text-sm text-slate-700 leading-relaxed bg-indigo-50/60 rounded-lg p-3">
              {highlights.headline}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {highlights.items.map((item, idx) => {
                const Icon = HIGHLIGHT_ICON[item.icon];
                return (
                  <div key={idx} className="flex gap-3 rounded-lg border border-slate-200 p-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${HIGHLIGHT_TONE[item.tone]}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-slate-500">{item.label}</div>
                      <div className="text-sm font-semibold text-slate-900 truncate" title={item.value}>
                        {item.value}
                      </div>
                      {item.detail && (
                        <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{item.detail}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-400">
              想深入了解？在右側用聊天問「哪個產品賣最好？」「幫我找異常值」「幫我做圖表」。
            </p>
          </div>
        ) : (
          <div className="p-6 text-sm text-slate-500">
            載入資料後即可看到重點摘要。建議資料含分類（如產品、客戶）與數值（如金額、數量）欄位，摘要會更精準。
          </div>
        )}
      </Card>
      {/* AI 簡報生成（GPT-5.5，扣點 100） */}
      <Card className="border-rose-100 overflow-hidden">
        <div className="p-4 bg-gradient-to-r from-rose-600 to-pink-600 text-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <PresentationIcon className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <h3 className="font-semibold flex items-center gap-1.5">
                AI 簡報生成
                <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-white/20 rounded-full px-2 py-0.5">
                  <Sparkles className="w-3 h-3" /> GPT-5.5
                </span>
              </h3>
              <p className="text-xs text-rose-100">一鍵把這份分析做成可向主管報告的簡報</p>
            </div>
          </div>
          <span className="text-xs font-medium bg-white/20 rounded-full px-2.5 py-1 whitespace-nowrap">扣 100 點</span>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleGeneratePresentation}
              disabled={presentationLoading || analysisLoading}
              className="gap-2 bg-rose-600 hover:bg-rose-700"
            >
              {presentationLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> 產生簡報中...
                </>
              ) : (
                <>
                  <PresentationIcon className="w-4 h-4" /> {presentation ? '重新產生簡報' : '產生簡報'}
                </>
              )}
            </Button>
            {presentation && (
              <>
                <Button onClick={handleDownloadPptx} variant="outline" className="gap-2">
                  <Download className="w-4 h-4" /> 下載 PPTX
                </Button>
                <Button onClick={handleDownloadPresentation} variant="outline" className="gap-2">
                  <Download className="w-4 h-4" /> 下載 HTML
                </Button>
              </>
            )}
          </div>
          {presentationError && (
            <p className="text-sm text-rose-600 bg-rose-50 rounded-lg p-3">{presentationError}</p>
          )}
          {presentationLoading && (
            <p className="text-xs text-slate-500">GPT-5.5 正在依資料統計撰寫投影片，約需 10~30 秒...</p>
          )}
          {presentation && (
            <div className="space-y-3">
              <div className="rounded-lg bg-gradient-to-r from-rose-50 to-pink-50 border border-rose-100 p-4">
                <div className="text-base font-bold text-rose-700">{presentation.title}</div>
                <div className="text-sm text-slate-600 mt-1">{presentation.subtitle}</div>
                <div className="text-xs text-slate-400 mt-2">共 {presentation.slides.length} 張投影片</div>
              </div>
              <div className="space-y-3">
                {presentation.slides.map((slide, idx) => (
                  <div key={idx} className="rounded-lg border border-slate-200 overflow-hidden">
                    <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 border-b border-slate-200">
                      <span className="w-6 h-6 rounded-md bg-rose-600 text-white text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="text-sm font-semibold text-slate-800">{slide.heading}</span>
                    </div>
                    <div className="p-4">
                      <div className={slide.chart ? 'grid md:grid-cols-2 gap-4 items-start' : ''}>
                        <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-700">
                          {slide.bullets.map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                        {slide.chart && (
                          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2">
                            <ChatChart spec={slide.chart} />
                          </div>
                        )}
                      </div>
                      {slide.notes && (
                        <p className="text-xs text-slate-400 mt-3 italic border-t border-slate-100 pt-2">
                          備註：{slide.notes}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {presentation.references && presentation.references.length > 0 && (
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 border-b border-slate-200">
                    <Globe className="w-4 h-4 text-rose-600 shrink-0" />
                    <span className="text-sm font-semibold text-slate-800">參考範例與延伸閱讀（網路搜尋）</span>
                  </div>
                  <ul className="p-4 space-y-2">
                    {presentation.references.map((ref, i) => (
                      <li key={i} className="text-sm">
                        <a
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:underline break-words"
                        >
                          {ref.title}
                        </a>
                        {ref.snippet && <p className="text-xs text-slate-500 mt-0.5">{ref.snippet}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
      {/* 自訂樞紐分析 */}
      <Card className="border-emerald-100 overflow-hidden">
        <div className="p-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center gap-2">
          <Table2 className="w-5 h-5 shrink-0" />
          <div>
            <h3 className="font-semibold">自訂樞紐分析</h3>
            <p className="text-xs text-emerald-100">自選分組欄位、數值欄位與聚合方式，即時彙總（免扣點）</p>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-1">
              <label className="text-xs text-slate-500 mb-1 block">分組欄位</label>
              <select
                value={pivotGroup}
                onChange={(e) => setPivotGroup(Number(e.target.value))}
                className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm bg-white"
              >
                <option value={-1}>請選擇…</option>
                {data.columns.map((c, i) => (
                  <option key={i} value={i}>{c}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-1">
              <label className="text-xs text-slate-500 mb-1 block">聚合方式</label>
              <select
                value={pivotAgg}
                onChange={(e) => setPivotAgg(e.target.value as AggMethod)}
                className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm bg-white"
              >
                {(Object.keys(AGG_LABELS) as AggMethod[]).map((k) => (
                  <option key={k} value={k}>{AGG_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-1">
              <label className="text-xs text-slate-500 mb-1 block">
                數值欄位{pivotAgg === 'count' ? '（計數免選）' : ''}
              </label>
              <select
                value={pivotMetric}
                onChange={(e) => setPivotMetric(Number(e.target.value))}
                disabled={pivotAgg === 'count'}
                className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm bg-white disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value={-1}>請選擇…</option>
                {data.columns.map((c, i) => (
                  <option key={i} value={i}>{c}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-1 flex items-end">
              <Button
                onClick={handleRunPivot}
                disabled={pivotGroup < 0 || (pivotAgg !== 'count' && pivotMetric < 0)}
                className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                <Table2 className="w-4 h-4" /> 產生
              </Button>
            </div>
          </div>
          {pivotChart && (
            <div className="rounded-lg border border-slate-200 p-3">
              <ChatChart spec={pivotChart} />
            </div>
          )}
        </div>
      </Card>
      {/* 我的報告（收藏） */}
      {savedItems.length > 0 && (
        <Card className="border-amber-100 overflow-hidden">
          <div className="p-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <BookmarkPlus className="w-5 h-5 shrink-0" />
              <div className="min-w-0">
                <h3 className="font-semibold">我的報告</h3>
                <p className="text-xs text-amber-100">已收藏 {savedItems.length} 項，可整批匯出</p>
              </div>
            </div>
            <Button onClick={handleExportSaved} variant="secondary" size="sm" className="gap-1.5 shrink-0">
              <FolderDown className="w-4 h-4" /> 匯出全部
            </Button>
          </div>
          <div className="p-4 space-y-2">
            {savedItems.map((item) => (
              <div key={item.id} className="flex items-start gap-2 rounded-lg border border-slate-200 p-3">
                <div className="min-w-0 flex-1">
                  {item.kind === 'chart' && item.chart ? (
                    <div className="text-sm text-slate-700 flex items-center gap-1.5">
                      <BarChart3 className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="truncate">{item.chart.title}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600 line-clamp-3 whitespace-pre-wrap">{item.text}</p>
                  )}
                </div>
                <button
                  onClick={() => removeSavedItem(item.id)}
                  title="移除"
                  className="text-slate-400 hover:text-rose-500 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
      {sheets.length > 1 && (
        <Card className="border-slate-200 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-semibold text-slate-800">
              分頁切換（共 {sheets.length} 個）
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {sheets.map((sheet, index) => (
              <button
                key={`${sheet.sheetName}-${index}`}
                onClick={() => handleSheetChange(index)}
                disabled={analysisLoading}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                  index === activeSheet
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {sheet.sheetName}
                <span className="ml-1 opacity-70">({sheet.rows.length})</span>
              </button>
            ))}
          </div>
        </Card>
      )}
      <Card className="border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="font-semibold text-slate-900">報表分析摘要</h3>
              <p className="text-xs text-slate-500">
                {analysisLoading ? '正在整理欄位、指標與洞察...' : '根據完整資料計算欄位統計、排行與異常'}
              </p>
            </div>
          </div>
          {analysisLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          ) : (
            <Badge variant="default">{analysis?.tableType || data.tableType || '資料表'}</Badge>
          )}
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-md border border-slate-200 p-3">
            <div className="text-xs text-slate-500">資料量</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {(analysis?.profile?.rowCount ?? data.rows.length).toLocaleString()} 筆
            </div>
            <div className="text-xs text-slate-500">{analysis?.profile?.columnCount ?? data.columns.length} 個欄位</div>
          </div>

          <div className="rounded-md border border-slate-200 p-3">
            <div className="text-xs text-slate-500">數值指標</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{numericColumns.length} 個</div>
            <div className="text-xs text-slate-500 truncate">
              {numericColumns.slice(0, 3).map((column) => column.name).join('、') || '尚未偵測到'}
            </div>
          </div>

          <div className="rounded-md border border-slate-200 p-3">
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <AlertTriangle className="w-3.5 h-3.5" />
              異常提示
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {analysis?.anomalies?.length ?? 0} 筆
            </div>
            <div className="text-xs text-slate-500">超出統計門檻的資料列</div>
          </div>

          <div className="rounded-md border border-slate-200 p-3">
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <TrendingUp className="w-3.5 h-3.5" />
              主要排行
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900 truncate">
              {topMetric ? `${topMetric.categoryColumn} / ${topMetric.metricColumn}` : '尚未偵測到'}
            </div>
            <div className="text-xs text-slate-500 truncate">
              {topMetric?.topRows[0] ? `${topMetric.topRows[0].value}: ${topMetric.topRows[0].total.toLocaleString()}` : '需要分類與數值欄位'}
            </div>
          </div>
        </div>

        {insightLines.length > 0 && (
          <div className="px-4 pb-4">
            <div className="rounded-md bg-slate-50 border border-slate-200 p-4 text-sm text-slate-800 leading-relaxed">
              {insightLines.map((line, index) => {
                const trimmed = line.trim();
                const isHeader = /^\*\*.+\*\*$/.test(trimmed);
                if (isHeader) {
                  return (
                    <div
                      key={index}
                      className="font-semibold text-indigo-900 text-[15px] mt-4 first:mt-0 pb-1 mb-1 border-b border-indigo-100"
                    >
                      {trimmed.slice(2, -2)}
                    </div>
                  );
                }
                // 子項目（排行用兩格縮排）保留階層
                const indent = line.startsWith('  ');
                const isBullet = trimmed.startsWith('- ');
                const content = isBullet ? trimmed.slice(2) : trimmed;
                return (
                  <div
                    key={index}
                    className={`flex gap-2 ${indent ? 'pl-6' : 'pl-1'} py-0.5`}
                  >
                    {isBullet && <span className="text-indigo-400 shrink-0">•</span>}
                    <span className={indent ? 'text-slate-600' : ''}>
                      {content.split(/(\*\*.*?\*\*)/).map((part, partIndex) =>
                        part.startsWith('**') && part.endsWith('**') ? (
                          <strong key={partIndex} className="font-semibold text-slate-900">
                            {part.slice(2, -2)}
                          </strong>
                        ) : (
                          part
                        )
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Data Preview */}
      <Card className="flex flex-col overflow-hidden border-slate-200">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-slate-500" />
            <h3 className="font-semibold text-sm">
              資料預覽 (分頁：{data.sheetName} ｜ 來源：{data.fileName})
            </h3>
          </div>
          <Badge variant="default">已解析 {data.rows.length} 筆</Badge>
        </div>
        <div className="max-h-[420px] overflow-auto p-0">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 border-b border-slate-200 shadow-sm">
              <tr>
                {data.columns.map((col, idx) => (
                  <th key={idx} className="px-4 py-3 font-semibold">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50/50">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-4 py-2.5 text-slate-700">
                      {typeof cell === 'number' ? cell.toLocaleString() : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 分析圖：分組排行長條圖 */}
      {rankingCharts.length > 0 && (
        <Card className="border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            <h3 className="font-semibold text-sm">分析圖 · 分組排行</h3>
          </div>
          <div className="p-4 space-y-6">
            {rankingCharts.map((metric, mIdx) => {
              const maxTotal = Math.max(...metric.topRows.map((r) => Math.abs(r.total)), 1);
              return (
                <div key={mIdx}>
                  <div className="text-xs font-medium text-slate-600 mb-2">
                    依「{metric.categoryColumn}」分組看「{metric.metricColumn}」（前 {metric.topRows.length} 名）
                  </div>
                  <div className="space-y-2">
                    {metric.topRows.map((row, rIdx) => (
                      <div key={rIdx} className="flex items-center gap-2">
                        <div className="w-24 shrink-0 truncate text-xs text-slate-700" title={row.value}>
                          {row.value}
                        </div>
                        <div className="flex-1 bg-slate-100 rounded h-5 overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded flex items-center justify-end pr-2"
                            style={{ width: `${Math.max((Math.abs(row.total) / maxTotal) * 100, 4)}%` }}
                          >
                            <span className="text-[10px] text-white font-medium whitespace-nowrap">
                              {row.total.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 分析圖：圓餅圖（佔比） */}
      {pieMetric && pieSlices.length > 0 && (
        <Card className="border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <PieChartIcon className="w-4 h-4 text-indigo-600" />
            <h3 className="font-semibold text-sm">分析圖 · 佔比圓餅圖</h3>
          </div>
          <div className="p-4">
            <div className="text-xs font-medium text-slate-600 mb-3">
              「{pieMetric.categoryColumn}」對「{pieMetric.metricColumn}」的佔比（前 {pieSlices.length} 名）
            </div>
            <PieChart slices={pieSlices} />
          </div>
        </Card>
      )}

      {/* 異常與風險明細 */}
      <Card className="border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3 className="font-semibold text-sm">異常與風險</h3>
          </div>
          <Badge variant={anomalies.length > 0 ? 'destructive' : 'secondary'}>
            {anomalies.length} 筆
          </Badge>
        </div>
        <div className="p-4">
          {analysisLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> 正在偵測異常與資料品質...
            </div>
          ) : anomalies.length > 0 ? (
            <ul className="space-y-2 max-h-[280px] overflow-auto">
              {anomalies.map((item, idx) => (
                <li key={idx} className="rounded-md border border-amber-100 bg-amber-50/60 p-3 text-sm">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-amber-800">{item.column}</span>
                    {item.row > 0 && (
                      <span className="text-xs text-amber-600">第 {item.row} 列</span>
                    )}
                    <span className="text-xs text-slate-500">值：{String(item.value)}</span>
                  </div>
                  <div className="text-xs text-slate-600">{item.reason}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              目前未偵測到統計型異常（離群值、空值過多或極端倍數）。資料量較少或分布平均時屬正常；若要更精準判讀，建議補上金額、數量、日期或客戶欄位。
            </p>
          )}
        </div>
      </Card>
      </div>

      {/* Right column: AI Chat (sticky 自帶高度，不被摘要往下擠) */}
      <Card className="flex flex-col overflow-hidden border-indigo-100 shadow-md h-[600px] lg:sticky lg:top-0 lg:self-start lg:h-[calc(100vh-8rem)]">
        <div className="p-4 border-b border-slate-100 bg-indigo-50/50 flex items-center gap-2">
          <Bot className="w-5 h-5 text-indigo-600" />
          <h3 className="font-semibold text-indigo-900">AI 資料助理</h3>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-none'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-sm'
                }`}
              >
                {msg.text.split('\n').map((line, i) => (
                  <div key={i} className="min-h-[1em]">
                    {line.split(/(\*\*.*?\*\*)/).map((part, j) =>
                      part.startsWith('**') && part.endsWith('**') ? (
                        <strong key={j} className="font-semibold">
                          {part.slice(2, -2)}
                        </strong>
                      ) : (
                        part
                      )
                    )}
                  </div>
                ))}
                {msg.chart && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <ChatChart spec={msg.chart} />
                  </div>
                )}
                {msg.role === 'assistant' && (msg.text.trim() || msg.chart) && (
                  <div className="mt-2 pt-2 border-t border-slate-100 flex justify-end">
                    <button
                      onClick={() =>
                        addSavedItem(
                          msg.chart
                            ? { kind: 'chart', chart: msg.chart, text: msg.text }
                            : { kind: 'text', text: msg.text }
                        )
                      }
                      title="加入我的報告"
                      className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-amber-600 transition-colors"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" /> 加入我的報告
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex items-center gap-1.5">
                <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce"></div>
                <div
                  className="w-2 h-2 bg-slate-300 rounded-full animate-bounce"
                  style={{ animationDelay: '0.15s' }}
                ></div>
                <div
                  className="w-2 h-2 bg-slate-300 rounded-full animate-bounce"
                  style={{ animationDelay: '0.3s' }}
                ></div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="p-3 border-t border-slate-100 bg-white">
          <div className="relative">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="問我關於資料的問題..."
              className="pr-12 resize-none min-h-[60px]"
            />
            <Button
              size="icon"
              className="absolute right-2 bottom-2 h-8 w-8 rounded-full"
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
            {['哪些商品賣最好？', '幫我畫長條圖', '幫我做圓餅圖', '幫我找出異常'].map((suggestion) => (
              <Badge
                key={suggestion}
                variant="secondary"
                className="cursor-pointer whitespace-nowrap hover:bg-slate-200"
                onClick={() => setInput(suggestion)}
              >
                {suggestion}
              </Badge>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

const PIE_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4',
  '#8b5cf6', '#ef4444', '#14b8a6', '#eab308', '#3b82f6',
];

function escapeXml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncateLabel(s: string, max = 14) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// 把圖表規格輸出成獨立可下載的 SVG 字串（含標題、圖例、座標）。
function buildChartSvg(spec: ChartSpec): string {
  const W = 680;
  const H = 420;
  const top = 56;
  const header = `<text x="20" y="30" font-family="sans-serif" font-size="16" font-weight="700" fill="#0f172a">${escapeXml(spec.title)}</text>`;
  let body = '';

  if (spec.type === 'pie') {
    const data = spec.data.filter((d) => d.value > 0);
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    const cx = 150;
    const cy = 235;
    const r = 115;
    let cum = 0;
    const polar = (a: number) => {
      const rad = ((a - 90) * Math.PI) / 180;
      return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    };
    const paths = data
      .map((d, i) => {
        const start = (cum / total) * 360;
        cum += d.value;
        const end = (cum / total) * 360;
        const s = polar(start);
        const e = polar(end);
        const large = end - start > 180 ? 1 : 0;
        const dd =
          data.length === 1
            ? `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`
            : `M ${cx} ${cy} L ${s.x.toFixed(1)} ${s.y.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(1)} ${e.y.toFixed(1)} Z`;
        return `<path d="${dd}" fill="${PIE_COLORS[i % PIE_COLORS.length]}" stroke="#fff" stroke-width="1.5"/>`;
      })
      .join('');
    const legend = data
      .map((d, i) => {
        const y = 90 + i * 26;
        const pct = ((d.value / total) * 100).toFixed(1);
        return (
          `<rect x="330" y="${y - 11}" width="13" height="13" rx="2" fill="${PIE_COLORS[i % PIE_COLORS.length]}"/>` +
          `<text x="352" y="${y}" font-family="sans-serif" font-size="13" fill="#334155">${escapeXml(truncateLabel(d.label, 18))}</text>` +
          `<text x="660" y="${y}" text-anchor="end" font-family="sans-serif" font-size="13" fill="#0f172a">${d.value.toLocaleString()} (${pct}%)</text>`
        );
      })
      .join('');
    body = paths + legend;
  } else if (spec.type === 'line') {
    const pad = 56;
    const plotW = W - pad * 2;
    const plotH = H - top - 50;
    const values = spec.data.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const n = Math.max(spec.data.length - 1, 1);
    const coords = spec.data.map((p, i) => {
      const x = pad + (i * plotW) / n;
      const y = top + plotH - ((p.value - min) / range) * plotH;
      return { x, y };
    });
    const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    const dots = coords.map((c) => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3" fill="#6366f1"/>`).join('');
    const axis = `<line x1="${pad}" y1="${top + plotH}" x2="${W - pad}" y2="${top + plotH}" stroke="#cbd5e1" stroke-width="1"/>`;
    const labels =
      `<text x="${pad}" y="${top + plotH + 22}" font-family="sans-serif" font-size="11" fill="#94a3b8">${escapeXml(truncateLabel(spec.data[0].label))}</text>` +
      `<text x="${W - pad}" y="${top + plotH + 22}" text-anchor="end" font-family="sans-serif" font-size="11" fill="#94a3b8">${escapeXml(truncateLabel(spec.data[spec.data.length - 1].label))}</text>`;
    body = axis + `<path d="${path}" fill="none" stroke="#6366f1" stroke-width="2.5"/>` + dots + labels;
  } else {
    const max = Math.max(...spec.data.map((b) => Math.abs(b.value)), 1);
    const plotX = 170;
    const plotW = W - plotX - 90;
    const rowH = Math.min(34, (H - top - 16) / spec.data.length);
    body = spec.data
      .map((b, i) => {
        const y = top + i * rowH;
        const bw = Math.max((Math.abs(b.value) / max) * plotW, 2);
        return (
          `<text x="20" y="${(y + rowH / 2 + 4).toFixed(1)}" font-family="sans-serif" font-size="12" fill="#475569">${escapeXml(truncateLabel(b.label, 18))}</text>` +
          `<rect x="${plotX}" y="${(y + 4).toFixed(1)}" width="${bw.toFixed(1)}" height="${(rowH - 10).toFixed(1)}" rx="3" fill="#6366f1"/>` +
          `<text x="${(plotX + bw + 6).toFixed(1)}" y="${(y + rowH / 2 + 4).toFixed(1)}" font-family="sans-serif" font-size="11" fill="#0f172a">${b.value.toLocaleString()}</text>`
        );
      })
      .join('');
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#ffffff"/>${header}${body}</svg>`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadChartPng(spec: ChartSpec) {
  const svg = buildChartSvg(spec);
  const svg64 = btoa(unescape(encodeURIComponent(svg)));
  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = 680 * scale;
    canvas.height = 420 * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 680, 420);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) triggerDownload(blob, `${spec.title || '圖表'}.png`);
    }, 'image/png');
  };
  img.src = `data:image/svg+xml;base64,${svg64}`;
}

function downloadChartCsv(spec: ChartSpec) {
  const rows = [['項目', '數值'], ...spec.data.map((d) => [d.label, String(d.value)])];
  const csv =
    '\ufeff' +
    rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${spec.title || '圖表資料'}.csv`);
}

function PieChart({ slices }: { slices: Array<{ label: string; value: number }> }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return null;

  const radius = 80;
  const cx = 90;
  const cy = 90;
  let cumulative = 0;

  const polar = (angle: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  };

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <svg viewBox="0 0 180 180" className="w-44 h-44 shrink-0">
        {slices.length === 1 ? (
          <circle cx={cx} cy={cy} r={radius} fill={PIE_COLORS[0]} />
        ) : (
          slices.map((slice, idx) => {
            const startAngle = (cumulative / total) * 360;
            cumulative += slice.value;
            const endAngle = (cumulative / total) * 360;
            const start = polar(startAngle);
            const end = polar(endAngle);
            const largeArc = endAngle - startAngle > 180 ? 1 : 0;
            const d = `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
            return <path key={idx} d={d} fill={PIE_COLORS[idx % PIE_COLORS.length]} stroke="#fff" strokeWidth="1" />;
          })
        )}
      </svg>
      <div className="flex-1 w-full space-y-1.5">
        {slices.map((slice, idx) => {
          const pct = (slice.value / total) * 100;
          return (
            <div key={idx} className="flex items-center gap-2 text-xs">
              <span
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
              />
              <span className="flex-1 truncate text-slate-700" title={slice.label}>
                {slice.label}
              </span>
              <span className="text-slate-500 tabular-nums">{slice.value.toLocaleString()}</span>
              <span className="w-12 text-right font-medium text-slate-800 tabular-nums">
                {pct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 聊天中的圖表：依規格渲染長條 / 圓餅 / 折線
const CHART_TYPE_OPTIONS: Array<{ type: ChartType; label: string; Icon: typeof BarChart3 }> = [
  { type: 'bar', label: '長條', Icon: BarChart3 },
  { type: 'pie', label: '圓餅', Icon: PieChartIcon },
  { type: 'line', label: '折線', Icon: TrendingUp },
];

function ChatChart({ spec }: { spec: ChartSpec }) {
  // 允許在同一份資料上即時切換圖型（長條／圓餅／折線），不需重新提問。
  const [type, setType] = useState<ChartType>(spec.type);
  // 圓餅圖只取正值；其餘維持原資料。
  const data = type === 'pie' ? spec.data.filter((d) => d.value > 0) : spec.data;
  const current: ChartSpec = { ...spec, type, data };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="text-xs font-medium text-slate-600 min-w-0 truncate" title={spec.title}>
          {spec.title}
        </div>
        <div className="flex items-center gap-1">
          {/* 圖型切換 */}
          <div className="flex items-center rounded-md border border-slate-200 overflow-hidden">
            {CHART_TYPE_OPTIONS.map(({ type: t, label, Icon }) => (
              <button
                key={t}
                onClick={() => setType(t)}
                title={`切換為${label}圖`}
                className={`flex items-center gap-1 px-2 py-1 text-[11px] transition-colors ${
                  type === t ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          {/* 下載 */}
          <button
            onClick={() => downloadChartPng(current)}
            title="下載 PNG 圖片"
            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <Download className="w-3 h-3" /> PNG
          </button>
          <button
            onClick={() => downloadChartCsv(current)}
            title="下載資料 CSV"
            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <Download className="w-3 h-3" /> CSV
          </button>
        </div>
      </div>
      {type === 'pie' ? (
        <PieChart slices={data.map((d) => ({ label: d.label, value: d.value }))} />
      ) : type === 'line' ? (
        <LineChart points={data} />
      ) : (
        <BarChart bars={data} />
      )}
    </div>
  );
}

function BarChart({ bars }: { bars: Array<{ label: string; value: number }> }) {
  const max = Math.max(...bars.map((b) => Math.abs(b.value)), 1);
  return (
    <div className="space-y-1.5">
      {bars.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-20 shrink-0 truncate text-[11px] text-slate-600" title={b.label}>
            {b.label}
          </div>
          <div className="flex-1 bg-slate-100 rounded h-5 overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded flex items-center justify-end pr-2"
              style={{ width: `${Math.max((Math.abs(b.value) / max) * 100, 4)}%` }}
            >
              <span className="text-[10px] text-white font-medium whitespace-nowrap">
                {b.value.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LineChart({ points }: { points: Array<{ label: string; value: number }> }) {
  if (points.length < 2) return <BarChart bars={points} />;
  const w = 320;
  const h = 140;
  const pad = 8;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((p.value - min) / range) * (h - pad * 2);
    return { x, y };
  });
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-36">
        <path d={path} fill="none" stroke="#6366f1" strokeWidth="2" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="2.5" fill="#6366f1" />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        <span className="truncate max-w-[45%]" title={points[0].label}>{points[0].label}</span>
        <span className="truncate max-w-[45%] text-right" title={points[points.length - 1].label}>
          {points[points.length - 1].label}
        </span>
      </div>
    </div>
  );
}

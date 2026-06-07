'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, BarChart3, Bot, Database, Loader2, Send, TrendingUp, Layers, PieChart as PieChartIcon, Lightbulb, Trophy, Target, Gauge } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getSelectedModel } from '@/lib/client-model';

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
    activateSheet(data, sheets, index);
  };

  const loadAnalysis = async (targetData: Data) => {
    setAnalysisLoading(true);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columns: targetData.columns,
          rows: targetData.rows,
          model: getSelectedModel(),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setAnalysis(result);
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
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMsg,
          columns: data.columns,
          rows: data.rows,
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
        <div className="p-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex items-center gap-2">
          <Lightbulb className="w-5 h-5" />
          <div>
            <h3 className="font-semibold">重點摘要</h3>
            <p className="text-xs text-indigo-100">把資料轉成可行動的重點，免 SQL、免公式</p>
          </div>
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
function ChatChart({ spec }: { spec: ChartSpec }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-600 mb-2">{spec.title}</div>
      {spec.type === 'pie' ? (
        <PieChart slices={spec.data.map((d) => ({ label: d.label, value: d.value }))} />
      ) : spec.type === 'line' ? (
        <LineChart points={spec.data} />
      ) : (
        <BarChart bars={spec.data} />
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

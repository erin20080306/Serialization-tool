'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, BarChart3, Bot, Database, Loader2, Send, TrendingUp, Layers } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getSelectedModel } from '@/lib/client-model';

interface Message {
  role: 'user' | 'assistant';
  text: string;
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
  const insightLines =
    analysis?.insights
      ?.split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 10) ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
      {/* Left column: summary + data preview (頁面自然捲動，避免內層卡死) */}
      <div className="flex flex-col gap-6 min-w-0">
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
            <div className="rounded-md bg-indigo-50 border border-indigo-100 p-4 text-sm text-slate-800 leading-relaxed space-y-1">
              {insightLines.map((line, index) => (
                <div key={index}>
                  {line.split(/(\*\*.*?\*\*)/).map((part, partIndex) =>
                    part.startsWith('**') && part.endsWith('**') ? (
                      <strong key={partIndex} className="font-semibold text-indigo-900">
                        {part.slice(2, -2)}
                      </strong>
                    ) : (
                      part
                    )
                  )}
                </div>
              ))}
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
            {['哪些商品賣最好？', '幫我找出異常', '產生週報大綱'].map((suggestion) => (
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

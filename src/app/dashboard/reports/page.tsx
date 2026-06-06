'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BarChart3, CheckCircle2, Database, Download, FileText, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Data {
  columns: string[];
  rows: any[][];
  fileName?: string;
}

export default function ReportsPage() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisPreview, setAnalysisPreview] = useState<string | null>(null);
  const [options, setOptions] = useState({
    includeSummary: true,
    includeStatistics: true,
    includeRawData: true,
  });

  useEffect(() => {
    const storedData = sessionStorage.getItem('uploadedData');
    if (storedData) {
      const parsedData = JSON.parse(storedData);
      setData(parsedData);
      void loadAnalysisPreview(parsedData);
    }
  }, []);

  const loadAnalysisPreview = async (targetData: Data) => {
    setAnalysisLoading(true);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columns: targetData.columns,
          rows: targetData.rows,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setAnalysisPreview(result.insights || null);
      }
    } catch (error) {
      console.error('Load report analysis preview error:', error);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!data) return;
    setGenerating(true);
    setDone(false);

    try {
      const response = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columns: data.columns,
          rows: data.rows,
          options,
        }),
      });

      if (response.ok) {
        // 下載產生的 Excel 檔案
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Analysis_Report.xlsx';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        setDone(true);
      } else {
        alert('報表產生失敗，請稍後再試');
      }
    } catch (error) {
      console.error('Generate report error:', error);
      alert('報表產生失敗，請稍後再試');
    } finally {
      setGenerating(false);
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
          你需要先載入資料來源才能使用自動報表輸出功能。
        </p>
        <Button onClick={() => router.push('/dashboard/upload')} className="mt-4 gap-2">
          前往載入資料
        </Button>
      </div>
    );
  }

  const checkboxes = [
    { key: 'includeSummary' as const, title: 'Summary Sheet (摘要頁)', desc: '包含總計、AI 洞察結論' },
    { key: 'includeStatistics' as const, title: '統計分析 Sheet', desc: '自動產生欄位統計分析' },
    { key: 'includeRawData' as const, title: 'Raw Data (原始資料)', desc: '套用專業表格樣式與篩選器' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">自動報表輸出</h2>
        <p className="text-slate-500 mt-1">根據分析結果，一鍵產生包含樣式與洞察的專業 Excel 報表。</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 space-y-6">
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">報表內容設定</h3>
            <div className="space-y-3">
              {checkboxes.map((cb) => (
                <label
                  key={cb.key}
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-indigo-600 rounded"
                    checked={options[cb.key]}
                    onChange={(e) => setOptions({ ...options, [cb.key]: e.target.checked })}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">{cb.title}</div>
                    <div className="text-xs text-slate-500">{cb.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <Button
            className="w-full h-12 text-lg gap-2"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> 報表生成中 (使用 exceljs)...
              </>
            ) : (
              <>
                <FileText className="w-5 h-5" /> 產生專業 Excel 報表
              </>
            )}
          </Button>
        </Card>

        <div className="space-y-4">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              <h3 className="font-semibold text-lg">報表洞察預覽</h3>
            </div>
            {analysisLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                正在整理報表摘要...
              </div>
            ) : analysisPreview ? (
              <div className="text-sm text-slate-700 leading-relaxed space-y-1 max-h-[360px] overflow-auto">
                {analysisPreview
                  .split('\n')
                  .map((line) => line.trim())
                  .filter((line) => line.length > 0)
                  .slice(0, 14)
                  .map((line, index) => (
                    <div key={index}>{line.replace(/\*\*/g, '')}</div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">尚未取得 AI 洞察，但仍可產生含統計與原始資料的 Excel 報表。</p>
            )}
          </Card>

          {done && (
            <Card className="p-8 flex flex-col items-center justify-center text-center bg-green-50/50 border-green-200">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Analysis_Report.xlsx</h3>
              <p className="text-sm text-slate-600 mb-6 max-w-[250px]">
                已成功建立包含摘要、統計與樣式設定的報表檔案，並已下載。
              </p>
              <div className="flex gap-3 w-full">
                <Button className="flex-1 gap-2 bg-green-600 hover:bg-green-700" onClick={handleGenerate}>
                  <Download className="w-4 h-4" /> 重新下載
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Sparkles, Loader2, FileJson } from 'lucide-react';

interface FormulaResult {
  formula: string;
  platform: string;
  description: string;
  assumptions: string[];
  troubleshooting?: string[];
}

export default function FormulaGeneratorPage() {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<FormulaResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState<string[] | null>(null);

  useEffect(() => {
    // 讀取已上傳資料的欄位作為提示
    const storedData = sessionStorage.getItem('uploadedData');
    if (storedData) {
      const data = JSON.parse(storedData);
      setColumns(data.columns);
    }
  }, []);

  const handleGenerate = async () => {
    if (!prompt) return;
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/generate-formula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, columns }),
      });

      if (response.ok) {
        const data = await response.json();
        setResult(data);
      } else {
        alert('公式產生失敗，請稍後再試');
      }
    } catch (error) {
      console.error('Generate formula error:', error);
      alert('公式產生失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">AI 公式產生器</h2>
        <p className="text-slate-500 mt-1">
          用白話文描述你想做的事，AI 自動寫出正確的 Excel / Sheets 公式。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <div className="space-y-2">
            <Label className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-500" />
              描述你的計算需求
            </Label>
            <Textarea
              placeholder="例如：幫我加總「地區」是北區的所有「營業額」..."
              className="min-h-[120px] text-base"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
          {columns && (
            <div className="bg-slate-50 p-3 rounded-md text-sm border border-slate-100">
              <span className="font-semibold text-slate-700">💡 提示：</span>
              <span className="text-slate-500">
                {' '}
                系統已讀取你的資料，包含欄位：{columns.join(', ')}
              </span>
            </div>
          )}
          <Button className="w-full gap-2" onClick={handleGenerate} disabled={loading || !prompt}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            產生公式
          </Button>
        </Card>

        <Card className="p-6 bg-slate-900 text-slate-50">
          <div className="flex items-center gap-2 mb-6 text-slate-300">
            <Sparkles className="w-5 h-5" />
            <h3 className="font-semibold">產生結果</h3>
          </div>

          {loading ? (
            <div className="h-full flex items-center justify-center min-h-[200px]">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            </div>
          ) : result ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-400 text-xs uppercase tracking-wider">Formula</Label>
                  <Badge variant="secondary" className="bg-slate-800 text-slate-300 border-none">
                    {result.platform}
                  </Badge>
                </div>
                <div className="bg-slate-950 p-4 rounded-lg font-mono text-emerald-400 text-lg border border-slate-800 break-all select-all">
                  {result.formula}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-400 text-xs uppercase tracking-wider">說明</Label>
                <p className="text-sm text-slate-300 leading-relaxed">{result.description}</p>
              </div>

              {result.assumptions && result.assumptions.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-slate-400 text-xs uppercase tracking-wider">欄位假設</Label>
                  <ul className="list-disc list-inside text-sm text-slate-400">
                    {result.assumptions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.troubleshooting && result.troubleshooting.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-slate-400 text-xs uppercase tracking-wider">錯誤排查</Label>
                  <ul className="list-disc list-inside text-sm text-slate-400">
                    {result.troubleshooting.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center min-h-[200px] text-slate-500 text-center space-y-2">
              <FileJson className="w-10 h-10 mb-2 opacity-50" />
              <p>在左側輸入需求，</p>
              <p>結果將顯示於此。</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

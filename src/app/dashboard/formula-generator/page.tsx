'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Sparkles, Loader2, FileJson, Wand2, BookOpen, Wrench } from 'lucide-react';
import { getSelectedModel } from '@/lib/client-model';

type Mode = 'generate' | 'explain' | 'fix';

interface GenerateResult {
  formula: string;
  platform: string;
  description: string;
  assumptions: string[];
  troubleshooting?: string[];
}

interface ExplainResult {
  summary: string;
  breakdown: string[];
  example?: string;
  caveats?: string[];
}

interface FixResult {
  fixedFormula: string;
  platform?: string;
  diagnosis: string;
  changes: string[];
  tips?: string[];
}

const MODE_TABS: { id: Mode; label: string; icon: typeof Wand2 }[] = [
  { id: 'generate', label: '產生公式', icon: Wand2 },
  { id: 'explain', label: '解釋公式', icon: BookOpen },
  { id: 'fix', label: '修正錯誤', icon: Wrench },
];

export default function FormulaGeneratorPage() {
  const [mode, setMode] = useState<Mode>('generate');
  const [prompt, setPrompt] = useState('');
  const [formula, setFormula] = useState('');
  const [problem, setProblem] = useState('');
  const [genResult, setGenResult] = useState<GenerateResult | null>(null);
  const [explainResult, setExplainResult] = useState<ExplainResult | null>(null);
  const [fixResult, setFixResult] = useState<FixResult | null>(null);
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

  const clearResults = () => {
    setGenResult(null);
    setExplainResult(null);
    setFixResult(null);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    clearResults();
  };

  const canSubmit =
    mode === 'generate' ? !!prompt.trim() : !!formula.trim();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    clearResults();

    const model = getSelectedModel();
    const endpoint =
      mode === 'generate'
        ? '/api/generate-formula'
        : mode === 'explain'
        ? '/api/explain-formula'
        : '/api/fix-formula';
    const body =
      mode === 'generate'
        ? { prompt, columns, model }
        : mode === 'explain'
        ? { formula, model }
        : { formula, problem, columns, model };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data = await response.json();
        if (mode === 'generate') setGenResult(data);
        else if (mode === 'explain') setExplainResult(data);
        else setFixResult(data);
      } else if (response.status === 402) {
        const data = await response.json().catch(() => ({}));
        alert(data.message || '點數不足，請至「設定」頁升級方案。');
      } else {
        alert('處理失敗，請稍後再試');
      }
    } catch (error) {
      console.error('Formula tool error:', error);
      alert('處理失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const subtitle =
    mode === 'generate'
      ? '用白話文描述你想做的事，AI 自動寫出正確的 Excel / Sheets 公式。'
      : mode === 'explain'
      ? '貼上一段看不懂的公式，AI 幫你逐步拆解、白話解釋。'
      : '貼上有錯誤或結果不對的公式，AI 幫你診斷並修正。';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">AI 公式助手</h2>
        <p className="text-slate-500 mt-1">{subtitle}</p>
      </div>

      {/* 模式切換 */}
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
        {MODE_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = mode === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => switchMode(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                active ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 輸入區 */}
        <Card className="p-6 space-y-4">
          {mode === 'generate' ? (
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
          ) : (
            <div className="space-y-2">
              <Label className="text-base flex items-center gap-2">
                <FileJson className="w-4 h-4 text-indigo-500" />
                貼上你的公式
              </Label>
              <Textarea
                placeholder="例如：=VLOOKUP(A2,Sheet2!A:B,2,FALSE)"
                className="min-h-[120px] text-base font-mono"
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
              />
            </div>
          )}

          {mode === 'fix' && (
            <div className="space-y-2">
              <Label className="text-base flex items-center gap-2">
                <Wrench className="w-4 h-4 text-indigo-500" />
                發生什麼問題？（可選）
              </Label>
              <Textarea
                placeholder="例如：出現 #REF! 錯誤 / 結果是 0 / 跨表參照失效..."
                className="min-h-[70px]"
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
              />
            </div>
          )}

          {columns && mode !== 'explain' && (
            <div className="bg-slate-50 p-3 rounded-md text-sm border border-slate-100">
              <span className="font-semibold text-slate-700">💡 提示：</span>
              <span className="text-slate-500">
                {' '}
                系統已讀取你的資料，包含欄位：{columns.join(', ')}
              </span>
            </div>
          )}

          <Button className="w-full gap-2" onClick={handleSubmit} disabled={loading || !canSubmit}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {mode === 'generate' ? '產生公式' : mode === 'explain' ? '解釋公式' : '修正公式'}
          </Button>
        </Card>

        {/* 結果區 */}
        <Card className="p-6 bg-slate-900 text-slate-50">
          <div className="flex items-center gap-2 mb-6 text-slate-300">
            <Sparkles className="w-5 h-5" />
            <h3 className="font-semibold">
              {mode === 'generate' ? '產生結果' : mode === 'explain' ? '公式解釋' : '修正結果'}
            </h3>
          </div>

          {loading ? (
            <div className="h-full flex items-center justify-center min-h-[200px]">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            </div>
          ) : genResult ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-400 text-xs uppercase tracking-wider">Formula</Label>
                  <Badge variant="secondary" className="bg-slate-800 text-slate-300 border-none">
                    {genResult.platform}
                  </Badge>
                </div>
                <div className="bg-slate-950 p-4 rounded-lg font-mono text-emerald-400 text-lg border border-slate-800 break-all select-all">
                  {genResult.formula}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400 text-xs uppercase tracking-wider">說明</Label>
                <p className="text-sm text-slate-300 leading-relaxed">{genResult.description}</p>
              </div>
              {genResult.assumptions?.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-slate-400 text-xs uppercase tracking-wider">欄位假設</Label>
                  <ul className="list-disc list-inside text-sm text-slate-400">
                    {genResult.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}
              {genResult.troubleshooting && genResult.troubleshooting.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-slate-400 text-xs uppercase tracking-wider">錯誤排查</Label>
                  <ul className="list-disc list-inside text-sm text-slate-400">
                    {genResult.troubleshooting.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ) : explainResult ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-slate-400 text-xs uppercase tracking-wider">總結</Label>
                <p className="text-sm text-slate-200 leading-relaxed">{explainResult.summary}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400 text-xs uppercase tracking-wider">逐步拆解</Label>
                <ol className="list-decimal list-inside text-sm text-slate-300 space-y-1.5">
                  {explainResult.breakdown.map((b, i) => <li key={i}>{b}</li>)}
                </ol>
              </div>
              {explainResult.example && (
                <div className="space-y-2">
                  <Label className="text-slate-400 text-xs uppercase tracking-wider">範例</Label>
                  <p className="text-sm text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-lg border border-slate-800">
                    {explainResult.example}
                  </p>
                </div>
              )}
              {explainResult.caveats && explainResult.caveats.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-slate-400 text-xs uppercase tracking-wider">注意事項</Label>
                  <ul className="list-disc list-inside text-sm text-amber-300/90">
                    {explainResult.caveats.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ) : fixResult ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-400 text-xs uppercase tracking-wider">修正後公式</Label>
                  {fixResult.platform && (
                    <Badge variant="secondary" className="bg-slate-800 text-slate-300 border-none">
                      {fixResult.platform}
                    </Badge>
                  )}
                </div>
                <div className="bg-slate-950 p-4 rounded-lg font-mono text-emerald-400 text-lg border border-slate-800 break-all select-all">
                  {fixResult.fixedFormula}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400 text-xs uppercase tracking-wider">問題診斷</Label>
                <p className="text-sm text-slate-300 leading-relaxed">{fixResult.diagnosis}</p>
              </div>
              {fixResult.changes?.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-slate-400 text-xs uppercase tracking-wider">修改內容</Label>
                  <ul className="list-disc list-inside text-sm text-slate-300">
                    {fixResult.changes.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}
              {fixResult.tips && fixResult.tips.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-slate-400 text-xs uppercase tracking-wider">避免再犯</Label>
                  <ul className="list-disc list-inside text-sm text-slate-400">
                    {fixResult.tips.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center min-h-[200px] text-slate-500 text-center space-y-2">
              <FileJson className="w-10 h-10 mb-2 opacity-50" />
              <p>在左側輸入內容，</p>
              <p>結果將顯示於此。</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

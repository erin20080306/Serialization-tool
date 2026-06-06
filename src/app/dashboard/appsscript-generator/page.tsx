'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Terminal, FileCode2, Loader2 } from 'lucide-react';
import { getSelectedModel } from '@/lib/client-model';

interface ScriptResult {
  code: string;
  instructions: string[];
  permissions: string[];
  triggers?: string[];
}

const SCENARIOS = [
  { label: '每日自動寄報表', prompt: '每天早上 8 點，讀取這個工作表的資料，並寄信給 manager@example.com' },
  { label: '表單送出通知', prompt: '表單有人填寫送出後，立刻發送 Slack 通知' },
  { label: '自動備份', prompt: '每天早上自動備份此試算表並加上日期' },
  { label: '自動產生 PDF', prompt: '把目前的工作表匯出成 PDF 並儲存到 Google Drive' },
  { label: '清理重複資料', prompt: '自動掃描並刪除工作表中的重複資料列' },
  { label: '標記異常資料', prompt: '自動標記數值異常（超出平均值兩個標準差）的資料列為紅色' },
];

export default function AppsScriptGeneratorPage() {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<ScriptResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!prompt) return;
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/generate-appsscript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model: getSelectedModel() }),
      });

      if (response.ok) {
        const data = await response.json();
        setResult(data);
      } else if (response.status === 402) {
        const data = await response.json().catch(() => ({}));
        alert(data.message || '點數不足，請至「設定」頁升級方案。');
      } else {
        alert('Apps Script 產生失敗，請稍後再試');
      }
    } catch (error) {
      console.error('Generate script error:', error);
      alert('Apps Script 產生失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (result?.code) {
      navigator.clipboard.writeText(result.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Apps Script 自動化腳本產生</h2>
        <p className="text-slate-500 mt-1">不需要工程師，一句話自動寫好 Google Apps Script 程式碼。</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6 space-y-4 lg:col-span-1 border-slate-200">
          <div className="space-y-2">
            <Label className="text-base">你想要自動化什麼流程？</Label>
            <Textarea
              placeholder="例如：每天早上 8 點，讀取這個工作表的資料，並寄信給 manager@example.com..."
              className="min-h-[150px]"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {SCENARIOS.map((scenario) => (
              <Badge
                key={scenario.label}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => setPrompt(scenario.prompt)}
              >
                {scenario.label}
              </Badge>
            ))}
          </div>
          <Button
            className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
            onClick={handleGenerate}
            disabled={loading || !prompt}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode2 className="w-4 h-4" />}
            產生腳本
          </Button>
        </Card>

        <Card className="lg:col-span-2 overflow-hidden flex flex-col bg-[#1e1e1e] text-slate-300">
          <div className="p-3 border-b border-white/10 flex items-center justify-between bg-[#2d2d2d]">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-mono">Code.gs</span>
            </div>
            {result && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-slate-300 hover:text-white hover:bg-white/10"
                onClick={handleCopy}
              >
                {copied ? '已複製！' : '複製程式碼'}
              </Button>
            )}
          </div>
          <div className="flex-1 p-4 font-mono text-sm overflow-auto">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
              </div>
            ) : result ? (
              <pre className="text-[#d4d4d4] whitespace-pre-wrap">
                <code>{result.code}</code>
              </pre>
            ) : (
              <div className="text-slate-600 h-full flex items-center justify-center">
                {'// 產生的 Apps Script 程式碼將顯示於此'}
              </div>
            )}
          </div>
          {result && (
            <div className="p-4 bg-[#252526] border-t border-white/10 space-y-3">
              {result.instructions && result.instructions.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-white mb-2">🚀 使用步驟：</h4>
                  <ol className="list-decimal list-inside text-sm text-slate-400 space-y-1">
                    {result.instructions.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}
              {result.permissions && result.permissions.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-white mb-2">🔐 權限提醒：</h4>
                  <ul className="list-disc list-inside text-sm text-slate-400 space-y-1">
                    {result.permissions.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.triggers && result.triggers.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-white mb-2">⏰ 觸發器設定：</h4>
                  <ul className="list-disc list-inside text-sm text-slate-400 space-y-1">
                    {result.triggers.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

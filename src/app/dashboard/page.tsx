'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, MessageSquare, Calculator, Terminal, Database, Cpu, Settings, Zap, Brain, Sparkles, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { MODELS } from '@/lib/models';

const MODEL_ACCENT: Record<string, { icon: typeof Zap; color: string; bg: string }> = {
  'gemini-2.5-flash': { icon: Zap, color: 'text-indigo-600', bg: 'bg-indigo-100' },
  'gemini-2.5-pro': { icon: Brain, color: 'text-purple-600', bg: 'bg-purple-100' },
  'gemini-flash-latest': { icon: Sparkles, color: 'text-amber-600', bg: 'bg-amber-100' },
  'gpt-4o-mini': { icon: Zap, color: 'text-emerald-600', bg: 'bg-emerald-100' },
  'gpt-4o': { icon: Brain, color: 'text-teal-600', bg: 'bg-teal-100' },
};

export default function DashboardHome() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">早安，歡迎回來 👋</h1>
          <p className="text-slate-500 mt-1">選擇一個操作來開始你今天的自動化工作。</p>
        </div>
        <Link href="/dashboard/upload">
          <Button className="gap-2">
            <Plus className="w-4 h-4" /> 新增專案 / 資料
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href="/dashboard/analyze">
          <Card className="p-5 hover:border-indigo-300 transition-colors cursor-pointer group">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <MessageSquare className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-semibold text-slate-900 mb-1">AI 資料分析</h3>
            <p className="text-sm text-slate-500">上傳資料並讓 AI 幫你找出隱藏的洞察與趨勢。</p>
          </Card>
        </Link>
        <Link href="/dashboard/formula-generator">
          <Card className="p-5 hover:border-indigo-300 transition-colors cursor-pointer group">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Calculator className="w-5 h-5 text-purple-600" />
            </div>
            <h3 className="font-semibold text-slate-900 mb-1">產生公式</h3>
            <p className="text-sm text-slate-500">描述需求，自動產出 Excel 或 Google Sheets 公式。</p>
          </Card>
        </Link>
        <Link href="/dashboard/appsscript-generator">
          <Card className="p-5 hover:border-indigo-300 transition-colors cursor-pointer group">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Terminal className="w-5 h-5 text-emerald-600" />
            </div>
            <h3 className="font-semibold text-slate-900 mb-1">產生 Apps Script</h3>
            <p className="text-sm text-slate-500">建立自動化流程、定時寄信、資料同步腳本。</p>
          </Card>
        </Link>
      </div>

      {/* 可用 AI 模型總覽 */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="text-lg font-semibold text-slate-900">可選用的 AI 模型</h3>
              <p className="text-sm text-slate-500">
                可在<span className="font-medium text-slate-700">「設定」</span>頁切換模型並選擇付費方案。
              </p>
            </div>
          </div>
          <Link href="/settings">
            <Button variant="outline" className="gap-2">
              <Settings className="w-4 h-4" /> 前往設定 / 選擇方案
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {MODELS.map((model) => {
            const accent = MODEL_ACCENT[model.id] ?? MODEL_ACCENT['gemini-2.5-flash'];
            const Icon = accent.icon;
            return (
              <div key={model.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className={`w-9 h-9 rounded-lg ${accent.bg} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${accent.color}`} />
                  </div>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                    {model.costPerAction} 點/次
                  </span>
                </div>
                <div className="font-semibold text-slate-900">{model.label}</div>
                <div className="text-xs text-indigo-600 mb-2">{model.tagline}</div>
                <p className="text-xs text-slate-500">{model.goodFor[0]}</p>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-slate-400 mt-4">
          點數計費：Gemini 2.5 Flash 每次 30 點、Gemini 2.5 Pro 每次 50 點、Gemini Flash (Latest) 每次 20 點。
        </p>
      </Card>

      <div className="mt-8">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">最近的專案</h3>
        <Card className="p-8 text-center border-dashed border-2 bg-slate-50/50">
          <Database className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">目前還沒有專案，點擊上方按鈕開始載入資料。</p>
        </Card>
      </div>
    </div>
  );
}

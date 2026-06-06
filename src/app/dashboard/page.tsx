'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, MessageSquare, Calculator, Terminal, Database } from 'lucide-react';
import Link from 'next/link';

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

'use client';

import { use } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, MessageSquare, Calculator, BarChart2 } from 'lucide-react';
import Link from 'next/link';

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/projects">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">專案詳情</h2>
          <p className="text-slate-500 mt-1 text-sm">專案 ID: {id}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href="/dashboard/analyze">
          <Card className="p-5 hover:border-indigo-300 transition-colors cursor-pointer">
            <MessageSquare className="w-8 h-8 text-blue-600 mb-3" />
            <h3 className="font-semibold text-slate-900 mb-1">AI 資料分析</h3>
            <p className="text-sm text-slate-500">繼續分析此專案資料。</p>
          </Card>
        </Link>
        <Link href="/dashboard/formula-generator">
          <Card className="p-5 hover:border-indigo-300 transition-colors cursor-pointer">
            <Calculator className="w-8 h-8 text-purple-600 mb-3" />
            <h3 className="font-semibold text-slate-900 mb-1">產生公式</h3>
            <p className="text-sm text-slate-500">為此專案產生公式。</p>
          </Card>
        </Link>
        <Link href="/dashboard/reports">
          <Card className="p-5 hover:border-indigo-300 transition-colors cursor-pointer">
            <BarChart2 className="w-8 h-8 text-emerald-600 mb-3" />
            <h3 className="font-semibold text-slate-900 mb-1">產生報表</h3>
            <p className="text-sm text-slate-500">輸出專業 Excel 報表。</p>
          </Card>
        </Link>
      </div>
    </div>
  );
}

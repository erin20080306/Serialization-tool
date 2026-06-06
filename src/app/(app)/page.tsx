'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Sparkles, MessageSquare, Calculator, Terminal, ArrowRight, Play
} from 'lucide-react';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-6 lg:px-12 h-16 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-1.5 rounded-lg">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight text-slate-900">SheetCopilot</span>
        </div>
        <nav className="hidden md:flex gap-6 text-sm font-medium text-slate-600">
          <a href="#features" className="hover:text-indigo-600">產品功能</a>
          <a href="#pricing" className="hover:text-indigo-600">價格方案</a>
        </nav>
        <div className="flex gap-3">
          <Link href="/login">
            <Button variant="ghost">登入</Button>
          </Link>
          <Link href="/login">
            <Button>免費開始</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20 lg:py-32 bg-gradient-to-b from-indigo-50/50 to-white">
        <Badge variant="secondary" className="mb-6">🎉 支援 Excel 與 Google Sheets</Badge>
        <h1 className="text-4xl lg:text-6xl font-extrabold text-slate-900 tracking-tight max-w-4xl leading-tight mb-6">
          讓 AI 成為你的專屬<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">試算表自動化助理</span>
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mb-10 leading-relaxed">
          不用背公式、不用寫 VBA 或 Apps Script。上傳資料，讓 AI 自動為你分析數據、產生報表、撰寫複雜公式與自動化程式碼。
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Link href="/login">
            <Button size="lg" className="gap-2">
              進入主控台 <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Button size="lg" variant="outline" className="gap-2">
            <Play className="w-4 h-4" /> 觀看示範
          </Button>
        </div>

        <div id="features" className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto text-left">
          <Card className="p-6 bg-white/50 backdrop-blur border-slate-200/60">
            <MessageSquare className="w-10 h-10 text-indigo-500 mb-4" />
            <h3 className="text-lg font-bold mb-2">對話式資料分析</h3>
            <p className="text-slate-600 text-sm">用中文提問，AI 幫你找出異常值、趨勢，並給出商業洞察建議。</p>
          </Card>
          <Card className="p-6 bg-white/50 backdrop-blur border-slate-200/60">
            <Calculator className="w-10 h-10 text-purple-500 mb-4" />
            <h3 className="text-lg font-bold mb-2">自然語言轉公式</h3>
            <p className="text-slate-600 text-sm">告訴 AI 你的需求，自動產生 SUMIFS, VLOOKUP 等複雜 Excel/Sheets 公式。</p>
          </Card>
          <Card className="p-6 bg-white/50 backdrop-blur border-slate-200/60">
            <Terminal className="w-10 h-10 text-blue-500 mb-4" />
            <h3 className="text-lg font-bold mb-2">Apps Script 自動化</h3>
            <p className="text-slate-600 text-sm">一鍵產生 Google Apps Script，輕鬆實作自動寄信、資料備份等流程。</p>
          </Card>
        </div>

        <div id="pricing" className="mt-32 max-w-4xl mx-auto w-full">
          <h2 className="text-3xl font-bold text-slate-900 mb-12 text-center">價格方案</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6">
              <h3 className="text-lg font-bold mb-2">免費版</h3>
              <div className="text-3xl font-bold mb-4">$0<span className="text-sm font-normal text-slate-500">/月</span></div>
              <ul className="space-y-2 text-sm text-slate-600 mb-6">
                <li>• 每月 5 次分析</li>
                <li>• 基本公式產生</li>
                <li>• 社群支援</li>
              </ul>
              <Button variant="outline" className="w-full">開始使用</Button>
            </Card>
            <Card className="p-6 border-2 border-indigo-500 relative">
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">熱門</Badge>
              <h3 className="text-lg font-bold mb-2">專業版</h3>
              <div className="text-3xl font-bold mb-4">$29<span className="text-sm font-normal text-slate-500">/月</span></div>
              <ul className="space-y-2 text-sm text-slate-600 mb-6">
                <li>• 無限次分析</li>
                <li>• 進階公式與 Apps Script</li>
                <li>• 自動報表產生</li>
                <li>• 優先支援</li>
              </ul>
              <Button className="w-full">開始使用</Button>
            </Card>
            <Card className="p-6">
              <h3 className="text-lg font-bold mb-2">企業版</h3>
              <div className="text-3xl font-bold mb-4">$99<span className="text-sm font-normal text-slate-500">/月</span></div>
              <ul className="space-y-2 text-sm text-slate-600 mb-6">
                <li>• 團隊協作</li>
                <li>• API 存取</li>
                <li>• 專屬顧問</li>
                <li>• SLA 保證</li>
              </ul>
              <Button variant="outline" className="w-full">聯絡我們</Button>
            </Card>
          </div>
        </div>
      </main>

      <footer className="px-6 py-8 border-t border-slate-100 text-center text-sm text-slate-500">
        <p>© 2024 SheetCopilot. All rights reserved.</p>
      </footer>
    </div>
  );
}

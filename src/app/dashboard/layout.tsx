'use client';

import { 
  Home, Database, MessageSquare, Calculator, Terminal, BarChart2, Settings, LogOut, Sparkles, Menu, User
} from 'lucide-react';
import Link from 'next/link';
import { doSignOut } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const navItems = [
  { id: 'dashboard', label: '總覽', icon: Home, href: '/dashboard' },
  { id: 'upload', label: '資料來源', icon: Database, href: '/dashboard/upload' },
  { id: 'analyze', label: 'AI 資料分析', icon: MessageSquare, href: '/dashboard/analyze' },
  { id: 'formula', label: '公式產生器', icon: Calculator, href: '/dashboard/formula-generator' },
  { id: 'script', label: '程式碼產生', icon: Terminal, href: '/dashboard/appsscript-generator' },
  { id: 'reports', label: '自動報表', icon: BarChart2, href: '/dashboard/reports' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col hidden md:flex">
        <Link href="/" className="h-16 flex items-center px-6 border-b border-slate-100 gap-2">
          <div className="bg-indigo-600 p-1.5 rounded-md">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">SheetCopilot</span>
        </Link>
        <div className="p-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-2">主選單</div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  <Icon className="w-4 h-4 text-slate-400" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="mt-auto p-4 border-t border-slate-100">
          <Link
            href="/settings"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <Settings className="w-4 h-4 text-slate-400" />
            設定
          </Link>
          <form action={doSignOut}>
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 mt-1">
              <LogOut className="w-4 h-4 text-slate-400" />
              登出
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <button className="md:hidden text-slate-500 hover:text-slate-700">
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-lg font-semibold text-slate-800">Dashboard</h2>
          </div>
          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button variant="ghost" className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      <User className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-slate-600 hidden sm:inline">User</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>我的帳戶</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Link href="/settings" className="w-full">設定</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <form action={doSignOut}>
                    <button type="submit" className="w-full text-left">登出</button>
                  </form>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6 lg:p-8">
          <div className="max-w-6xl mx-auto h-full">{children}</div>
        </main>
      </div>
    </div>
  );
}

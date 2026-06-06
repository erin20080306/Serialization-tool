import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, User, Bell, Shield } from 'lucide-react';
import Link from 'next/link';
import { doSignOut } from '@/lib/actions';

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">設定</h2>
            <p className="text-slate-500 mt-1">管理您的帳戶與偏好設定。</p>
          </div>
        </div>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <User className="w-5 h-5 text-indigo-500" />
            <h3 className="font-semibold text-lg">個人資料</h3>
          </div>
          <div className="space-y-2">
            <Label>名稱</Label>
            <Input placeholder="您的名稱" defaultValue="" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" placeholder="you@example.com" disabled />
          </div>
          <Button>儲存變更</Button>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="w-5 h-5 text-indigo-500" />
            <h3 className="font-semibold text-lg">通知設定</h3>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded" defaultChecked />
            <span className="text-sm text-slate-700">報表產生完成時通知我</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded" />
            <span className="text-sm text-slate-700">接收產品更新與電子報</span>
          </label>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-indigo-500" />
            <h3 className="font-semibold text-lg">帳戶安全</h3>
          </div>
          <p className="text-sm text-slate-500">您透過 Google 帳戶登入，安全性由 Google 管理。</p>
          <form action={doSignOut}>
            <Button type="submit" variant="outline">登出帳戶</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

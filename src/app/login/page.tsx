import { doGoogleSignIn, doDevSignIn } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/50 to-white flex items-center justify-center px-6">
      <Card className="w-full max-w-md p-8">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="bg-indigo-600 p-1.5 rounded-lg">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight text-slate-900">SheetCopilot</span>
        </div>
        
        <h1 className="text-2xl font-bold text-center mb-2">登入您的帳戶</h1>
        <p className="text-slate-500 text-center mb-8">開始使用 AI 試算表自動化助理</p>
        
        <form action={doGoogleSignIn}>
          <Button type="submit" className="w-full gap-2" size="lg">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            使用 Google 登入
          </Button>
        </form>
        
        {process.env.NODE_ENV !== 'production' && (
          <>
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400">開發測試</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
            <form action={doDevSignIn}>
              <Button type="submit" variant="outline" className="w-full" size="lg">
                開發者測試登入（免 Google）
              </Button>
            </form>
          </>
        )}

        <p className="text-xs text-slate-400 text-center mt-6">
          登入即表示您同意我們的服務條款與隱私政策
        </p>
      </Card>
    </div>
  );
}

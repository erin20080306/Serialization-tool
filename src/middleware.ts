import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

// 使用 edge 安全的設定（不含 Supabase），避免 middleware 變慢
export default NextAuth(authConfig).auth;

export const config = {
  // 只對 /dashboard 路由執行驗證，其他頁面不付出 auth 成本
  matcher: ['/dashboard/:path*'],
};

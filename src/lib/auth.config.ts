import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';

// 僅在開發環境啟用的「測試登入」provider（免 Google 設定）
const devProviders =
  process.env.NODE_ENV !== 'production'
    ? [
        Credentials({
          id: 'dev-login',
          name: 'Developer Login',
          credentials: {},
          async authorize() {
            // 回傳固定的測試使用者
            return {
              id: 'dev-user-001',
              name: 'Dev Tester',
              email: 'dev@example.com',
            };
          },
        }),
      ]
    : [];

// Edge 安全的 NextAuth 設定（不可 import Supabase 等 Node-only 套件）
// 供 middleware 使用，避免 edge runtime 載入過重導致請求變慢
export const authConfig: NextAuthConfig = {
  debug: process.env.NODE_ENV !== 'production',
  secret:
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    'dev-secret-please-change-in-production',
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    ...devProviders,
  ],
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    // 路由保護：未登入者不可進入 /dashboard
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith('/dashboard');

      if (isOnDashboard) {
        return isLoggedIn; // 未登入會自動導向 signIn 頁
      }
      return true;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
      }
      return session;
    },
  },
};

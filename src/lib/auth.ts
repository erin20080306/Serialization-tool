import NextAuth from 'next-auth';
import { isSupabaseConfigured, supabase } from './supabase';
import { authConfig } from './auth.config';

// 完整版設定（Node runtime），含 Supabase 的 signIn callback
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      // 開發測試登入：直接放行
      if (account?.provider === 'dev-login') {
        return true;
      }

      if (account?.provider !== 'google' || !profile?.email) {
        return false;
      }

      // 若 Supabase 未設定（使用佔位值），跳過資料庫寫入，仍允許登入測試
      if (!isSupabaseConfigured) {
        return true;
      }

      try {
        // Check if user exists in Supabase
        const { data: existingUser } = await supabase
          .from('users')
          .select('*')
          .eq('email', profile.email)
          .single();

        if (!existingUser) {
          // Create new user
          const { data: newUser } = await supabase
            .from('users')
            .insert({
              email: profile.email,
              name: profile.name,
              google_id: profile.sub,
            })
            .select()
            .single();

          if (newUser) {
            user.id = newUser.id;
          }
        } else {
          user.id = existingUser.id;
        }
        return true;
      } catch (error) {
        // 資料庫錯誤時仍允許登入（避免阻擋測試），僅記錄錯誤
        console.error('Error syncing user to Supabase (login still allowed):', error);
        return true;
      }
    },
  },
});

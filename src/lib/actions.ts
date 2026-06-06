'use server';

import { redirect } from 'next/navigation';
import { signIn, signOut } from './auth';
import { hasGoogleOAuthConfig } from './auth.config';

// 伺服器端動作：Google 登入
export async function doGoogleSignIn() {
  if (!hasGoogleOAuthConfig) {
    redirect('/login?error=missing-google-oauth-env');
  }

  await signIn('google', { redirectTo: '/dashboard' });
}

// 伺服器端動作：登出
export async function doSignOut() {
  await signOut({ redirectTo: '/' });
}

// 伺服器端動作：開發者測試登入（免 Google）
export async function doDevSignIn() {
  await signIn('dev-login', { redirectTo: '/dashboard' });
}

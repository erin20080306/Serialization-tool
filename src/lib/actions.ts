'use server';

import { signIn, signOut } from './auth';

// 伺服器端動作：Google 登入
export async function doGoogleSignIn() {
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

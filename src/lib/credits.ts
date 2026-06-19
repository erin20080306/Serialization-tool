import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from './auth';
import { getModelConfig, type ModelId } from './models';
import { supabaseAdmin, isSupabaseAdminConfigured } from './supabase';

// 不需付費、視為無限額度的管理者帳號
export const ADMIN_EMAILS = ['erin20080306@gmail.com'];

// 預設每次 AI 動作消耗點數（未指定模型時的後備值；實際依各模型 costPerAction 計）
export const COST_PER_ACTION = 25;

// 登入即贈送的免費點數（200 點：約 8 次 Flash 分析，或 2 次 GPT-5.5 簡報）
export const FREE_CREDITS = 200;

const COOKIE_NAME = 'sc_credits';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 一年

export interface CreditState {
  email: string | null;
  unlimited: boolean;
  balance: number; // unlimited 時為 Infinity
  freeCredits: number;
  costPerAction: number;
}

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

// 是否以資料庫（綁定帳號）作為點數來源：需登入且 Supabase service role 已設定。
// 這能防止使用者清除 cookie 重置免費點數。
function useDbCredits(email: string | null): email is string {
  return Boolean(email && isSupabaseAdminConfigured);
}

// 讀取 cookie 餘額（未登入或 DB 未設定時的後備）
async function getCookieBalance(): Promise<number> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  const parsed = raw != null ? Number(raw) : FREE_CREDITS;
  return Number.isFinite(parsed) ? Math.max(0, parsed) : FREE_CREDITS;
}

// 讀取資料庫餘額；若無該帳號則建立並給予免費點數。
async function getDbBalance(email: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('user_credits')
    .select('balance')
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    const { error: insErr } = await supabaseAdmin
      .from('user_credits')
      .insert({ email, balance: FREE_CREDITS });
    // 23505 = 併發下的唯一鍵衝突，視為已存在，忽略
    if (insErr && insErr.code !== '23505') throw insErr;
    return FREE_CREDITS;
  }
  return Math.max(0, data.balance ?? 0);
}

export async function getCreditState(): Promise<CreditState> {
  const session = await auth();
  const email = session?.user?.email ?? null;

  if (isAdmin(email)) {
    return {
      email,
      unlimited: true,
      balance: Infinity,
      freeCredits: FREE_CREDITS,
      costPerAction: COST_PER_ACTION,
    };
  }

  // 已登入且 DB 已設定 → 以帳號餘額為準
  if (useDbCredits(email)) {
    try {
      const balance = await getDbBalance(email);
      return { email, unlimited: false, balance, freeCredits: FREE_CREDITS, costPerAction: COST_PER_ACTION };
    } catch (e) {
      console.error('讀取點數（DB）失敗，暫時回退 cookie：', e);
    }
  }

  // 後備：cookie
  const balance = await getCookieBalance();
  return {
    email,
    unlimited: false,
    balance,
    freeCredits: FREE_CREDITS,
    costPerAction: COST_PER_ACTION,
  };
}

export interface DeductResult {
  ok: boolean;
  balance: number;
  unlimited: boolean;
  needed: number;
}

// cookie 扣點（後備路徑）
async function deductCookie(cost: number): Promise<DeductResult> {
  const balance = await getCookieBalance();
  if (balance < cost) {
    return { ok: false, balance, unlimited: false, needed: cost };
  }
  const next = balance - cost;
  const store = await cookies();
  store.set(COOKIE_NAME, String(next), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
  return { ok: true, balance: next, unlimited: false, needed: cost };
}

// 嘗試扣點；點數不足時 ok=false 且不扣除
export async function deductCredits(cost = COST_PER_ACTION): Promise<DeductResult> {
  const session = await auth();
  const email = session?.user?.email ?? null;

  if (isAdmin(email)) {
    return { ok: true, balance: Infinity, unlimited: true, needed: cost };
  }

  // 已登入且 DB 已設定 → 以資料庫原子扣點（清 cookie 無效）
  if (useDbCredits(email)) {
    try {
      const { data, error } = await supabaseAdmin.rpc('deduct_credits', {
        p_email: email,
        p_cost: cost,
        p_free: FREE_CREDITS,
      });
      if (error) throw error;

      const newBalance = Number(data);
      if (!Number.isFinite(newBalance) || newBalance < 0) {
        // 點數不足：回傳目前餘額供顯示
        const balance = await getDbBalance(email).catch(() => 0);
        return { ok: false, balance, unlimited: false, needed: cost };
      }
      return { ok: true, balance: newBalance, unlimited: false, needed: cost };
    } catch (e) {
      console.error('扣點（DB）失敗，暫時回退 cookie：', e);
    }
  }

  // 後備：cookie
  return deductCookie(cost);
}

// 在 API route 開頭呼叫：若點數不足回傳 402 NextResponse，否則回傳 null（並已扣點）
export async function requireCredits(
  cost = COST_PER_ACTION
): Promise<{ response: NextResponse | null; balance: number; unlimited: boolean }> {
  const result = await deductCredits(cost);

  if (!result.ok) {
    return {
      response: NextResponse.json(
        {
          error: 'INSUFFICIENT_CREDITS',
          message: `點數不足：本次需要 ${cost} 點，你目前剩餘 ${result.balance} 點。請至「設定」頁升級方案或等待方案續期。`,
          balance: result.balance,
          needed: cost,
        },
        { status: 402 }
      ),
      balance: result.balance,
      unlimited: false,
    };
  }

  return { response: null, balance: result.balance, unlimited: result.unlimited };
}

// 方案定義
export interface PricingPlan {
  id: string;
  name: string;
  model: ModelId;
  priceLabel: string;
  price: number; // NT$，0 表免費
  credits: number; // 點數
  uses: number; // 約可使用次數
  highlight?: boolean;
  paymentUrl?: string; // 之後補上付費連結
}

// 以該方案主力模型的每次點數，估算「約可使用次數」
const usesForModel = (credits: number, model: ModelId) =>
  Math.floor(credits / getModelConfig(model).costPerAction);

// 成本友善定價：最便宜的點數包約 NT$0.03/點為地板，
// 確保即使把點數全花在最貴的模型（Pro 150 點、GPT-4o 120 點、GPT-5.5 簡報 100 點）仍有正毛利。
export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: '免費方案',
    model: 'gemini-2.5-flash',
    priceLabel: '登入即贈',
    price: 0,
    credits: FREE_CREDITS,
    uses: usesForModel(FREE_CREDITS, 'gemini-2.5-flash'),
    highlight: true,
  },
  // Gemini 2.5 Flash 方案（每次 25 點，成本極低）
  {
    id: 'flash-entry',
    name: 'Flash 入門包',
    model: 'gemini-2.5-flash',
    priceLabel: 'NT$100 / 月',
    price: 100,
    credits: 2500, // NT$0.040/點
    uses: usesForModel(2500, 'gemini-2.5-flash'),
  },
  {
    id: 'flash-standard',
    name: 'Flash 標準包',
    model: 'gemini-2.5-flash',
    priceLabel: 'NT$300 / 月',
    price: 300,
    credits: 9000, // NT$0.033/點
    uses: usesForModel(9000, 'gemini-2.5-flash'),
  },
  {
    id: 'flash-pro',
    name: 'Flash 進階包',
    model: 'gemini-2.5-flash',
    priceLabel: 'NT$888 / 月',
    price: 888,
    credits: 30000, // NT$0.0296/點（地板）
    uses: usesForModel(30000, 'gemini-2.5-flash'),
  },
  // Gemini 2.5 Pro 方案（每次 150 點，強制思考成本高）
  {
    id: 'pro-entry',
    name: 'Pro 入門包',
    model: 'gemini-2.5-pro',
    priceLabel: 'NT$200 / 月',
    price: 200,
    credits: 3000, // NT$0.067/點
    uses: usesForModel(3000, 'gemini-2.5-pro'),
  },
  {
    id: 'pro-standard',
    name: 'Pro 標準包',
    model: 'gemini-2.5-pro',
    priceLabel: 'NT$800 / 月',
    price: 800,
    credits: 16000, // NT$0.050/點
    uses: usesForModel(16000, 'gemini-2.5-pro'),
  },
  {
    id: 'pro-max',
    name: 'Pro 進階包',
    model: 'gemini-2.5-pro',
    priceLabel: 'NT$2,400 / 月',
    price: 2400,
    credits: 60000, // NT$0.040/點
    uses: usesForModel(60000, 'gemini-2.5-pro'),
  },
];

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from './auth';
import type { ModelId } from './models';

// 不需付費、視為無限額度的管理者帳號
export const ADMIN_EMAILS = ['erin20080306@gmail.com'];

// 每次 AI 動作（分析 / 產生公式 / 產生 Apps Script / 問答）消耗點數
export const COST_PER_ACTION = 20;

// 登入即贈送的免費點數（200 點 ≈ 10 次）
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

  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  const parsed = raw != null ? Number(raw) : FREE_CREDITS;
  const balance = Number.isFinite(parsed) ? Math.max(0, parsed) : FREE_CREDITS;

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

// 嘗試扣點；點數不足時 ok=false 且不扣除
export async function deductCredits(cost = COST_PER_ACTION): Promise<DeductResult> {
  const state = await getCreditState();

  if (state.unlimited) {
    return { ok: true, balance: Infinity, unlimited: true, needed: cost };
  }

  if (state.balance < cost) {
    return { ok: false, balance: state.balance, unlimited: false, needed: cost };
  }

  const next = state.balance - cost;
  const store = await cookies();
  store.set(COOKIE_NAME, String(next), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });

  return { ok: true, balance: next, unlimited: false, needed: cost };
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

// 1 次 = COST_PER_ACTION 點
const usesToCredits = (uses: number) => uses * COST_PER_ACTION;

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: '免費方案',
    model: 'gemini-2.5-flash',
    priceLabel: '登入即贈',
    price: 0,
    credits: FREE_CREDITS,
    uses: Math.floor(FREE_CREDITS / COST_PER_ACTION),
    highlight: true,
  },
  // Gemini 2.5 Flash 方案
  {
    id: 'flash-2000',
    name: 'Flash 入門包',
    model: 'gemini-2.5-flash',
    priceLabel: 'NT$50 / 月',
    price: 50,
    credits: 2000,
    uses: Math.floor(2000 / COST_PER_ACTION),
  },
  {
    id: 'flash-1500',
    name: 'Flash 標準包',
    model: 'gemini-2.5-flash',
    priceLabel: 'NT$300 / 月',
    price: 300,
    credits: usesToCredits(1500),
    uses: 1500,
  },
  {
    id: 'flash-6000',
    name: 'Flash 進階包',
    model: 'gemini-2.5-flash',
    priceLabel: 'NT$888 / 月',
    price: 888,
    credits: usesToCredits(6000),
    uses: 6000,
  },
  // Gemini 2.5 Pro 方案
  {
    id: 'pro-2000',
    name: 'Pro 入門包',
    model: 'gemini-2.5-pro',
    priceLabel: 'NT$200 / 月',
    price: 200,
    credits: 2000,
    uses: Math.floor(2000 / COST_PER_ACTION),
  },
  {
    id: 'pro-1500',
    name: 'Pro 標準包',
    model: 'gemini-2.5-pro',
    priceLabel: 'NT$1,000 / 月',
    price: 1000,
    credits: usesToCredits(1500),
    uses: 1500,
  },
  {
    id: 'pro-6000',
    name: 'Pro 進階包',
    model: 'gemini-2.5-pro',
    priceLabel: 'NT$3,888 / 月',
    price: 3888,
    credits: usesToCredits(6000),
    uses: 6000,
  },
];

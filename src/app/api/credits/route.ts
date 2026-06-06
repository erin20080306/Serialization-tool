import { NextResponse } from 'next/server';
import { getCreditState, PRICING_PLANS } from '@/lib/credits';
import { MODELS, DEFAULT_MODEL } from '@/lib/models';

// GET /api/credits - 回傳目前使用者的點數狀態、方案與模型清單
export async function GET() {
  const state = await getCreditState();

  return NextResponse.json({
    email: state.email,
    unlimited: state.unlimited,
    balance: state.unlimited ? null : state.balance,
    costPerAction: state.costPerAction,
    freeCredits: state.freeCredits,
    plans: PRICING_PLANS,
    models: MODELS,
    defaultModel: DEFAULT_MODEL,
  });
}

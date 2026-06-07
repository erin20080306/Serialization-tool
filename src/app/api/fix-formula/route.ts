import { NextRequest, NextResponse } from 'next/server';
import { fixFormula } from '@/lib/openai';
import { resolveModel, getModelCost } from '@/lib/models';
import { requireCredits } from '@/lib/credits';

export async function POST(req: NextRequest) {
  try {
    const { formula, problem, columns, platform, model } = await req.json();

    if (!formula || typeof formula !== 'string' || !formula.trim()) {
      return NextResponse.json({ error: 'Formula is required' }, { status: 400 });
    }

    const resolved = resolveModel(model);
    const { response, balance, unlimited } = await requireCredits(getModelCost(resolved));
    if (response) return response;

    const result = await fixFormula(formula, problem, columns, platform, resolved);

    return NextResponse.json({ ...result, balance: unlimited ? null : balance });
  } catch (error) {
    console.error('Fix formula error:', error);
    return NextResponse.json({ error: 'Failed to fix formula' }, { status: 500 });
  }
}

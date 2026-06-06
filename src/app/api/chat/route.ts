import { NextRequest, NextResponse } from 'next/server';
import { analyzeData } from '@/lib/openai';
import { resolveModel, getModelCost } from '@/lib/models';
import { requireCredits } from '@/lib/credits';

export async function POST(req: NextRequest) {
  try {
    const { question, columns, rows, model } = await req.json();

    if (!question || !columns || !rows) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 扣點（管理者帳號無限）；依模型扣不同點數，點數不足回 402
    const resolved = resolveModel(model);
    const { response, balance, unlimited } = await requireCredits(getModelCost(resolved));
    if (response) return response;

    const answer = await analyzeData(columns, rows, question, resolved);

    return NextResponse.json({ answer, balance: unlimited ? null : balance });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json({ error: 'Failed to process chat request' }, { status: 500 });
  }
}

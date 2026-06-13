import { NextRequest, NextResponse } from 'next/server';
import { analyzeData } from '@/lib/openai';
import { resolveModel, getModelCost } from '@/lib/models';
import { requireCredits } from '@/lib/credits';
import type { DataProfile } from '@/lib/data-profile';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { question, columns, model } = body;
    const rows: any[][] | undefined = body.rows;
    const prebuiltProfile: DataProfile | undefined = body.profile;
    const sampleRows: any[][] = body.sampleRows ?? (rows ? rows.slice(0, 12) : []);

    // 大型資料集：前端傳 profile + sampleRows；小型資料集：傳 rows（向後相容）
    if (!question || !columns || (!rows && !prebuiltProfile)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 扣點（管理者帳號無限）；依模型扣不同點數，點數不足回 402
    const resolved = resolveModel(model);
    const { response, balance, unlimited } = await requireCredits(getModelCost(resolved));
    if (response) return response;

    const answer = await analyzeData(columns, sampleRows, question, resolved, prebuiltProfile);

    return NextResponse.json({ answer, balance: unlimited ? null : balance });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json({ error: 'Failed to process chat request' }, { status: 500 });
  }
}

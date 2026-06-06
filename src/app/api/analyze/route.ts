import { NextRequest, NextResponse } from 'next/server';
import { analyzeColumns, detectTableType, findAnomalies } from '@/lib/excel-parser';
import { analyzeData } from '@/lib/openai';
import { buildDataProfile } from '@/lib/data-profile';
import { resolveModel } from '@/lib/models';
import { getCreditState, deductCredits } from '@/lib/credits';

// POST /api/analyze - 對資料集進行欄位分析 + AI 洞察
export async function POST(req: NextRequest) {
  try {
    const { columns, rows, model } = await req.json();

    if (!columns || !rows) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 本地欄位統計分析（不需 AI，不扣點）
    const columnAnalysis = analyzeColumns(columns, rows);
    const tableType = detectTableType(columns, rows);
    const anomalies = findAnomalies(columns, rows);
    const profile = buildDataProfile(columns, rows);

    // 僅在有足夠點數時才呼叫 AI 洞察；點數不足時仍回傳本地統計（不阻擋頁面）
    let insights: string | undefined;
    let balance: number | null = null;
    let insufficientCredits = false;

    const state = await getCreditState();
    if (state.unlimited || state.balance >= state.costPerAction) {
      try {
        await deductCredits();
        insights = await analyzeData(columns, rows, undefined, resolveModel(model));
      } catch (e) {
        console.warn('AI insights unavailable:', e);
      }
    } else {
      insufficientCredits = true;
    }
    balance = state.unlimited ? null : state.balance;

    return NextResponse.json({
      columnAnalysis,
      tableType,
      anomalies,
      profile,
      insights,
      balance,
      insufficientCredits,
    });
  } catch (error) {
    console.error('Analyze error:', error);
    return NextResponse.json({ error: 'Failed to analyze data' }, { status: 500 });
  }
}

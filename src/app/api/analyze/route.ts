import { NextRequest, NextResponse } from 'next/server';
import { analyzeColumns, detectTableType, findAnomalies } from '@/lib/excel-parser';
import { analyzeData } from '@/lib/openai';
import { buildDataProfile, type DataProfile } from '@/lib/data-profile';
import { resolveModel, getModelCost } from '@/lib/models';
import { getCreditState, deductCredits } from '@/lib/credits';

// POST /api/analyze - 產生 AI 洞察
// 支援兩種輸入：
// 1) 大型資料集（前端已算好統計）：{ columns, profile, sampleRows, model }
//    —— 只把精簡的 profile 與少量樣本送過來，避免萬筆資料超過請求大小限制。
// 2) 小型資料集（向後相容）：{ columns, rows, model }
//    —— 後端自行計算統計。
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { columns, model } = body;
    const rows: any[][] | undefined = body.rows;
    const prebuiltProfile: DataProfile | undefined = body.profile;
    const sampleRows: any[][] = body.sampleRows ?? (rows ? rows.slice(0, 12) : []);

    if (!columns || (!rows && !prebuiltProfile)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 本地統計：若前端已算好就直接用，否則後端計算（小型資料）。
    const columnAnalysis = body.columnAnalysis ?? (rows ? analyzeColumns(columns, rows) : []);
    const tableType = body.tableType ?? (rows ? detectTableType(columns, rows) : '一般資料表');
    const anomalies = body.anomalies ?? (rows ? findAnomalies(columns, rows) : []);
    const profile = prebuiltProfile ?? buildDataProfile(columns, rows as any[][]);

    // 僅在有足夠點數時才呼叫 AI 洞察；點數不足時仍回傳本地統計（不阻擋頁面）
    let insights: string | undefined;
    let balance: number | null = null;
    let insufficientCredits = false;

    const resolved = resolveModel(model);
    const cost = getModelCost(resolved);
    const state = await getCreditState();
    if (state.unlimited || state.balance >= cost) {
      try {
        await deductCredits(cost);
        insights = await analyzeData(columns, sampleRows, undefined, resolved, profile);
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

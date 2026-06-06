import { NextRequest, NextResponse } from 'next/server';
import { analyzeColumns, detectTableType, findAnomalies } from '@/lib/excel-parser';
import { analyzeData } from '@/lib/openai';

// POST /api/analyze - 對資料集進行欄位分析 + AI 洞察
export async function POST(req: NextRequest) {
  try {
    const { columns, rows } = await req.json();

    if (!columns || !rows) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 本地欄位統計分析（不需 AI）
    const columnAnalysis = analyzeColumns(columns, rows);
    const tableType = detectTableType(columns, rows);
    const anomalies = findAnomalies(columns, rows);

    // 嘗試取得 AI 洞察；若無 OpenAI key 則優雅降級
    let insights: string | undefined;
    try {
      insights = await analyzeData(columns, rows);
    } catch (e) {
      console.warn('AI insights unavailable:', e);
    }

    return NextResponse.json({
      columnAnalysis,
      tableType,
      anomalies,
      insights,
    });
  } catch (error) {
    console.error('Analyze error:', error);
    return NextResponse.json({ error: 'Failed to analyze data' }, { status: 500 });
  }
}

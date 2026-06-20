import { NextRequest, NextResponse } from 'next/server';
import { generatePresentation } from '@/lib/openai';
import { buildDataProfile, type DataProfile } from '@/lib/data-profile';
import { getModelCost } from '@/lib/models';
import { requireCredits } from '@/lib/credits';

// POST /api/presentation - 使用 GPT-5.5 產生資料分析簡報（固定扣點 100）
// 前端傳入已算好的 profile + 少量樣本，避免大型資料集超過請求大小限制。
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { columns } = body;
    const rows: any[][] | undefined = body.rows;
    const prebuiltProfile: DataProfile | undefined = body.profile;
    const sampleRows: any[][] = body.sampleRows ?? (rows ? rows.slice(0, 12) : []);
    const analysisInsights: string | undefined =
      typeof body.analysisInsights === 'string' ? body.analysisInsights : undefined;

    if (!columns || (!rows && !prebuiltProfile)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 簡報固定使用最新的 GPT-5.5 模型，扣點 100；點數不足回 402。
    const model = 'gpt-5.5' as const;
    const { response, balance, unlimited } = await requireCredits(getModelCost(model));
    if (response) return response;

    const profile = prebuiltProfile ?? buildDataProfile(columns, rows as any[][]);

    try {
      const presentation = await generatePresentation(columns, sampleRows, profile, model, analysisInsights);
      return NextResponse.json({ presentation, balance: unlimited ? null : balance });
    } catch (e) {
      console.error('Presentation generation error:', e);
      return NextResponse.json(
        { error: '簡報產生失敗，請稍後再試。' },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error('Presentation error:', error);
    return NextResponse.json({ error: 'Failed to generate presentation' }, { status: 500 });
  }
}

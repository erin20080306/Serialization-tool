import { NextRequest, NextResponse } from 'next/server';
import { generateExcelReport } from '@/lib/report-generator';
import { generateReportInsights } from '@/lib/openai';

export async function POST(req: NextRequest) {
  try {
    const { columns, rows, options } = await req.json();

    if (!columns || !rows) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 嘗試取得 AI 洞察；若失敗（如無 OpenAI key）則優雅降級
    let insights: string | undefined;
    let summary: string | undefined;
    let keyFindings: string[] | undefined;

    if (options?.includeSummary) {
      try {
        const aiResult = await generateReportInsights(columns, rows);
        summary = aiResult.summary;
        keyFindings = aiResult.keyFindings;
        insights = aiResult.recommendations?.join('\n');
      } catch (e) {
        console.warn('AI insights unavailable, generating report without them:', e);
      }
    }

    const buffer = await generateExcelReport(
      { columns, rows },
      {
        includeSummary: options?.includeSummary ?? true,
        includeStatistics: options?.includeStatistics ?? true,
        includeRawData: options?.includeRawData ?? true,
        summary,
        keyFindings,
        insights,
      }
    );

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Analysis_Report.xlsx"',
      },
    });
  } catch (error) {
    console.error('Generate report error:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}

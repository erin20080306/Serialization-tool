import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { writeSheetData } from '@/lib/google';

// POST /api/google-sheets/write - 把分析結果寫回新的 worksheet
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const accessToken = (session as any)?.accessToken;

    const { spreadsheetId, sheetName, data } = await req.json();

    if (!spreadsheetId || !sheetName || !data) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: '缺少 Google 授權，請重新登入並授予 Google Sheets 權限' },
        { status: 401 }
      );
    }

    const result = await writeSheetData(spreadsheetId, sheetName, data, accessToken);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('Write sheet error:', error);
    return NextResponse.json({ error: 'Failed to write to Google Sheet' }, { status: 500 });
  }
}

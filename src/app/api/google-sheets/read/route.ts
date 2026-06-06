import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { readSheetData, getSpreadsheetMetadata } from '@/lib/google';

// POST /api/google-sheets/read - 讀取指定 worksheet 的資料
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const accessToken = (session as any)?.accessToken;

    const { spreadsheetId, sheetName } = await req.json();

    if (!spreadsheetId) {
      return NextResponse.json({ error: 'spreadsheetId is required' }, { status: 400 });
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: '缺少 Google 授權，請重新登入並授予 Google Sheets 權限' },
        { status: 401 }
      );
    }

    // 若未指定工作表，先取得 metadata 並使用第一個工作表
    let targetSheet = sheetName;
    if (!targetSheet) {
      const metadata = await getSpreadsheetMetadata(spreadsheetId, accessToken);
      targetSheet = metadata.sheets?.[0]?.title;
    }

    const data = await readSheetData(spreadsheetId, targetSheet, accessToken);
    return NextResponse.json({ ...data, sheetName: targetSheet });
  } catch (error) {
    console.error('Read sheet error:', error);
    return NextResponse.json({ error: 'Failed to read Google Sheet' }, { status: 500 });
  }
}

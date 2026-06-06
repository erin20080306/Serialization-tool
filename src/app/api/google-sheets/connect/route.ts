import { NextRequest, NextResponse } from 'next/server';
import { extractSpreadsheetId } from '@/lib/google';
import { analyzeColumns, detectTableType } from '@/lib/excel-parser';

export async function POST(req: NextRequest) {
  try {
    const { sheetUrl } = await req.json();

    if (!sheetUrl) {
      return NextResponse.json({ error: 'Sheet URL is required' }, { status: 400 });
    }

    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    if (!spreadsheetId) {
      return NextResponse.json({ error: 'Invalid Google Sheet URL' }, { status: 400 });
    }

    // For MVP, we'll use mock data since we need OAuth tokens
    // In production, this would use the Google Sheets API with user's access token
    const mockData = {
      columns: ['ID', '交易日期', '地區', '產品名稱', '類別', '銷售數量', '營業額(NTD)'],
      rows: [
        [1, '2023-10-01', '北區', 'MacBook Pro 14"', '3C電子', 5, 320000],
        [2, '2023-10-02', '南區', 'iPhone 15 Pro', '3C電子', 12, 480000],
        [3, '2023-10-02', '北區', '人體工學椅', '辦公家具', 20, 160000],
        [4, '2023-10-03', '東區', 'AirPods Pro 2', '3C電子', 30, 225000],
        [5, '2023-10-04', '中區', '電動升降桌', '辦公家具', 8, 144000],
        [6, '2023-10-05', '北區', 'iPad Air', '3C電子', 15, 270000],
        [7, '2023-10-06', '南區', '會議桌', '辦公家具', 2, 45000],
      ],
      sheetName: 'Sheet1',
      fileName: `Google Sheet (${spreadsheetId})`,
    };

    const columnAnalysis = analyzeColumns(mockData.columns, mockData.rows);
    const tableType = detectTableType(mockData.columns, mockData.rows);

    return NextResponse.json({
      ...mockData,
      spreadsheetId,
      columnAnalysis,
      tableType,
    });
  } catch (error) {
    console.error('Google Sheets connect error:', error);
    return NextResponse.json({ error: 'Failed to connect to Google Sheets' }, { status: 500 });
  }
}

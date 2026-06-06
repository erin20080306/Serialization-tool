import { NextRequest, NextResponse } from 'next/server';
import { parseExcelFile, analyzeColumns, detectTableType } from '@/lib/excel-parser';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Parse the Excel/CSV file
    const { data, fileName } = await parseExcelFile(file);

    if (data.length === 0) {
      return NextResponse.json({ error: 'No data found in file' }, { status: 400 });
    }

    // 回傳所有分頁，讓前端可逐頁分析
    const sheets = data.map((sheet) => ({
      sheetName: sheet.sheetName,
      columns: sheet.columns,
      rows: sheet.rows,
      rowCount: sheet.rows.length,
      columnCount: sheet.columns.length,
      tableType: detectTableType(sheet.columns, sheet.rows),
    }));

    // 預設使用第一個分頁，並保留舊欄位以相容既有頁面
    const firstSheet = data[0];
    const columnAnalysis = analyzeColumns(firstSheet.columns, firstSheet.rows);
    const tableType = detectTableType(firstSheet.columns, firstSheet.rows);

    return NextResponse.json({
      columns: firstSheet.columns,
      rows: firstSheet.rows,
      sheetName: firstSheet.sheetName,
      fileName,
      columnAnalysis,
      tableType,
      sheets,
      sheetCount: sheets.length,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Failed to process file' }, { status: 500 });
  }
}

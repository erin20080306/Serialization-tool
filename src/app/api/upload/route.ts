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

    // Use the first sheet for analysis
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
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Failed to process file' }, { status: 500 });
  }
}

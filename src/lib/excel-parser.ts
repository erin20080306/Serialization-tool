import * as XLSX from 'xlsx';
import type { ParsedData } from './types';

// 純統計函式已抽至 table-stats.ts（無 xlsx 依賴，前後端共用）。
// 在此 re-export 以維持既有 import 路徑相容。
export { analyzeColumns, detectTableType, findAnomalies } from './table-stats';

// Parse Excel/CSV file
export async function parseExcelFile(
  file: File
): Promise<{ data: ParsedData[]; fileName: string }> {
  try {
    const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type.includes('csv');
    const data = isCsv ? await file.text() : await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: isCsv ? 'string' : 'array' });

    const parsedData: ParsedData[] = [];

    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
      }) as any[][];

      if (jsonData.length > 0) {
        const columns = jsonData[0].map((col) => String(col));
        const rows = jsonData.slice(1);

        parsedData.push({
          columns,
          rows,
          sheetName,
        });
      }
    });

    return {
      data: parsedData,
      fileName: file.name,
    };
  } catch (error) {
    throw new Error('Failed to parse Excel file');
  }
}

// Convert parsed data to CSV format
export function convertToCSV(data: ParsedData): string {
  const { columns, rows } = data;
  const header = columns.join(',');
  const csvRows = rows.map((row) => row.join(','));
  return [header, ...csvRows].join('\n');
}

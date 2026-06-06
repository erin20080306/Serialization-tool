import ExcelJS from 'exceljs';
import type { ParsedData } from './types';

export interface ReportOptions {
  includeSummary: boolean;
  includeStatistics: boolean;
  includeRawData: boolean;
  insights?: string;
  summary?: string;
  keyFindings?: string[];
}

// Generate Excel report with multiple sheets
export async function generateExcelReport(
  data: ParsedData,
  options: ReportOptions
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AI Spreadsheet Copilot';
  workbook.created = new Date();

  // Summary Sheet
  if (options.includeSummary) {
    const summarySheet = workbook.addWorksheet('Summary');
    
    summarySheet.mergeCells('A1:D1');
    const titleCell = summarySheet.getCell('A1');
    titleCell.value = '資料分析報表摘要';
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { horizontal: 'center' };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '4F81BD' },
    };
    titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };

    let row = 3;
    
    if (options.summary) {
      summarySheet.getCell(`A${row}`).value = '摘要';
      summarySheet.getCell(`A${row}`).font = { bold: true };
      summarySheet.getCell(`B${row}`).value = options.summary;
      row += 2;
    }

    if (options.insights) {
      summarySheet.getCell(`A${row}`).value = 'AI 洞察';
      summarySheet.getCell(`A${row}`).font = { bold: true };
      summarySheet.getCell(`B${row}`).value = options.insights;
      summarySheet.getCell(`B${row}`).alignment = { wrapText: true };
      row += 2;
    }

    if (options.keyFindings && options.keyFindings.length > 0) {
      summarySheet.getCell(`A${row}`).value = '關鍵發現';
      summarySheet.getCell(`A${row}`).font = { bold: true };
      row++;
      options.keyFindings.forEach((finding, idx) => {
        summarySheet.getCell(`A${row}`).value = `${idx + 1}.`;
        summarySheet.getCell(`B${row}`).value = finding;
        summarySheet.getCell(`B${row}`).alignment = { wrapText: true };
        row++;
      });
    }

    // Auto-fit columns
    summarySheet.columns.forEach((column) => {
      column.width = 30;
    });
  }

  // Statistics Sheet
  if (options.includeStatistics) {
    const statsSheet = workbook.addWorksheet('統計分析');
    
    // Header
    statsSheet.mergeCells('A1:E1');
    const headerCell = statsSheet.getCell('A1');
    headerCell.value = '欄位統計分析';
    headerCell.font = { size: 14, bold: true };
    headerCell.alignment = { horizontal: 'center' };
    headerCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '4F81BD' },
    };
    headerCell.font = { size: 14, bold: true, color: { argb: 'FFFFFF' } };

    // Column headers
    const headers = ['欄位名稱', '資料類型', '非空值數量', '唯一值數量', '空值比例'];
    headers.forEach((header, idx) => {
      const cell = statsSheet.getCell(String.fromCharCode(65 + idx) + '3');
      cell.value = header;
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'DCE6F1' },
      };
    });

    // Calculate statistics for each column
    let row = 4;
    data.columns.forEach((col, colIndex) => {
      const values = data.rows.map((r) => r[colIndex]);
      const nonNullValues = values.filter((v) => v !== null && v !== undefined && v !== '');
      const uniqueValues = new Set(nonNullValues);
      const nullPercentage = ((values.length - nonNullValues.length) / values.length * 100).toFixed(1);

      // Detect type
      let type = '文字';
      const numericValues = nonNullValues.filter((v) => !isNaN(Number(v)));
      if (numericValues.length / nonNullValues.length > 0.8) {
        type = '數值';
      } else if (nonNullValues.some((v) => !isNaN(Date.parse(String(v))))) {
        type = '日期';
      }

      statsSheet.getCell(`A${row}`).value = col;
      statsSheet.getCell(`B${row}`).value = type;
      statsSheet.getCell(`C${row}`).value = nonNullValues.length;
      statsSheet.getCell(`D${row}`).value = uniqueValues.size;
      statsSheet.getCell(`E${row}`).value = `${nullPercentage}%`;
      row++;
    });

    // Auto-fit columns
    statsSheet.columns.forEach((column) => {
      column.width = 20;
    });
  }

  // Raw Data Sheet
  if (options.includeRawData) {
    const rawDataSheet = workbook.addWorksheet('原始資料');
    
    // Add headers
    data.columns.forEach((col, idx) => {
      const cell = rawDataSheet.getCell(String.fromCharCode(65 + idx) + '1');
      cell.value = col;
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'DCE6F1' },
      };
    });

    // Add data rows
    data.rows.forEach((row, rowIndex) => {
      row.forEach((cell, cellIndex) => {
        rawDataSheet.getCell(String.fromCharCode(65 + cellIndex) + (rowIndex + 2)).value = cell;
      });
    });

    // Freeze first row
    rawDataSheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    // Add auto filter
    rawDataSheet.autoFilter = {
      from: 'A1',
      to: `${String.fromCharCode(64 + data.columns.length)}${data.rows.length + 1}`,
    };

    // Auto-fit columns
    rawDataSheet.columns.forEach((column) => {
      column.width = 15;
    });
  }

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// Generate CSV report
export function generateCSVReport(data: ParsedData): string {
  const headers = data.columns.join(',');
  const rows = data.rows.map((row) => row.join(','));
  return [headers, ...rows].join('\n');
}

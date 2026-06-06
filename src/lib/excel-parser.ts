import * as XLSX from 'xlsx';
import type { ParsedData, ColumnAnalysis } from './types';

// Parse Excel/CSV file
export async function parseExcelFile(
  file: File
): Promise<{ data: ParsedData[]; fileName: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });

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

        resolve({
          data: parsedData,
          fileName: file.name,
        });
      } catch (error) {
        reject(new Error('Failed to parse Excel file'));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsBinaryString(file);
  });
}

// Analyze column data types and statistics
export function analyzeColumns(
  columns: string[],
  rows: any[][]
): ColumnAnalysis[] {
  return columns.map((colName, colIndex) => {
    const values = rows.map((row) => row[colIndex]);
    const nonNullValues = values.filter((v) => v !== null && v !== undefined && v !== '');

    // Detect data type
    let type: ColumnAnalysis['type'] = 'string';
    const numericValues = nonNullValues.filter((v) => !isNaN(Number(v)));
    const dateValues = nonNullValues.filter((v) => !isNaN(Date.parse(String(v))));

    if (numericValues.length / nonNullValues.length > 0.8) {
      type = 'number';
      // Check if it's currency
      if (colName.toLowerCase().includes('金額') || 
          colName.toLowerCase().includes('價格') || 
          colName.toLowerCase().includes('price') ||
          colName.toLowerCase().includes('amount')) {
        type = 'currency';
      }
    } else if (dateValues.length / nonNullValues.length > 0.8) {
      type = 'date';
    } else if (nonNullValues.length > 0 && nonNullValues.length / nonNullValues.length < 0.5) {
      type = 'category';
    }

    // Calculate null percentage
    const nullPercentage = ((values.length - nonNullValues.length) / values.length) * 100;

    // Count unique values
    const uniqueValues = new Set(nonNullValues);
    const uniqueCount = uniqueValues.size;

    // Get sample values (first 5 unique)
    const sampleValues = Array.from(uniqueValues).slice(0, 5);

    return {
      name: colName,
      type,
      null_percentage: nullPercentage,
      unique_count: uniqueCount,
      sample_values: sampleValues,
    };
  });
}

// Detect table type based on columns and data
export function detectTableType(
  columns: string[],
  rows: any[][]
): string {
  const columnNames = columns.map((c) => c.toLowerCase()).join(' ');

  if (columnNames.includes('銷售') || columnNames.includes('營業額') || columnNames.includes('sales')) {
    return '銷售表';
  }
  if (columnNames.includes('庫存') || columnNames.includes('inventory') || columnNames.includes('stock')) {
    return '庫存表';
  }
  if (columnNames.includes('訂單') || columnNames.includes('order') || columnNames.includes('訂單編號')) {
    return '訂單表';
  }
  if (columnNames.includes('客戶') || columnNames.includes('customer') || columnNames.includes('顧客')) {
    return '客戶表';
  }
  if (columnNames.includes('費用') || columnNames.includes('expense') || columnNames.includes('支出')) {
    return '費用表';
  }
  if (columnNames.includes('產品') || columnNames.includes('product') || columnNames.includes('商品')) {
    return '產品表';
  }

  return '一般資料表';
}

// Find anomalies in numeric data
export function findAnomalies(
  columns: string[],
  rows: any[][]
): Array<{ row: number; column: string; value: any; reason: string }> {
  const anomalies: Array<{ row: number; column: string; value: any; reason: string }> = [];

  columns.forEach((col, colIndex) => {
    const values = rows.map((row) => row[colIndex]).filter((v) => !isNaN(Number(v)));
    
    if (values.length > 0) {
      const numericValues = values.map(Number);
      const mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
      const stdDev = Math.sqrt(
        numericValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / numericValues.length
      );

      rows.forEach((row, rowIndex) => {
        const value = row[colIndex];
        if (!isNaN(Number(value))) {
          const numValue = Number(value);
          const zScore = Math.abs((numValue - mean) / stdDev);

          if (zScore > 2) {
            anomalies.push({
              row: rowIndex + 2, // +2 because of header and 0-index
              column: col,
              value,
              reason: `數值偏離平均值超過 2 個標準差 (Z-score: ${zScore.toFixed(2)})`,
            });
          }
        }
      });
    }
  });

  return anomalies;
}

// Convert parsed data to CSV format
export function convertToCSV(data: ParsedData): string {
  const { columns, rows } = data;
  const header = columns.join(',');
  const csvRows = rows.map((row) => row.join(','));
  return [header, ...csvRows].join('\n');
}

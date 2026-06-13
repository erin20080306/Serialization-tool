import type { ColumnAnalysis } from './types';

// 純統計函式（無 xlsx 依賴），可在前端與後端共用。
// 抽出自 excel-parser，讓前端能在瀏覽器端直接計算統計，
// 避免將整份資料（萬筆以上）透過網路傳給 API 而超過請求大小限制。

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

    if (nonNullValues.length > 0 && numericValues.length / nonNullValues.length > 0.8) {
      type = 'number';
      // Check if it's currency
      if (colName.toLowerCase().includes('金額') ||
          colName.toLowerCase().includes('價格') ||
          colName.toLowerCase().includes('price') ||
          colName.toLowerCase().includes('amount')) {
        type = 'currency';
      }
    } else if (nonNullValues.length > 0 && dateValues.length / nonNullValues.length > 0.8) {
      type = 'date';
    } else if (nonNullValues.length > 0 && nonNullValues.length / nonNullValues.length < 0.5) {
      type = 'category';
    }

    // Calculate null percentage
    const nullPercentage = values.length > 0
      ? ((values.length - nonNullValues.length) / values.length) * 100
      : 0;

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
  _rows: any[][]
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
// 綜合多種偵測：Z-score、IQR 離群值、空值比例過高、單一數值佔比過大
export function findAnomalies(
  columns: string[],
  rows: any[][]
): Array<{ row: number; column: string; value: any; reason: string }> {
  const anomalies: Array<{ row: number; column: string; value: any; reason: string }> = [];
  const isEmpty = (v: any) => v === null || v === undefined || v === '';

  columns.forEach((col, colIndex) => {
    const rawValues = rows.map((row) => row[colIndex]);
    const numericPairs = rows
      .map((row, idx) => ({ idx, num: Number(row[colIndex]), raw: row[colIndex] }))
      .filter((p) => !isEmpty(p.raw) && Number.isFinite(p.num));
    const numericValues = numericPairs.map((p) => p.num);

    // 1) 空值比例過高（資料品質風險）
    const emptyCount = rawValues.filter(isEmpty).length;
    if (rawValues.length > 0 && emptyCount / rawValues.length > 0.3) {
      anomalies.push({
        row: 0,
        column: col,
        value: `${emptyCount}/${rawValues.length}`,
        reason: `欄位「${col}」有 ${Math.round((emptyCount / rawValues.length) * 100)}% 為空值，可能影響統計準確度。`,
      });
    }

    if (numericValues.length >= 4) {
      const mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
      const stdDev = Math.sqrt(
        numericValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / numericValues.length
      );

      // IQR 離群值
      const sorted = [...numericValues].sort((a, b) => a - b);
      const q = (p: number) => {
        const pos = (sorted.length - 1) * p;
        const base = Math.floor(pos);
        const rest = pos - base;
        return sorted[base] + (sorted[base + 1] !== undefined ? rest * (sorted[base + 1] - sorted[base]) : 0);
      };
      const q1 = q(0.25);
      const q3 = q(0.75);
      const iqr = q3 - q1;
      const lower = q1 - 1.5 * iqr;
      const upper = q3 + 1.5 * iqr;

      numericPairs.forEach((p) => {
        const zScore = stdDev > 0 ? Math.abs((p.num - mean) / stdDev) : 0;
        const isIqrOutlier = iqr > 0 && (p.num < lower || p.num > upper);

        if (zScore > 2 || isIqrOutlier) {
          anomalies.push({
            row: p.idx + 2, // +2: 標題列與 0-based
            column: col,
            value: p.raw,
            reason:
              zScore > 2
                ? `偏離平均 ${mean.toFixed(0)} 超過 2 個標準差 (Z=${zScore.toFixed(2)})，屬於極端值。`
                : `落在 IQR 正常範圍 [${lower.toFixed(0)}, ${upper.toFixed(0)}] 之外，疑似離群值。`,
          });
        }
      });
    } else if (numericValues.length >= 2) {
      // 小樣本：用最大/最小相對差距判斷
      const max = Math.max(...numericValues);
      const min = Math.min(...numericValues);
      const mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
      if (min > 0 && max / min >= 3) {
        const top = numericPairs.find((p) => p.num === max);
        if (top) {
          anomalies.push({
            row: top.idx + 2,
            column: col,
            value: top.raw,
            reason: `此值 ${max.toLocaleString()} 約為最小值 ${min.toLocaleString()} 的 ${(max / min).toFixed(1)} 倍，明顯高於平均 ${mean.toFixed(0)}，建議查核。`,
          });
        }
      }
    }
  });

  // 去重並限制數量
  const seen = new Set<string>();
  return anomalies
    .filter((a) => {
      const key = `${a.row}-${a.column}-${a.reason}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 15);
}

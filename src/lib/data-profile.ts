export interface TopValue {
  value: string;
  count: number;
}

export interface NumericProfile {
  sum: number;
  average: number;
  min: number;
  max: number;
}

export interface DateProfile {
  min: string;
  max: string;
}

export interface ColumnProfile {
  name: string;
  type: 'number' | 'date' | 'category' | 'text';
  nonEmptyCount: number;
  emptyCount: number;
  uniqueCount: number;
  sampleValues: string[];
  numeric?: NumericProfile;
  date?: DateProfile;
  topValues?: TopValue[];
}

export interface CategoryMetricProfile {
  categoryColumn: string;
  metricColumn: string;
  topRows: Array<{
    value: string;
    total: number;
    count: number;
  }>;
}

export interface DataProfile {
  rowCount: number;
  columnCount: number;
  columns: ColumnProfile[];
  categoryMetrics: CategoryMetricProfile[];
}

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === '';
}

function formatValue(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildDataProfile(columns: string[], rows: unknown[][]): DataProfile {
  const profiles: ColumnProfile[] = columns.map((name, columnIndex) => {
    const values = rows.map((row) => row[columnIndex]);
    const nonEmptyValues = values.filter((value) => !isEmpty(value));
    const emptyCount = values.length - nonEmptyValues.length;
    const uniqueValues = new Set(nonEmptyValues.map(formatValue));
    const sampleValues = Array.from(uniqueValues).slice(0, 5);

    const numericValues = nonEmptyValues
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    const dateValues = nonEmptyValues
      .map((value) => new Date(String(value)))
      .filter((value) => Number.isFinite(value.getTime()));

    const numericRatio = nonEmptyValues.length > 0 ? numericValues.length / nonEmptyValues.length : 0;
    const dateRatio = nonEmptyValues.length > 0 ? dateValues.length / nonEmptyValues.length : 0;

    let type: ColumnProfile['type'] = 'text';
    if (numericRatio >= 0.8) {
      type = 'number';
    } else if (dateRatio >= 0.8) {
      type = 'date';
    } else if (uniqueValues.size <= Math.max(20, Math.ceil(nonEmptyValues.length * 0.5))) {
      type = 'category';
    }

    const profile: ColumnProfile = {
      name,
      type,
      nonEmptyCount: nonEmptyValues.length,
      emptyCount,
      uniqueCount: uniqueValues.size,
      sampleValues,
    };

    if (type === 'number' && numericValues.length > 0) {
      const sum = numericValues.reduce((total, value) => total + value, 0);
      profile.numeric = {
        sum: round(sum),
        average: round(sum / numericValues.length),
        min: round(Math.min(...numericValues)),
        max: round(Math.max(...numericValues)),
      };
    }

    if (type === 'date' && dateValues.length > 0) {
      profile.date = {
        min: new Date(Math.min(...dateValues.map((value) => value.getTime()))).toISOString().slice(0, 10),
        max: new Date(Math.max(...dateValues.map((value) => value.getTime()))).toISOString().slice(0, 10),
      };
    }

    if (type === 'category' || type === 'text') {
      const counts = new Map<string, number>();
      nonEmptyValues.forEach((value) => {
        const key = formatValue(value);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
      profile.topValues = Array.from(counts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    }

    return profile;
  });

  const numericColumns = profiles.filter((column) => column.numeric);
  const categoryColumns = profiles.filter((column) => column.type === 'category' && column.uniqueCount > 1);
  const categoryMetrics: CategoryMetricProfile[] = [];

  categoryColumns.slice(0, 3).forEach((categoryColumn) => {
    const categoryIndex = columns.indexOf(categoryColumn.name);
    numericColumns.slice(0, 3).forEach((metricColumn) => {
      const metricIndex = columns.indexOf(metricColumn.name);
      const buckets = new Map<string, { total: number; count: number }>();

      rows.forEach((row) => {
        const category = row[categoryIndex];
        const metric = Number(row[metricIndex]);
        if (isEmpty(category) || !Number.isFinite(metric)) return;

        const key = formatValue(category);
        const bucket = buckets.get(key) ?? { total: 0, count: 0 };
        bucket.total += metric;
        bucket.count += 1;
        buckets.set(key, bucket);
      });

      const topRows = Array.from(buckets.entries())
        .map(([value, bucket]) => ({
          value,
          total: round(bucket.total),
          count: bucket.count,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

      if (topRows.length > 0) {
        categoryMetrics.push({
          categoryColumn: categoryColumn.name,
          metricColumn: metricColumn.name,
          topRows,
        });
      }
    });
  });

  return {
    rowCount: rows.length,
    columnCount: columns.length,
    columns: profiles,
    categoryMetrics,
  };
}

export function formatDataProfileForPrompt(profile: DataProfile) {
  const numericSummary = profile.columns
    .filter((column) => column.numeric)
    .map(
      (column) =>
        `- ${column.name}: total=${column.numeric?.sum}, avg=${column.numeric?.average}, min=${column.numeric?.min}, max=${column.numeric?.max}`
    )
    .join('\n');

  const categorySummary = profile.columns
    .filter((column) => column.topValues && column.topValues.length > 0)
    .slice(0, 8)
    .map(
      (column) =>
        `- ${column.name}: ${column.topValues?.map((item) => `${item.value}(${item.count})`).join(', ')}`
    )
    .join('\n');

  const dateSummary = profile.columns
    .filter((column) => column.date)
    .map((column) => `- ${column.name}: ${column.date?.min} to ${column.date?.max}`)
    .join('\n');

  const rankingSummary = profile.categoryMetrics
    .slice(0, 6)
    .map(
      (metric) =>
        `- ${metric.categoryColumn} by ${metric.metricColumn}: ${metric.topRows
          .map((row) => `${row.value}=${row.total}`)
          .join(', ')}`
    )
    .join('\n');

  return `資料概況:
- rows=${profile.rowCount}
- columns=${profile.columnCount}

數值欄位:
${numericSummary || '- none'}

分類欄位:
${categorySummary || '- none'}

日期欄位:
${dateSummary || '- none'}

分組排行:
${rankingSummary || '- none'}`;
}

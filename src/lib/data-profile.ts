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

export type SemanticRole =
  | 'customer'
  | 'product'
  | 'revenue'
  | 'quantity'
  | 'region'
  | 'date'
  | 'category'
  | 'metric';

export interface ColumnProfile {
  name: string;
  type: 'number' | 'date' | 'category' | 'text';
  semantic?: SemanticRole;
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
  categorySemantic?: SemanticRole;
  metricSemantic?: SemanticRole;
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
  businessColumns: Array<{ name: string; semantic: SemanticRole }>;
}

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === '';
}

const SEMANTIC_KEYWORDS: Array<{ role: SemanticRole; keywords: string[] }> = [
  {
    role: 'revenue',
    keywords: [
      '營業額', '營收', '銷售額', '銷售金額', '銷貨', '金額', '收入', '營業收入', '小計', '總計', '總額',
      'revenue', 'sales', 'amount', 'turnover', 'income', 'total',
    ],
  },
  {
    role: 'quantity',
    keywords: ['數量', '件數', '銷量', '銷售量', '出貨量', '庫存', 'qty', 'quantity', 'count', 'units', 'volume'],
  },
  {
    role: 'customer',
    keywords: ['客戶', '客户', '顧客', '會員', '買家', '帳號', '客戶名稱', 'customer', 'client', 'account', 'buyer', 'member'],
  },
  {
    role: 'product',
    keywords: ['商品', '產品', '品名', '品項', '貨號', '料號', '型號', 'product', 'item', 'sku', 'goods', 'model'],
  },
  {
    role: 'region',
    keywords: ['地區', '區域', '城市', '縣市', '門市', '分店', '店別', '店', '據點', 'region', 'area', 'city', 'store', 'branch', 'location'],
  },
  {
    role: 'date',
    keywords: ['日期', '時間', '月份', '年份', '訂單日期', 'date', 'time', 'month', 'year', 'day', 'period'],
  },
];

function detectSemanticRole(columnName: string, type: ColumnProfile['type']): SemanticRole | undefined {
  const normalized = columnName.toLowerCase().trim();
  const numericRoles: SemanticRole[] = ['revenue', 'quantity'];

  for (const { role, keywords } of SEMANTIC_KEYWORDS) {
    const matched = keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
    if (!matched) continue;
    // 數值型語意（營業額/數量）需要實際是數值欄位才採用
    if (numericRoles.includes(role) && type !== 'number') continue;
    return role;
  }

  return undefined;
}

// 分類欄位語意優先序（客戶/商品/地區優先成為分組維度）
const CATEGORY_PRIORITY: Record<string, number> = {
  customer: 0,
  product: 1,
  region: 2,
  category: 3,
};

// 數值欄位語意優先序（營業額優先成為衡量指標）
const METRIC_PRIORITY: Record<string, number> = {
  revenue: 0,
  quantity: 1,
  metric: 2,
};

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
      semantic: detectSemanticRole(name, type),
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

  // 依商業語意排序：客戶/商品/地區優先成為分組維度，營業額優先成為衡量指標
  const numericColumns = profiles
    .filter((column) => column.numeric)
    .sort(
      (a, b) =>
        (METRIC_PRIORITY[a.semantic ?? ''] ?? 99) - (METRIC_PRIORITY[b.semantic ?? ''] ?? 99)
    );
  const categoryColumns = profiles
    .filter((column) => column.type === 'category' && column.uniqueCount > 1)
    .sort(
      (a, b) =>
        (CATEGORY_PRIORITY[a.semantic ?? ''] ?? 99) - (CATEGORY_PRIORITY[b.semantic ?? ''] ?? 99)
    );
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
          categorySemantic: categoryColumn.semantic,
          metricSemantic: metricColumn.semantic,
          topRows,
        });
      }
    });
  });

  // 將含商業語意的分組（如 客戶 x 營業額）排到最前面
  categoryMetrics.sort((a, b) => {
    const score = (m: CategoryMetricProfile) =>
      (CATEGORY_PRIORITY[m.categorySemantic ?? ''] ?? 99) +
      (METRIC_PRIORITY[m.metricSemantic ?? ''] ?? 99);
    return score(a) - score(b);
  });

  const businessColumns = profiles
    .filter((column) => column.semantic)
    .map((column) => ({ name: column.name, semantic: column.semantic as SemanticRole }));

  return {
    rowCount: rows.length,
    columnCount: columns.length,
    columns: profiles,
    categoryMetrics,
    businessColumns,
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

  const semanticLabel: Record<SemanticRole, string> = {
    customer: '客戶維度',
    product: '商品維度',
    region: '地區維度',
    revenue: '營業額/金額指標',
    quantity: '數量指標',
    date: '日期維度',
    category: '分類維度',
    metric: '數值指標',
  };

  const businessSummary = profile.businessColumns
    ? profile.businessColumns
        .map((column) => `- ${column.name} → ${semanticLabel[column.semantic]}`)
        .join('\n')
    : '';

  return `資料概況:
- rows=${profile.rowCount}
- columns=${profile.columnCount}

商業欄位辨識(請優先使用這些欄位回答商業問題):
${businessSummary || '- none'}

數值欄位:
${numericSummary || '- none'}

分類欄位:
${categorySummary || '- none'}

日期欄位:
${dateSummary || '- none'}

分組排行:
${rankingSummary || '- none'}`;
}

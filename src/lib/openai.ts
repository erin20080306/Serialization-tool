import {
  GoogleGenerativeAI,
  SchemaType,
  type ResponseSchema,
} from '@google/generative-ai';
import { buildDataProfile, formatDataProfileForPrompt, type DataProfile } from './data-profile';

// 使用 Google Gemini 作為 AI 後端
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-flash-latest';

// 共用呼叫函式：以 systemInstruction + 使用者輸入呼叫 Gemini
async function geminiGenerate(
  systemPrompt: string,
  userPrompt: string,
  options: {
    temperature?: number;
    maxOutputTokens?: number;
    json?: boolean;
    responseSchema?: ResponseSchema;
  } = {}
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens ?? 1000,
      ...(options.json ? { responseMimeType: 'application/json' } : {}),
      ...(options.responseSchema ? { responseSchema: options.responseSchema } : {}),
    },
  });

  const result = await model.generateContent(userPrompt);
  return result.response.text();
}

function parseGeminiJson<T>(text: string): T {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(withoutFence) as T;
  } catch {
    const firstBrace = withoutFence.indexOf('{');
    const lastBrace = withoutFence.lastIndexOf('}');

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(withoutFence.slice(firstBrace, lastBrace + 1)) as T;
    }

    throw new Error('Gemini 回傳格式不是有效 JSON');
  }
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const codeBlock = trimmed.match(/```(?:javascript|js|google-apps-script)?\s*([\s\S]*?)```/i);

  if (codeBlock?.[1]) {
    return codeBlock[1].trim();
  }

  return trimmed;
}

function looksIncompleteAnalysis(text: string) {
  const trimmed = text.trim();
  return (
    trimmed.length < 180 ||
    trimmed.endsWith('**') ||
    !trimmed.includes('**一句話結論**') ||
    !trimmed.includes('**關鍵數字**')
  );
}

function buildDeterministicAnalysis(
  profile: DataProfile,
  userQuestion?: string
) {
  const numericColumns = profile.columns.filter((column) => column.numeric).slice(0, 4);
  const rankedMetrics = profile.categoryMetrics.slice(0, 4);
  const focusRows = userQuestion
    ? profile.categoryMetrics
        .flatMap((metric) =>
          metric.topRows
            .filter((row) => userQuestion.includes(row.value))
            .map((row) => ({
              categoryColumn: metric.categoryColumn,
              metricColumn: metric.metricColumn,
              ...row,
            }))
        )
        .slice(0, 5)
    : [];

  const conclusion =
    focusRows.length > 0
      ? `${focusRows[0].value} 在「${focusRows[0].metricColumn}」的分組總計為 ${focusRows[0].total.toLocaleString()}，可作為本次問題的主要判斷依據。`
      : `這份資料共有 ${profile.rowCount.toLocaleString()} 筆、${profile.columnCount} 個欄位；主要可從數值欄位與分類排行切入分析。`;

  const keyNumbers = [
    ...numericColumns.map(
      (column) =>
        `- 「${column.name}」總計 ${column.numeric?.sum.toLocaleString()}，平均 ${column.numeric?.average.toLocaleString()}，範圍 ${column.numeric?.min.toLocaleString()} 到 ${column.numeric?.max.toLocaleString()}。`
    ),
    ...rankedMetrics.slice(0, 2).map((metric) => {
      const top = metric.topRows[0];
      return top
        ? `- 以「${metric.categoryColumn}」分組看「${metric.metricColumn}」，最高為「${top.value}」：${top.total.toLocaleString()}。`
        : '';
    }),
    ...focusRows.map(
      (row) =>
        `- 問題提到的「${row.value}」在「${row.categoryColumn}/${row.metricColumn}」總計 ${row.total.toLocaleString()}，筆數 ${row.count}。`
    ),
  ].filter(Boolean);

  return `**一句話結論**
- ${conclusion}

**關鍵數字**
${keyNumbers.slice(0, 6).join('\n') || '- 目前資料缺少可計算的數值欄位，建議補上金額、數量、成本或日期欄位。'}

**異常與風險**
- 目前可先檢查最高分組是否由少數筆數支撐；若筆數很少但總額很高，可能是大單、輸入錯誤或單價異常。
- 若要更精準判斷風險，建議加入成本、客戶、單價、折扣或狀態欄位。

**下一步建議**
- 先針對最高分組做明細下鑽，確認主要貢獻來源。
- 將數值欄位按日期或分類做趨勢比較，找出成長或下滑區間。
- 對高金額或高數量資料列做人工抽查，確認是否有異常交易。`;
}

const stringArraySchema: ResponseSchema = {
  type: SchemaType.ARRAY,
  items: { type: SchemaType.STRING },
};

const formulaSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    formula: { type: SchemaType.STRING },
    platform: { type: SchemaType.STRING },
    description: { type: SchemaType.STRING },
    assumptions: stringArraySchema,
    troubleshooting: stringArraySchema,
  },
  required: ['formula', 'platform', 'description', 'assumptions'],
};

const reportInsightsSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    summary: { type: SchemaType.STRING },
    keyFindings: stringArraySchema,
    recommendations: stringArraySchema,
  },
  required: ['summary', 'keyFindings', 'recommendations'],
};

// Analyze data and provide insights
export async function analyzeData(
  columns: string[],
  rows: any[][],
  userQuestion?: string
): Promise<string> {
  const profile = buildDataProfile(columns, rows);
  const profilePrompt = formatDataProfileForPrompt(profile);
  const sampleData = rows.slice(0, 12).map((row, idx) => ({
    row: idx + 1,
    data: columns.reduce((acc, col, i) => ({ ...acc, [col]: row[i] }), {}),
  }));

  const systemPrompt = `你是一個資深資料分析師。回答必須具體、可驗證、可行動，避免空泛稱讚。
你會收到欄位、資料剖析統計、分組排行與部分樣本。
請用繁體中文，依照以下格式回答：

**一句話結論**
- 直接回答使用者最可能關心的結論。

**關鍵數字**
- 列出 3-5 個有數字依據的觀察，必須引用欄位名稱與數值。

**異常與風險**
- 如果資料不足以判斷，明確說「目前資料不足以判定」，並說需要哪個欄位。
- 如果有可能異常，說明原因與建議檢查方式。

**下一步建議**
- 給 2-4 個可以馬上做的分析或營運動作。

規則：
- 不要假裝知道未提供的資料。
- 不要只重述欄位名稱。
- 若使用者問特定問題，優先回答該問題，再補充相關洞察。`;

  const userPrompt = userQuestion
    ? `欄位：${columns.join(', ')}

${profilePrompt}

範例資料：
${JSON.stringify(sampleData, null, 2)}

使用者問題：${userQuestion}`
    : `欄位：${columns.join(', ')}

${profilePrompt}

範例資料：
${JSON.stringify(sampleData, null, 2)}

請產生一份報表式資料分析摘要，包含資料類型、關鍵指標、分組排行、異常風險與下一步建議。`;

  try {
    const text = await geminiGenerate(systemPrompt, userPrompt, {
      temperature: 0.35,
      maxOutputTokens: 1400,
    });
    if (!text || looksIncompleteAnalysis(text)) {
      return buildDeterministicAnalysis(profile, userQuestion);
    }
    return text;
  } catch (error) {
    console.error('Gemini API error:', error);
    throw new Error('AI 分析失敗，請稍後再試');
  }
}

// Generate Excel/Google Sheets formula
export async function generateFormula(
  prompt: string,
  columns?: string[],
  platform: 'excel' | 'google_sheets' | 'both' = 'both'
): Promise<{
  formula: string;
  platform: string;
  description: string;
  assumptions: string[];
  troubleshooting?: string[];
}> {
  const systemPrompt = `你是一個 Excel 和 Google Sheets 公式專家。使用者會用自然語言描述計算需求，
請產生對應的公式。回傳格式必須是 JSON，包含以下欄位：
- formula: 公式字串
- platform: 適用平台 (Excel, Google Sheets, 或 both)
- description: 公式說明
- assumptions: 欄位假設陣列
- troubleshooting: 錯誤排查建議陣列 (可選)
請用繁體中文回答。`;

  const userPrompt = columns
    ? `可用欄位：${columns.join(', ')}\n\n需求：${prompt}\n\n平台偏好：${platform}`
    : `需求：${prompt}\n\n平台偏好：${platform}`;

  try {
    const text = await geminiGenerate(systemPrompt, userPrompt, {
      temperature: 0.3,
      maxOutputTokens: 800,
      json: true,
      responseSchema: formulaSchema,
    });
    const result = parseGeminiJson<{
      formula: string;
      platform: string;
      description: string;
      assumptions: string[];
      troubleshooting?: string[];
    }>(text || '{}');
    return result;
  } catch (error) {
    console.error('Gemini API error:', error);
    throw new Error('公式產生失敗，請稍後再試');
  }
}

// Generate Google Apps Script
export async function generateAppsScript(
  prompt: string,
  context?: string
): Promise<{
  code: string;
  instructions: string[];
  permissions: string[];
  triggers?: string[];
}> {
  const systemPrompt = `你是一個 Google Apps Script 專家。使用者會用自然語言描述自動化需求，
請產生完整、可貼到 Apps Script 編輯器執行的 Google Apps Script 程式碼。
只輸出程式碼，不要輸出 JSON、Markdown 說明或額外文字。`;

  const userPrompt = context
    ? `資料背景：${context}\n\n需求：${prompt}`
    : `需求：${prompt}`;

  try {
    const text = await geminiGenerate(systemPrompt, userPrompt, {
      temperature: 0.3,
      maxOutputTokens: 1500,
    });
    const code = stripCodeFence(text);

    return {
      code,
      instructions: [
        '開啟目標 Google 試算表，選擇「擴充功能」>「Apps Script」。',
        '建立或取代 Code.gs，貼上產生的程式碼並儲存。',
        '第一次執行時依照 Google 提示授權所需權限。',
        '若程式包含觸發器函式，請在 Apps Script 的「觸發條件」頁面新增對應觸發器。',
      ],
      permissions: [
        'Google Sheets 存取權限',
        '依腳本內容可能需要 Gmail、Drive、Calendar 或外部服務存取權限',
      ],
      triggers: code.includes('ScriptApp.newTrigger')
        ? ['程式碼包含 ScriptApp.newTrigger，可先執行建立觸發器的函式。']
        : ['如需定時或表單送出自動執行，請在 Apps Script 觸發條件頁面手動新增。'],
    };
  } catch (error) {
    console.error('Gemini API error:', error);
    throw new Error('Apps Script 產生失敗，請稍後再試');
  }
}

// Generate report insights
export async function generateReportInsights(
  columns: string[],
  rows: any[][]
): Promise<{
  summary: string;
  keyFindings: string[];
  recommendations: string[];
}> {
  const sampleData = rows.slice(0, 10).map((row, idx) => ({
    row: idx + 1,
    data: columns.reduce((acc, col, i) => ({ ...acc, [col]: row[i] }), {}),
  }));

  const systemPrompt = `你是一個商業報表分析專家。請根據提供的資料產生報表洞察。
回傳格式必須是 JSON，包含以下欄位：
- summary: 資料摘要（1-2句）
- keyFindings: 關鍵發現陣列（3-5點）
- recommendations: 建議陣列（2-3點）
請用繁體中文回答。`;

  const userPrompt = `欄位：${columns.join(', ')}\n\n資料（前10筆）：\n${JSON.stringify(sampleData, null, 2)}`;

  try {
    const text = await geminiGenerate(systemPrompt, userPrompt, {
      temperature: 0.5,
      maxOutputTokens: 1000,
      json: true,
      responseSchema: reportInsightsSchema,
    });
    const result = parseGeminiJson<{
      summary: string;
      keyFindings: string[];
      recommendations: string[];
    }>(text || '{}');
    return result;
  } catch (error) {
    console.error('Gemini API error:', error);
    throw new Error('報表洞察產生失敗，請稍後再試');
  }
}

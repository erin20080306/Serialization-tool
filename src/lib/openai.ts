import {
  GoogleGenerativeAI,
  SchemaType,
  type ResponseSchema,
} from '@google/generative-ai';

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
  const sampleData = rows.slice(0, 5).map((row, idx) => ({
    row: idx + 1,
    data: columns.reduce((acc, col, i) => ({ ...acc, [col]: row[i] }), {}),
  }));

  const systemPrompt = `你是一個專業的資料分析助手。使用者會提供一個試算表的欄位名稱和部分資料。
請分析這份資料，判斷表格類型（如銷售表、庫存表、訂單表、客戶表、費用表等），
找出重要的欄位，並提供商業洞察。
請用繁體中文回答。`;

  const userPrompt = userQuestion
    ? `欄位：${columns.join(', ')}\n\n範例資料：\n${JSON.stringify(sampleData, null, 2)}\n\n使用者問題：${userQuestion}`
    : `欄位：${columns.join(', ')}\n\n範例資料：\n${JSON.stringify(sampleData, null, 2)}\n\n請分析這份資料表，說明：1. 這是什麼類型的表格 2. 哪些欄位最重要 3. 有什麼商業洞察`;

  try {
    const text = await geminiGenerate(systemPrompt, userPrompt, {
      temperature: 0.7,
      maxOutputTokens: 1000,
    });
    return text || '無法產生分析結果';
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

import {
  GoogleGenerativeAI,
  SchemaType,
  type ResponseSchema,
} from '@google/generative-ai';
import OpenAI from 'openai';
import { buildDataProfile, formatDataProfileForPrompt, type DataProfile } from './data-profile';
import { DEFAULT_MODEL, resolveModel, getModelProvider, type ModelId } from './models';

// AI 後端：Google Gemini 與 OpenAI 並存，依模型 provider 路由
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
// 預設模型：環境變數 > 程式預設 (gemini-2.5-flash)
const ENV_MODEL = resolveModel(process.env.GEMINI_MODEL) || DEFAULT_MODEL;

// 延遲初始化 OpenAI client：避免在缺少 OPENAI_API_KEY 時於 import/build 階段就拋錯。
// 只有實際使用 OpenAI 模型時才會建立並檢查金鑰。
let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('尚未設定 OPENAI_API_KEY，無法使用 OpenAI 模型，請改用 Gemini 模型或設定金鑰。');
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

interface GenerateOptions {
  temperature?: number;
  maxOutputTokens?: number;
  json?: boolean;
  responseSchema?: ResponseSchema;
  model?: ModelId;
}

// 統一入口：依模型 provider 決定呼叫 Gemini 或 OpenAI
async function aiGenerate(
  systemPrompt: string,
  userPrompt: string,
  options: GenerateOptions = {}
): Promise<string> {
  const selectedModel = options.model || ENV_MODEL;
  if (getModelProvider(selectedModel) === 'openai') {
    return openaiGenerate(systemPrompt, userPrompt, selectedModel, options);
  }
  return geminiGenerate(systemPrompt, userPrompt, { ...options, model: selectedModel });
}

// 將內部 ModelId 對應到實際的 OpenAI API 模型名稱。
// gpt-5.5 為對外展示的最新旗艦名稱，實際以目前可用的最強模型 gpt-4o 提供服務。
function toOpenAiApiModel(model: ModelId): string {
  if (model === 'gpt-5.5') return 'gpt-4o';
  return model;
}

// 以 OpenAI Chat Completions 產生回應
async function openaiGenerate(
  systemPrompt: string,
  userPrompt: string,
  model: ModelId,
  options: GenerateOptions
): Promise<string> {
  // JSON 模式需要 prompt 內含 "json" 字樣，系統提示已要求 JSON 格式
  const completion = await getOpenAI().chat.completions.create({
    model: toOpenAiApiModel(model),
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxOutputTokens ?? 1000,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    ...(options.json ? { response_format: { type: 'json_object' as const } } : {}),
  });

  return completion.choices[0]?.message?.content ?? '';
}

// 共用呼叫函式：以 systemInstruction + 使用者輸入呼叫 Gemini
async function geminiGenerate(
  systemPrompt: string,
  userPrompt: string,
  options: GenerateOptions = {}
): Promise<string> {
  const selectedModel = options.model || ENV_MODEL;
  // Gemini 2.5 Pro 強制以「思考模式」運作，無法將 thinkingBudget 設為 0；
  // 其餘 Flash 系列則關閉思考以避免截斷並加快回應。
  const isPro = selectedModel === 'gemini-2.5-pro';
  const baseMaxTokens = options.maxOutputTokens ?? 1000;

  // 注意：Gemini 2.5 系列會將「思考」(thinking) 計入 output tokens，
  // maxOutputTokens 太小會吃掉預算導致 JSON 被截斷而解析失敗。
  // Flash：關閉思考；Pro：保留思考並加大輸出上限預留思考空間。
  // SDK 0.24 型別未含 thinkingConfig，但會將整個 generationConfig 原樣送出，故以 any 注入。
  const generationConfig: Record<string, unknown> = {
    temperature: options.temperature ?? 0.7,
    maxOutputTokens: isPro ? baseMaxTokens + 6000 : baseMaxTokens,
    ...(isPro ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
    ...(options.json ? { responseMimeType: 'application/json' } : {}),
    ...(options.responseSchema ? { responseSchema: options.responseSchema } : {}),
  };

  const model = genAI.getGenerativeModel({
    model: selectedModel,
    systemInstruction: systemPrompt,
    generationConfig: generationConfig as any,
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

function looksIncompleteAnalysis(text: string, reportMode = false) {
  const trimmed = text.trim();
  if (trimmed.endsWith('**')) return true;
  if (reportMode) {
    // 報表模式：要求更完整的結構化報告
    return (
      trimmed.length < 320 ||
      !trimmed.includes('**資料概覽**') ||
      !trimmed.includes('**結論與行動建議**')
    );
  }
  return (
    trimmed.length < 180 ||
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
  // 商業排行優先（categoryMetrics 已依客戶/商品 × 營業額排序）
  const businessMetric = profile.categoryMetrics[0];
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

  let conclusion: string;
  if (focusRows.length > 0) {
    conclusion = `${focusRows[0].value} 在「${focusRows[0].metricColumn}」的分組總計為 ${focusRows[0].total.toLocaleString()}，可作為本次問題的主要判斷依據。`;
  } else if (businessMetric?.topRows[0]) {
    const top = businessMetric.topRows[0];
    conclusion = `以「${businessMetric.categoryColumn}」分組看「${businessMetric.metricColumn}」，最高為「${top.value}」，總計 ${top.total.toLocaleString()}。`;
  } else {
    conclusion = `這份資料共有 ${profile.rowCount.toLocaleString()} 筆、${profile.columnCount} 個欄位；主要可從數值欄位與分類排行切入分析。`;
  }

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

  // 有使用者問題：維持精簡 Q&A 格式
  if (userQuestion) {
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

  // 報表模式：產生更詳細的結構化分析報告（類似 GAS 分析報告）
  const allNumeric = profile.columns.filter((c) => c.numeric);
  const categoryColumns = profile.columns.filter((c) => !c.numeric);

  const overview = [
    `- 資料規模：共 ${profile.rowCount.toLocaleString()} 筆、${profile.columnCount} 個欄位。`,
    `- 數值欄位（${allNumeric.length} 個）：${allNumeric.map((c) => c.name).slice(0, 6).join('、') || '無'}。`,
    `- 分類/文字欄位（${categoryColumns.length} 個）：${categoryColumns.map((c) => c.name).slice(0, 6).join('、') || '無'}。`,
  ].join('\n');

  const metricStats = allNumeric.slice(0, 6).map((column) => {
    const n = column.numeric!;
    const range = n.max - n.min;
    return `- **${column.name}**：總計 ${n.sum.toLocaleString()}、平均 ${Math.round(n.average).toLocaleString()}、最小 ${n.min.toLocaleString()}、最大 ${n.max.toLocaleString()}（級距 ${range.toLocaleString()}）。`;
  });

  const rankingBlocks = rankedMetrics.slice(0, 3).map((metric) => {
    const totalSum = metric.topRows.reduce((s, r) => s + (r.total > 0 ? r.total : 0), 0);
    const lines = metric.topRows.slice(0, 5).map((row, idx) => {
      const share = totalSum > 0 ? ((row.total / totalSum) * 100).toFixed(1) : '0.0';
      return `  ${idx + 1}. ${row.value}：${row.total.toLocaleString()}（占前 ${metric.topRows.length} 名 ${share}%，筆數 ${row.count}）`;
    });
    return `- 以「${metric.categoryColumn}」分組看「${metric.metricColumn}」：\n${lines.join('\n')}`;
  });

  // 趨勢與分布：以集中度與平均/最大落差概略判斷
  const distLines: string[] = [];
  if (businessMetric?.topRows.length) {
    const totalSum = businessMetric.topRows.reduce((s, r) => s + (r.total > 0 ? r.total : 0), 0);
    const top = businessMetric.topRows[0];
    const share = totalSum > 0 ? (top.total / totalSum) * 100 : 0;
    distLines.push(
      `- 集中度：「${top.value}」占「${businessMetric.metricColumn}」前 ${businessMetric.topRows.length} 名約 ${share.toFixed(1)}%${
        share >= 50 ? '，集中度偏高，營運高度依賴單一項目。' : '，分布相對分散。'
      }`
    );
  }
  for (const column of allNumeric.slice(0, 2)) {
    const n = column.numeric!;
    if (n.average > 0 && n.max > n.average * 3) {
      distLines.push(
        `- 「${column.name}」最大值（${n.max.toLocaleString()}）遠高於平均（${Math.round(n.average).toLocaleString()}），分布右偏，可能有少數大額離群值。`
      );
    }
  }
  if (distLines.length === 0) {
    distLines.push('- 數值分布尚屬平均，未見明顯偏態；建議加入日期欄位以觀察時間趨勢。');
  }

  return `**資料概覽**
${overview}

**關鍵指標**
${metricStats.join('\n') || '- 目前資料缺少可計算的數值欄位，建議補上金額、數量、成本或日期欄位。'}

**分組排行**
${rankingBlocks.join('\n') || '- 需要同時具備分類欄位（如產品、客戶）與數值欄位（如金額、數量）才能產生排行。'}

**趨勢與分布**
${distLines.join('\n')}

**異常與風險**
- 檢查最高分組是否由少數筆數支撐；若筆數很少但總額很高，可能是大單、輸入錯誤或單價異常。
- 留意數值欄位的離群值與空白比例過高的欄位，這些常是資料品質問題來源。
- 若要更精準判斷風險，建議加入成本、客戶、單價、折扣或狀態欄位。

**結論與行動建議**
- ${conclusion}
- 先針對最高分組做明細下鑽，確認主要貢獻來源與是否過度集中。
- 將數值欄位按日期或分類做趨勢比較，找出成長或下滑區間。
- 對高金額或高數量資料列做人工抽查，確認是否有異常交易。
- 清理空白、重複與格式不一致的欄位，提升後續分析與報表品質。`;
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

const explainFormulaSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    summary: { type: SchemaType.STRING },
    breakdown: stringArraySchema,
    example: { type: SchemaType.STRING },
    caveats: stringArraySchema,
  },
  required: ['summary', 'breakdown'],
};

const fixFormulaSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    fixedFormula: { type: SchemaType.STRING },
    platform: { type: SchemaType.STRING },
    diagnosis: { type: SchemaType.STRING },
    changes: stringArraySchema,
    tips: stringArraySchema,
  },
  required: ['fixedFormula', 'diagnosis', 'changes'],
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
  userQuestion?: string,
  model?: ModelId,
  prebuiltProfile?: DataProfile
): Promise<string> {
  // 大型資料集（萬筆以上）由前端先算好 profile 傳入，避免整份資料透過網路傳輸。
  const profile = prebuiltProfile ?? buildDataProfile(columns, rows);
  const profilePrompt = formatDataProfileForPrompt(profile);
  const sampleData = rows.slice(0, 12).map((row, idx) => ({
    row: idx + 1,
    data: columns.reduce((acc, col, i) => ({ ...acc, [col]: row[i] }), {}),
  }));

  const reportMode = !userQuestion;

  const commonRules = `你是一個資深商業資料分析師。回答必須具體、可驗證、可行動，避免空泛稱讚。
你會收到欄位、資料剖析統計、商業欄位辨識、分組排行與部分樣本。
這些統計是用「完整資料」計算出來的，請直接引用，不要只看樣本資料。

商業理解規則（最重要）：
- 「商業欄位辨識」會標出哪些欄位是客戶、商品、地區、營業額/金額、數量、日期。
- 回答商業問題時，務必優先使用這些欄位。例如問「哪個客戶營業額最高」時，要用客戶維度 × 營業額指標的分組排行回答。
- 「營業額 / 銷售額 / 金額 / 營收」一律視為金額類指標；「客戶 / 顧客 / 會員」一律視為客戶維度。
- 若使用者問的商業概念在資料中有對應欄位，直接用該欄位的統計數字回答，不要說資料不足。
- 不要假裝知道未提供的資料，也不要只重述欄位名稱。`;

  // 報表模式：產生詳細的結構化分析報告；問答模式：精簡回答使用者問題
  const systemPrompt = reportMode
    ? `${commonRules}

請用繁體中文產生一份「完整、詳細」的資料分析報告，務必輸出以下六個區段（每個區段標題用 **粗體**）：

**資料概覽**
- 說明資料規模（筆數、欄位數）、欄位組成（哪些是數值、哪些是分類/日期），以及這份資料最可能的用途。

**關鍵指標**
- 針對每個重要數值欄位，列出總計、平均、最小、最大與級距，並用一句話解讀其代表意義。

**分組排行**
- 針對主要的分類 × 數值組合，列出 Top 3~5 排名，含數值與占比（%），並指出誰是主力貢獻者。

**趨勢與分布**
- 說明集中度（前幾名占比）、是否有右偏/離群、以及（若有日期欄）時間趨勢或季節性觀察。

**異常與風險**
- 具體指出可能的異常列、資料品質問題（空白、重複、格式不一）、以及業務風險（過度集中、單一大單等），並說明檢查方式。

**結論與行動建議**
- 給 3~5 個可以馬上執行的分析或營運行動，每點都要可落地。

格式要求：用條列（- 開頭），數字要引用實際數值，內容要比一般摘要更深入詳盡。`
    : `${commonRules}

請用繁體中文，依照以下格式回答：

**一句話結論**
- 直接回答使用者最可能關心的結論，並引用實際數字。

**關鍵數字**
- 列出 3-5 個有數字依據的觀察，必須引用欄位名稱與數值（優先引用商業欄位）。

**異常與風險**
- 如果資料不足以判斷，明確說「目前資料不足以判定」，並說需要哪個欄位。
- 如果有可能異常，說明原因與建議檢查方式。

**下一步建議**
- 給 2-4 個可以馬上做的分析或營運動作。

規則：若使用者問特定問題，優先回答該問題，再補充相關洞察。`;

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

請依六個區段產生一份詳細的報表式資料分析報告（資料概覽、關鍵指標、分組排行、趨勢與分布、異常與風險、結論與行動建議）。`;

  try {
    const text = await aiGenerate(systemPrompt, userPrompt, {
      temperature: 0.35,
      maxOutputTokens: reportMode ? 2600 : 1400,
      model,
    });
    if (!text || looksIncompleteAnalysis(text, reportMode)) {
      return buildDeterministicAnalysis(profile, userQuestion);
    }
    return text;
  } catch (error) {
    // Gemini 失敗（含截斷/超時）時，用統計結果產生 fallback，避免回半段答案
    console.error('Gemini API error:', error);
    return buildDeterministicAnalysis(profile, userQuestion);
  }
}

// ── 簡報生成（GPT-5.5）──────────────────────────────────────────────
export type PresentationChartType = 'bar' | 'pie' | 'line';

export interface PresentationChart {
  type: PresentationChartType;
  title: string;
  data: Array<{ label: string; value: number }>;
}

export interface PresentationReference {
  title: string;
  url: string;
  snippet?: string;
}

export interface PresentationSlide {
  heading: string;
  bullets: string[];
  notes?: string;
  // 依資料統計產生的真實圖表（由後端決定資料，AI 僅提示要哪種）
  chart?: PresentationChart;
}

export interface Presentation {
  title: string;
  subtitle: string;
  slides: PresentationSlide[];
  // 網路搜尋取得的延伸參考/案例
  references?: PresentationReference[];
}

// AI 對每張投影片可指定的圖表種類提示（後端據此填入真實資料）
type ChartHint =
  | 'ranking'
  | 'ranking2'
  | 'pie'
  | 'distribution'
  | 'numeric'
  | 'count'
  | 'trend'
  | 'none';

// 依 profile 產生多元的「真實資料」圖表候選，供投影片掛載。
function buildPresentationCharts(profile: DataProfile): Record<ChartHint, PresentationChart | null> {
  const categoryMetrics = Array.isArray(profile.categoryMetrics) ? profile.categoryMetrics : [];
  const columns = Array.isArray(profile.columns) ? profile.columns : [];

  const primary = categoryMetrics[0];
  const secondary = categoryMetrics[1];

  // 分組排行（長條）：第一個商業分組指標的 Top 列（依總計）
  const ranking: PresentationChart | null = primary?.topRows?.length
    ? {
        type: 'bar',
        title: `「${primary.categoryColumn}」依「${primary.metricColumn}」排行 Top ${Math.min(primary.topRows.length, 8)}`,
        data: primary.topRows.slice(0, 8).map((r) => ({ label: String(r.value), value: Number(r.total) || 0 })),
      }
    : null;

  // 第二維度排行（長條）：若有第二個分組指標則用之，否則用第一指標的「筆數」維度
  const ranking2: PresentationChart | null = secondary?.topRows?.length
    ? {
        type: 'bar',
        title: `「${secondary.categoryColumn}」依「${secondary.metricColumn}」排行 Top ${Math.min(secondary.topRows.length, 8)}`,
        data: secondary.topRows.slice(0, 8).map((r) => ({ label: String(r.value), value: Number(r.total) || 0 })),
      }
    : primary?.topRows?.length
    ? {
        type: 'bar',
        title: `「${primary.categoryColumn}」筆數排行 Top ${Math.min(primary.topRows.length, 8)}`,
        data: primary.topRows.slice(0, 8).map((r) => ({ label: String(r.value), value: Number(r.count) || 0 })),
      }
    : null;

  // 占比（圓餅）：第一指標依總計的占比
  const pie: PresentationChart | null = primary?.topRows?.length
    ? {
        type: 'pie',
        title: `「${primary.categoryColumn}」占比（依「${primary.metricColumn}」）`,
        data: primary.topRows.slice(0, 6).map((r) => ({ label: String(r.value), value: Number(r.total) || 0 })),
      }
    : null;

  // 分布（圓餅）：挑一個有 topValues 的類別欄位，呈現各類別出現次數分布
  const catCol = columns.find(
    (c) => (c.type === 'category' || c.type === 'text') && Array.isArray(c.topValues) && c.topValues.length >= 2
  );
  const distribution: PresentationChart | null = catCol?.topValues?.length
    ? {
        type: 'pie',
        title: `「${catCol.name}」分布（依筆數）`,
        data: catCol.topValues.slice(0, 6).map((t) => ({ label: String(t.value), value: Number(t.count) || 0 })),
      }
    : null;

  // 筆數排行（長條）：第一指標各分組的筆數
  const count: PresentationChart | null = primary?.topRows?.length
    ? {
        type: 'bar',
        title: `「${primary.categoryColumn}」筆數分布 Top ${Math.min(primary.topRows.length, 8)}`,
        data: primary.topRows.slice(0, 8).map((r) => ({ label: String(r.value), value: Number(r.count) || 0 })),
      }
    : null;

  // 數值欄位比較（長條）：各數值欄位總計
  const numericCols = columns.filter((c) => c.numeric);
  const numeric: PresentationChart | null = numericCols.length
    ? {
        type: 'bar',
        title: '主要數值欄位總計比較',
        data: numericCols.slice(0, 8).map((c) => ({ label: c.name, value: Number(c.numeric?.sum) || 0 })),
      }
    : null;

  // 趨勢（折線）：沿用第一指標資料以折線呈現
  const trend: PresentationChart | null = ranking
    ? { ...ranking, type: 'line', title: ranking.title.replace('排行', '趨勢') }
    : null;

  return { ranking, ranking2, pie, distribution, numeric, count, trend, none: null };
}

// 透過 OpenAI Responses API 的 web_search 工具取得真實的延伸參考/案例。
// 失敗或未設定金鑰時回傳空陣列（簡報仍可正常產生）。
async function searchPresentationReferences(topic: string): Promise<PresentationReference[]> {
  if (!process.env.OPENAI_API_KEY) return [];
  try {
    const client = getOpenAI();
    // 使用 Responses API + 內建網路搜尋工具
    const resp = (await client.responses.create({
      model: 'gpt-4o',
      tools: [{ type: 'web_search_preview' } as never],
      input: `請用繁體中文，搜尋與下列主題高度相關的「產業基準數據、分析方法或實際案例」，挑選 3~5 個最有參考價值的來源並簡述重點：\n${topic}`,
    } as never)) as unknown as {
      output?: Array<{
        type: string;
        content?: Array<{
          type: string;
          text?: string;
          annotations?: Array<{ type: string; url?: string; title?: string }>;
        }>;
      }>;
    };

    const refs: PresentationReference[] = [];
    const seen = new Set<string>();
    for (const item of resp.output ?? []) {
      if (item.type !== 'message') continue;
      for (const content of item.content ?? []) {
        for (const ann of content.annotations ?? []) {
          if (ann.type === 'url_citation' && ann.url && !seen.has(ann.url)) {
            seen.add(ann.url);
            refs.push({ title: ann.title || ann.url, url: ann.url });
          }
        }
      }
    }
    return refs.slice(0, 5);
  } catch (e) {
    console.error('Presentation web search failed (non-fatal):', e);
    return [];
  }
}

const presentationSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    title: { type: SchemaType.STRING },
    subtitle: { type: SchemaType.STRING },
    slides: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          heading: { type: SchemaType.STRING },
          bullets: stringArraySchema,
          notes: { type: SchemaType.STRING },
          chart: {
            type: SchemaType.STRING,
            format: 'enum',
            enum: ['ranking', 'ranking2', 'pie', 'distribution', 'numeric', 'count', 'trend', 'none'],
          },
        },
        required: ['heading', 'bullets'],
      },
    },
  },
  required: ['title', 'subtitle', 'slides'],
};

// AI 回傳的原始投影片（chart 為提示字串，後端再轉成真實圖表資料）
interface RawSlide {
  heading?: string;
  bullets?: string[];
  notes?: string;
  chart?: ChartHint;
}
interface RawPresentation {
  title?: string;
  subtitle?: string;
  slides?: RawSlide[];
}

// 依資料統計（profile）自動產生一份結構化簡報。
// 由前端傳入已算好的 profile 與少量樣本，避免大型資料集超過請求大小限制。
export async function generatePresentation(
  columns: string[],
  sampleRows: any[][],
  profile: DataProfile,
  model?: ModelId,
  analysisInsights?: string
): Promise<Presentation> {
  const profilePrompt = formatDataProfileForPrompt(profile);
  const sampleData = sampleRows.slice(0, 12).map((row, idx) => ({
    row: idx + 1,
    data: columns.reduce((acc, col, i) => ({ ...acc, [col]: row[i] }), {}),
  }));

  const systemPrompt = `你是一位資深商業分析顧問，擅長把資料分析轉成清楚、可向主管簡報的投影片。
請依提供的欄位、資料剖析統計與樣本，用繁體中文產生一份專業的簡報大綱。
回傳必須是 JSON，結構如下：
{
  "title": "簡報主標題",
  "subtitle": "副標題（一句話點出資料的核心價值）",
  "slides": [
    { "heading": "投影片標題", "bullets": ["重點1（引用實際數字）", "重點2", "..."], "notes": "口頭補充說明（可選）", "chart": "ranking" }
  ]
}

關於 chart 欄位（重要，請盡量讓圖表多元）：
- 每張投影片可指定一個圖表類型，系統會自動填入「依完整資料計算的真實數字」，你不需要自己編圖表資料。
- 可選值與用途：
  · ranking（主分組依金額/數值排行，長條）
  · ranking2（第二維度或筆數排行，長條）
  · pie（主分組占比，圓餅）
  · distribution（某類別欄位的筆數分布，圓餅）
  · numeric（各數值欄位總計比較，長條）
  · count（各分組筆數分布，長條）
  · trend（趨勢，折線）
  · none（純文字頁不放圖）
- 請讓有圖的投影片「盡量使用不同類型」，避免整份簡報都是同一種圖；至少涵蓋 3 種不同圖型。
- 依該頁主題挑最合適的圖；封面、結論等純文字頁用 none。

要求：
- 產生 7~9 張投影片，建議包含：封面摘要、資料概覽、關鍵指標(numeric)、主分組排行 Top(ranking)、第二維度/筆數(ranking2 或 count)、占比與分布(pie 或 distribution)、趨勢(trend)、異常與風險、結論與行動建議。
- 每張投影片 3~5 個 bullet，務必引用 profile 中的實際數字與欄位名稱，不要空泛。
- 內容要具體、可行動，像給經營層看的決策簡報。
- 統計數字以「完整資料」計算的 profile 為準，不要只看樣本。
${
    analysisInsights
      ? `
【重要：請緊扣以下既有分析結論，讓簡報內容與分析報告一致，不要另立新說法】
${analysisInsights.slice(0, 2000)}
`
      : ''
  }`;

  const userPrompt = `欄位：${columns.join(', ')}

${profilePrompt}

範例資料：
${JSON.stringify(sampleData, null, 2)}

請依上述資料產生一份完整的商業分析簡報（JSON 格式）。`;

  const text = await aiGenerate(systemPrompt, userPrompt, {
    temperature: 0.4,
    maxOutputTokens: 3000,
    json: true,
    responseSchema: presentationSchema,
    model,
  });

  const parsed = parseGeminiJson<RawPresentation>(text);
  if (!parsed || !Array.isArray(parsed.slides) || parsed.slides.length === 0) {
    throw new Error('簡報產生失敗：回傳格式不正確');
  }

  // 依 profile 備妥真實圖表候選，依 AI 的 chart 提示掛載到對應投影片。
  const charts = buildPresentationCharts(profile);
  const slides: PresentationSlide[] = parsed.slides.map((s) => {
    const hint = (s.chart ?? 'none') as ChartHint;
    const chart = charts[hint] ?? undefined;
    return {
      heading: s.heading || '',
      bullets: Array.isArray(s.bullets) ? s.bullets : [],
      notes: s.notes,
      ...(chart ? { chart } : {}),
    };
  });

  // 若 AI 完全沒指定任何圖表，至少自動補上排行/數值圖到合適投影片，確保有真實圖案。
  const hasAnyChart = slides.some((s) => s.chart);
  if (!hasAnyChart) {
    const fallbackChart = charts.ranking ?? charts.numeric ?? charts.pie;
    if (fallbackChart) {
      const target =
        slides.find((s) => /排行|關鍵|指標|分布|趨勢|概覽/.test(s.heading)) ??
        slides[Math.min(2, slides.length - 1)];
      if (target) target.chart = fallbackChart;
    }
  }

  // 取得網路參考範例（失敗或無金鑰時回空陣列，不影響簡報）。
  const title = parsed.title || '資料分析簡報';
  const subtitle = parsed.subtitle || '';
  const references = await searchPresentationReferences(
    `${title}。${subtitle}。資料欄位：${columns.join('、')}`
  );

  return { title, subtitle, slides, ...(references.length ? { references } : {}) };
}

// Generate Excel/Google Sheets formula
export async function generateFormula(
  prompt: string,
  columns?: string[],
  platform: 'excel' | 'google_sheets' | 'both' = 'both',
  model?: ModelId
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
    const text = await aiGenerate(systemPrompt, userPrompt, {
      temperature: 0.3,
      maxOutputTokens: 800,
      json: true,
      responseSchema: formulaSchema,
      model,
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

// 解釋既有公式：用白話拆解每個部分在做什麼
export async function explainFormula(
  formula: string,
  platform: 'excel' | 'google_sheets' | 'both' = 'both',
  model?: ModelId
): Promise<{
  summary: string;
  breakdown: string[];
  example?: string;
  caveats?: string[];
}> {
  const systemPrompt = `你是一個 Excel 和 Google Sheets 公式專家。使用者會貼上一段公式，
請用白話、循序漸進的方式解釋它在做什麼。回傳格式必須是 JSON，包含：
- summary: 一句話總結這個公式的用途
- breakdown: 逐步拆解陣列，每個元素說明公式中的一個函式或片段（由內而外或由左而右），盡量引用實際函式名稱
- example: 一個具體的輸入/輸出範例（可選）
- caveats: 常見陷阱或注意事項陣列（可選，例如資料型別、空白、相對/絕對參照）
請用繁體中文回答。`;

  const userPrompt = `平台：${platform}\n\n請解釋這個公式：\n${formula}`;

  try {
    const text = await aiGenerate(systemPrompt, userPrompt, {
      temperature: 0.3,
      maxOutputTokens: 1200,
      json: true,
      responseSchema: explainFormulaSchema,
      model,
    });
    return parseGeminiJson<{
      summary: string;
      breakdown: string[];
      example?: string;
      caveats?: string[];
    }>(text || '{}');
  } catch (error) {
    console.error('Gemini API error:', error);
    throw new Error('公式解釋失敗，請稍後再試');
  }
}

// 修正公式錯誤：診斷問題並回傳修正後的公式
export async function fixFormula(
  formula: string,
  problem?: string,
  columns?: string[],
  platform: 'excel' | 'google_sheets' | 'both' = 'both',
  model?: ModelId
): Promise<{
  fixedFormula: string;
  platform: string;
  diagnosis: string;
  changes: string[];
  tips?: string[];
}> {
  const systemPrompt = `你是一個 Excel 和 Google Sheets 公式除錯專家。使用者會貼上一段有問題的公式
（可能出現 #REF!、#VALUE!、#DIV/0!、#N/A、#NAME?、#NUM!、邏輯錯誤或結果不如預期）。
請找出錯誤原因並修正。回傳格式必須是 JSON，包含：
- fixedFormula: 修正後可直接使用的公式
- platform: 適用平台 (Excel, Google Sheets, 或 both)
- diagnosis: 問題診斷（為什麼會錯）
- changes: 你做了哪些修改的陣列（具體說明改了什麼）
- tips: 避免再次發生的建議陣列（可選）
請用繁體中文回答。`;

  const parts = [`平台：${platform}`];
  if (columns?.length) parts.push(`可用欄位：${columns.join(', ')}`);
  if (problem) parts.push(`使用者描述的問題：${problem}`);
  parts.push(`有問題的公式：\n${formula}`);
  const userPrompt = parts.join('\n\n');

  try {
    const text = await aiGenerate(systemPrompt, userPrompt, {
      temperature: 0.3,
      maxOutputTokens: 1200,
      json: true,
      responseSchema: fixFormulaSchema,
      model,
    });
    return parseGeminiJson<{
      fixedFormula: string;
      platform: string;
      diagnosis: string;
      changes: string[];
      tips?: string[];
    }>(text || '{}');
  } catch (error) {
    console.error('Gemini API error:', error);
    throw new Error('公式修正失敗，請稍後再試');
  }
}

// Generate Google Apps Script
export async function generateAppsScript(
  prompt: string,
  context?: string,
  model?: ModelId
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
    const text = await aiGenerate(systemPrompt, userPrompt, {
      temperature: 0.3,
      maxOutputTokens: 1500,
      model,
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
  rows: any[][],
  model?: ModelId
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
    const text = await aiGenerate(systemPrompt, userPrompt, {
      temperature: 0.5,
      maxOutputTokens: 1000,
      json: true,
      responseSchema: reportInsightsSchema,
      model,
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

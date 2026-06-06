// AI 模型註冊：定義可用模型、適合功能與每次動作的點數成本

export type ModelId = 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-flash-latest';

export interface ModelConfig {
  id: ModelId;
  label: string;
  tagline: string;
  // 適合的功能說明
  goodFor: string[];
  // 速度 / 成本 / 推理 標籤
  speed: '極快' | '快' | '中等';
  cost: '最低' | '中低' | '較高';
  reasoning: '基本' | '良好' | '最強';
  // 每次 AI 動作消耗的點數
  costPerAction: number;
}

export const DEFAULT_MODEL: ModelId = 'gemini-2.5-flash';

export const MODELS: ModelConfig[] = [
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    tagline: '推薦 · 速度與分析品質平衡',
    goodFor: [
      '日常資料分析與報表摘要',
      '公式產生器（Excel / Google Sheets）',
      'Apps Script 程式碼產生',
      '單一到多個分頁的快速問答',
    ],
    speed: '快',
    cost: '中低',
    reasoning: '良好',
    costPerAction: 20,
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    tagline: '推理最強 · 深度跨分頁分析',
    goodFor: [
      '十幾個分頁的交叉比對與彙總',
      '財務 / 發票異常偵測與風險判讀',
      '複雜趨勢、預測與商業洞察',
      '需要嚴謹數字推理的進階分析',
    ],
    speed: '中等',
    cost: '較高',
    reasoning: '最強',
    costPerAction: 20,
  },
  {
    id: 'gemini-flash-latest',
    label: 'Gemini Flash (Latest)',
    tagline: '最省成本 · 最快回應',
    goodFor: [
      '簡單問答與快速試算',
      '小型單頁資料',
      '只需要重點摘要、不需深度推理時',
    ],
    speed: '極快',
    cost: '最低',
    reasoning: '基本',
    costPerAction: 20,
  },
];

const MODEL_IDS = new Set<ModelId>(MODELS.map((m) => m.id));

export function isValidModel(value: unknown): value is ModelId {
  return typeof value === 'string' && MODEL_IDS.has(value as ModelId);
}

export function resolveModel(value: unknown): ModelId {
  return isValidModel(value) ? value : DEFAULT_MODEL;
}

export function getModelConfig(id: ModelId): ModelConfig {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

// 動作類型（用於前端顯示，全部統一成本）
export type AiAction = 'analyze' | 'chat' | 'formula' | 'appsscript' | 'report';

export const ACTION_LABELS: Record<AiAction, string> = {
  analyze: '資料分析',
  chat: 'AI 問答',
  formula: '產生公式',
  appsscript: '產生 Apps Script',
  report: '報表洞察',
};

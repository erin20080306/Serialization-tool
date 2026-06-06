'use client';

import { DEFAULT_MODEL, isValidModel, type ModelId } from './models';

const STORAGE_KEY = 'sc_selected_model';

// 讀取使用者在設定頁選擇的模型（存在 localStorage）
export function getSelectedModel(): ModelId {
  if (typeof window === 'undefined') return DEFAULT_MODEL;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isValidModel(stored) ? stored : DEFAULT_MODEL;
}

export function setSelectedModel(model: ModelId): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, model);
}

export { STORAGE_KEY as SELECTED_MODEL_KEY };

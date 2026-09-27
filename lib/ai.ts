// 本系統自己的 AI 呼叫輔助（底層一律走 student-app 快照 lib/gemini.ts 的 generateWithRetry）

import { generateWithRetry } from './gemini'

const clean = (s?: string) => (s ?? '').replace(/[﻿​-‍ ]/g, '').trim()

export const hasGemini = () => clean(process.env.GEMINI_API_KEY).length > 0
/** 出題、評語用的模型（詳解另用 lib/solve.ts 的 SOLVE_MODEL） */
export const GEN_MODEL = clean(process.env.GEMINI_MODEL) || 'gemini-2.5-flash'

/**
 * 要求 JSON 輸出的生成。本專案 API route 的 maxDuration 是 60 秒，
 * 所以把 student-app 預設的 115s 單次逾時壓到 50s、總預算 55s。
 */
export function generateJSON(prompt: string, opts: { thinkingBudget?: number; temperature?: number } = {}): Promise<string> {
  return generateWithRetry([prompt], {
    model: GEN_MODEL,
    timeoutMs: 50000,
    totalBudgetMs: 55000,
    thinkingBudget: opts.thinkingBudget ?? 1024,
    generationConfig: { responseMimeType: 'application/json', temperature: opts.temperature ?? 0.9 },
  })
}

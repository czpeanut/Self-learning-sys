// Gemini 呼叫（精簡自 student-app lib/gemini.ts：重試 + 退避 + 逾時 + thinking 上限）
import { GoogleGenerativeAI } from '@google/generative-ai'

const clean = (s?: string) => (s ?? '').replace(/[﻿​-‍ ]/g, '').trim()

export const hasGemini = () => clean(process.env.GEMINI_API_KEY).length > 0
export const GEN_MODEL = clean(process.env.GEMINI_MODEL) || 'gemini-2.5-flash'

let _genAI: GoogleGenerativeAI | null = null
function genAI() {
  if (!_genAI) _genAI = new GoogleGenerativeAI(clean(process.env.GEMINI_API_KEY))
  return _genAI
}

const RETRYABLE = new Set([429, 500, 502, 503, 504])
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function statusOf(e: unknown): number | null {
  const anyE = e as { status?: number; message?: string }
  if (typeof anyE?.status === 'number') return anyE.status
  const m = /\[(\d{3})\b/.exec(anyE?.message ?? '')
  return m ? Number(m[1]) : null
}

/**
 * 產生文字（預設要求 JSON 輸出）。
 * thinkingBudget 一定要設上限：student-app 實測 2.5 系列不設限會思考到逾時。
 */
export async function generateText(prompt: string, opts: { json?: boolean; timeoutMs?: number; retries?: number; thinkingBudget?: number } = {}): Promise<string> {
  const { json = true, timeoutMs = 50000, retries = 1, thinkingBudget = 1024 } = opts
  const model = genAI().getGenerativeModel({
    model: GEN_MODEL,
    generationConfig: {
      temperature: 0.9,
      ...(json ? { responseMimeType: 'application/json' } : {}),
      thinkingConfig: { thinkingBudget },
    },
  } as Parameters<GoogleGenerativeAI['getGenerativeModel']>[0])

  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('AI 回應逾時')), timeoutMs) })
      const res = await Promise.race([model.generateContent(prompt), timeout])
      return res.response.text()
    } catch (e) {
      lastErr = e
      const st = statusOf(e)
      if (st === null || !RETRYABLE.has(st) || attempt === retries) break
      await sleep(800 * 2 ** attempt + Math.random() * 400)
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('AI 請求失敗')
}

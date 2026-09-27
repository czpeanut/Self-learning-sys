// ⚠️ 此檔為 czpeanut/student-app 的 lib/gemini.ts 快照（commit 59e1270），請勿單邊修改；student-app 更新時整份重新複製。
import { GoogleGenerativeAI } from '@google/generative-ai'

// 清掉環境變數可能混入的 BOM / 零寬字元 / 不換行空白 —
// 否則 Gemini SDK 把 key 放進 header 會丟 ByteString(>255) 錯誤
const clean = (s?: string) => (s ?? '').replace(/[﻿​-‍ ]/g, '').trim()

// 單例：避免每個請求都重建 client
let _genAI: GoogleGenerativeAI | null = null
export function getGenAI(): GoogleGenerativeAI {
  if (!_genAI) _genAI = new GoogleGenerativeAI(clean(process.env.GEMINI_API_KEY))
  return _genAI
}

// 錯誤分類：busy=Gemini 過載/限流（可請使用者稍後重試）；timeout=逾時；error=其他
export type GeminiErrorKind = 'busy' | 'timeout' | 'error'
export class GeminiError extends Error {
  kind: GeminiErrorKind
  constructor(kind: GeminiErrorKind, message: string) { super(message); this.kind = kind; this.name = 'GeminiError' }
}

// 從 SDK 錯誤取 HTTP 狀態碼（SDK 會丟帶 .status 的物件；保險再從訊息 "[429 ...]" 解析）
function statusOf(e: unknown): number | null {
  const anyE = e as { status?: number; message?: string }
  if (typeof anyE?.status === 'number') return anyE.status
  const m = /\[(\d{3})\b/.exec(anyE?.message ?? '')
  return m ? Number(m[1]) : null
}

// 可重試的狀態：429 限流、5xx 過載/暫時性錯誤
const RETRYABLE = new Set([429, 500, 502, 503, 504])
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

type Part = string | { inlineData: { data: string; mimeType: string } }

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new GeminiError('timeout', 'AI 回應逾時')), ms)
  })
  try { return await Promise.race([p, timeout]) }
  finally { clearTimeout(timer!) }
}

/**
 * 帶「重試 + 指數退避 + 單次逾時」的 Gemini 內容生成。
 * 這是抗「Gemini 塞車」的核心：過載(503)/限流(429)/暫時性 5xx 會自動退避重試，
 * 仍失敗則丟出已分類的 GeminiError，呼叫端據此回對應的 HTTP 狀態給前端。
 *
 * @returns 模型回應的純文字
 */
export async function generateWithRetry(
  parts: Part[],
  opts: { model?: string; retries?: number; timeoutMs?: number; totalBudgetMs?: number; thinkingBudget?: number | null; generationConfig?: object } = {},
): Promise<string> {
  // 逾時策略（重要，踩過坑）：
  //   withTimeout 只是「放棄等待」，**無法取消**已送出的 Gemini 請求——它仍會在對方完成並記為 200。
  //   舊版把逾時視為可重試，導致同一題被重送 2~3 次：每次 Gemini 都成功，我們卻全部丟掉，
  //   使用者等滿 ~124s 才看到 504，額度也白燒。
  //   現在：單次逾時放寬到 115s（涵蓋滿版考卷 40~90s 的正常生成），且**逾時不再重試**；
  //   只有 429/5xx 這種「確定失敗」才重試。totalBudgetMs 確保在 maxDuration(150s) 前自行收尾。
  //
  // ★ thinkingBudget（效能關鍵，實測數據）：
  //   Gemini 2.5 系列預設開啟「思考」且**不設上限**，這是 2026-08 線上大當機的真正原因。
  //   實測（真實帶圖數學題，正式環境同路徑）：
  //     不設限   → 119.7s、thinking 25601 tokens → 撞破逾時，線上完全解不出題
  //     上限1024 → 14.1~38.7s、finishReason=STOP（完整未截斷），答案正確
  //   注意：**maxOutputTokens 在 2.5 會把 thinking 一起計入**，若同時設小的輸出上限會造成
  //   詳解被攔腰截斷（實測 finish=MAX_TOKENS），比慢更糟，故此處不設輸出上限。
  const {
    model = 'gemini-2.5-flash', retries = 1,
    timeoutMs = 115000, totalBudgetMs = 130000,
    thinkingBudget = 1024, generationConfig,
  } = opts
  const deadline = Date.now() + totalBudgetMs
  const genCfg = {
    ...(thinkingBudget != null ? { thinkingConfig: { thinkingBudget } } : {}),
    ...(generationConfig ?? {}),
  }
  const gm = getGenAI().getGenerativeModel(
    { model, generationConfig: genCfg } as Parameters<GoogleGenerativeAI['getGenerativeModel']>[0],
  )

  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const remaining = deadline - Date.now()
    if (remaining <= 3000) break            // 預算用盡，別再開新請求
    const perAttempt = Math.min(timeoutMs, remaining)
    const t0 = Date.now()
    try {
      const result = await withTimeout(gm.generateContent(parts), perAttempt)
      // 記錄耗時（Vercel Runtime Logs 可看）：成功時的實際 Gemini 往返時間
      const resp = result.response as {
        usageMetadata?: { thoughtsTokenCount?: number; candidatesTokenCount?: number }
        candidates?: { finishReason?: string }[]
      }
      const um = resp.usageMetadata
      const finish = resp.candidates?.[0]?.finishReason
      // finish=MAX_TOKENS 代表回答被截斷（詳解會斷在半句），需警示
      console.log(`[gemini] ok model=${model} attempt=${attempt}/${retries} elapsedMs=${Date.now() - t0} thinkBudget=${thinkingBudget} thoughts=${um?.thoughtsTokenCount ?? 0} out=${um?.candidatesTokenCount ?? 0} finish=${finish}`)
      if (finish === 'MAX_TOKENS') console.warn('[gemini] WARN 回應被截斷（MAX_TOKENS），輸出可能不完整')
      return result.response.text()
    } catch (e) {
      lastErr = e
      const status = statusOf(e)
      const kind = e instanceof GeminiError ? e.kind : 'error'
      console.warn(`[gemini] fail model=${model} attempt=${attempt}/${retries} elapsedMs=${Date.now() - t0} timeoutMs=${perAttempt} status=${status} kind=${kind}`)
      const isTimeout = e instanceof GeminiError && e.kind === 'timeout'
      // 逾時「不重試」：請求很可能仍在 Gemini 端跑完，重送只會重複計費並讓使用者多等一輪。
      const retryable = !isTimeout && status !== null && RETRYABLE.has(status)
      if (!retryable || attempt === retries) break
      // 指數退避 + 抖動；限流(429)退避更久，避免一起回沖再次撞牆
      const base = status === 429 ? 1500 : 600
      const wait = base * 2 ** attempt + Math.random() * 400
      if (Date.now() + wait + 3000 > deadline) break   // 退避後已無時間，直接收尾
      await sleep(wait)
    }
  }

  // 分類丟出
  if (lastErr instanceof GeminiError && lastErr.kind === 'timeout') throw lastErr
  const status = statusOf(lastErr)
  if (status === 429 || status === 503 || status === 500 || status === 502 || status === 504) {
    throw new GeminiError('busy', 'AI 服務忙線中，請稍後再試')
  }
  throw new GeminiError('error', lastErr instanceof Error ? lastErr.message : 'Gemini 請求失敗')
}

/** 把 GeminiError 對應到 HTTP 回應（busy→503 可重試、timeout→504、其他→500） */
export function geminiErrorResponse(e: unknown): { status: number; body: { error: string; kind: GeminiErrorKind; retryable: boolean } } {
  if (e instanceof GeminiError) {
    if (e.kind === 'busy')    return { status: 503, body: { error: e.message, kind: 'busy', retryable: true } }
    if (e.kind === 'timeout') return { status: 504, body: { error: 'AI 回應逾時，請再試一次', kind: 'timeout', retryable: true } }
  }
  const msg = e instanceof Error ? e.message : 'AI 請求失敗'
  return { status: 500, body: { error: msg, kind: 'error', retryable: false } }
}

import { NextResponse } from 'next/server'
import { generateJSON, hasGemini } from '@/lib/ai'
import { safeJsonParse } from '@/lib/json'

export const maxDuration = 60

// 產生報告的「AI 老師評語」。輸入是前端算好的統計摘要（不含題目全文，省 token），
// 沒有 AI 時回 null，前端改顯示規則式評語。
export async function POST(req: Request) {
  if (!hasGemini()) return NextResponse.json({ comment: null })
  let body: { summary?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 }) }
  const summary = JSON.stringify(body.summary ?? {}).slice(0, 6000)

  const prompt = `你是一位溫暖但具體的台灣國中家教老師。以下是學生剛完成的一次自習練習統計（JSON）：
${summary}

請用繁體中文寫給學生的學習評語，輸出 JSON：
{"comment":"3–5 句總評：肯定進步、點出最需要加強的 1–2 個知識點與錯誤類型","actions":["具體的下一步建議，2–4 條，每條 30 字內"]}
不要編造統計中沒有的數據。`
  try {
    const raw = await generateJSON(prompt, { thinkingBudget: 512 })
    const parsed = safeJsonParse<{ comment?: string; actions?: string[] }>(raw)
    if (!parsed?.comment) return NextResponse.json({ comment: null })
    return NextResponse.json({ comment: parsed.comment, actions: (parsed.actions ?? []).slice(0, 4) })
  } catch (e) {
    console.warn('[report] AI 評語失敗', e)
    return NextResponse.json({ comment: null })
  }
}

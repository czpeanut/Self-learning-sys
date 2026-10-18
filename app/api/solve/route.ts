import { NextResponse } from 'next/server'
import { hasGemini } from '@/lib/ai'
import { generateWithRetry, geminiErrorResponse } from '@/lib/gemini'
import { clientKey, rateLimit } from '@/lib/rate-limit'
import { SOLVE_MODEL, SOLVE_THINKING_BUDGET, buildSolvePrompt, extractAnswer } from '@/lib/solve'
import { getChapters } from '@/lib/taxonomy'
import { buildFollowupPrompt } from '@/lib/tutor'
import { requireLogin } from '@/lib/server-auth'

export const runtime = 'nodejs'
export const maxDuration = 150   // 與 student-app 相同：詳解＋幾何圖需要較長時間

type Body = {
  action: 'solve' | 'followup'
  subject: string
  chapter: string
  question_text: string
  solution?: string
  history?: { q: string; a: string }[]
  doubt?: string
}

export async function POST(req: Request) {
  const denied = await requireLogin(req)
  if (denied) return NextResponse.json({ error: denied }, { status: 401 })
  if (!hasGemini()) return NextResponse.json({ error: '尚未設定 AI（GEMINI_API_KEY）' }, { status: 503 })

  let body: Body
  try { body = await req.json() } catch { return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 }) }
  const subject = String(body.subject ?? '')
  const chapter = String(body.chapter ?? '')
  const questionText = String(body.question_text ?? '').slice(0, 4000)
  // 章節可能是 taxonomy 的大單元，或段考模式的「七上 1-2 正負數的加減」
  if (getChapters(subject).length === 0 || !chapter.trim() || chapter.length > 80 || !questionText.trim()) {
    return NextResponse.json({ error: '題目資料不完整' }, { status: 400 })
  }

  // 每個來源：詳解 20 次／10 分鐘、追問 30 次／10 分鐘
  const key = `${clientKey(req)}:${body.action}`
  if (!rateLimit(key, body.action === 'solve' ? 20 : 30, 10 * 60000)) {
    return NextResponse.json({ error: '使用 AI 太頻繁了，先自己想一想，休息一下再試 🙂', kind: 'busy', retryable: true }, { status: 429 })
  }

  try {
    if (body.action === 'followup') {
      const doubt = String(body.doubt ?? '').trim().slice(0, 200)
      if (!doubt) return NextResponse.json({ error: '請說說哪裡不懂' }, { status: 400 })
      const prompt = buildFollowupPrompt({
        subject, chapter, questionText,
        solution: String(body.solution ?? '').slice(0, 6000),
        history: (body.history ?? []).slice(-3).map(h => ({ q: String(h.q).slice(0, 200), a: String(h.a).slice(0, 2000) })),
        doubt,
      })
      const reply = await generateWithRetry([prompt], { model: SOLVE_MODEL, thinkingBudget: 2048 })
      return NextResponse.json({ reply })
    }

    // 與 student-app 相同的解題提示詞與模型
    const solution = await generateWithRetry([buildSolvePrompt(subject, chapter, questionText)], { model: SOLVE_MODEL, thinkingBudget: SOLVE_THINKING_BUDGET })
    return NextResponse.json({ solution, answer: extractAnswer(solution) })
  } catch (e) {
    const { status, body: errBody } = geminiErrorResponse(e)
    return NextResponse.json(errBody, { status })
  }
}

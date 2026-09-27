'use client'

// 「問 AI」：無人館學生卡住時的求助入口。
//  1. AI 詳細解說：呼叫 /api/solve（student-app 同款提示詞與模型），詳解中的幾何圖由 SolutionView 畫出
//  2. 學生回報「看懂了／還是不懂」；不懂可以追問（最多 3 次），AI 針對卡住的那一步再解釋
//  3. 詳解快取在本機，同一題不重複花 AI 費用；AI 答案與題目答案不同時標記「題目可能有誤」

import { useEffect, useRef, useState } from 'react'
import SolutionView from './SolutionView'
import { answerLetter } from '@/lib/tutor'
import { getAsk, saveAsk } from '@/lib/storage'
import type { AskRecord, Question } from '@/lib/types'
import { useAIStatus } from '@/lib/use-ai-status'

const LETTERS = ['A', 'B', 'C', 'D']
const MAX_FOLLOWUPS = 3
const QUICK_DOUBTS = ['第一步是怎麼來的？', '為什麼要這樣算？', '可以用更簡單的例子說明嗎？', '這個觀念我沒學過']

/** 題幹＋選項組成純文字題目（題幹內的 figure 區塊保留，AI 可以讀座標） */
export function questionText(q: Question): string {
  return `${q.stem}\n${q.options.map((o, i) => `(${LETTERS[i]}) ${o}`).join('\n')}`
}

async function post(body: object): Promise<Record<string, unknown>> {
  const res = await fetch('/api/solve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'AI 暫時無法回應')
  return data
}

export default function AskAI({ q, autoOpen = false }: { q: Question; autoOpen?: boolean }) {
  const status = useAIStatus()
  const [rec, setRec] = useState<AskRecord | null>(null)
  const [loading, setLoading] = useState<'solve' | 'followup' | null>(null)
  const [error, setError] = useState<{ msg: string; retry: () => void } | null>(null)
  const [doubt, setDoubt] = useState('')
  const [asking, setAsking] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const started = useRef(false)

  useEffect(() => { setRec(getAsk(q.id)) }, [q.id])
  useEffect(() => {
    if (!loading) return
    setElapsed(0)
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [loading])

  const solve = async () => {
    setLoading('solve'); setError(null)
    try {
      const d = await post({ action: 'solve', subject: q.subject, chapter: q.chapter, question_text: questionText(q) })
      const aiAnswer = (d.answer as string | null) ?? null
      const letter = answerLetter(aiAnswer)
      setRec(saveAsk(q, { solution: String(d.solution ?? ''), aiAnswer, mismatch: letter !== null && letter !== q.answerIndex }))
    } catch (e) {
      setError({ msg: e instanceof Error ? e.message : 'AI 暫時無法回應', retry: solve })
    } finally { setLoading(null) }
  }

  // 自動展開（例如答錯時）只觸發一次，且只在沒有快取時才呼叫 AI
  useEffect(() => {
    if (!autoOpen || started.current || !status?.ai) return
    started.current = true
    if (!getAsk(q.id)?.solution) solve()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, status?.ai, q.id])

  const followup = async (text: string) => {
    if (!rec?.solution || !text.trim()) return
    setLoading('followup'); setError(null)
    try {
      const d = await post({
        action: 'followup', subject: q.subject, chapter: q.chapter, question_text: questionText(q),
        solution: rec.solution, history: rec.followups.map(f => ({ q: f.q, a: f.a })), doubt: text.trim(),
      })
      setRec(saveAsk(q, { followups: [...rec.followups, { q: text.trim(), a: String(d.reply ?? ''), at: Date.now() }], understood: null }))
      setDoubt(''); setAsking(false)
    } catch (e) {
      setError({ msg: e instanceof Error ? e.message : 'AI 暫時無法回應', retry: () => followup(text) })
    } finally { setLoading(null) }
  }

  const mark = (understood: boolean) => {
    setRec(saveAsk(q, { understood }))
    if (!understood) setAsking(true)
  }

  if (q.demo) return null
  if (status && !status.ai) {
    return <div className="rounded-xl bg-black/[.03] px-4 py-2 text-xs text-ink-muted">🤖 AI 詳解需要設定 GEMINI_API_KEY</div>
  }

  if (!rec?.solution) {
    return (
      <div className="space-y-2">
        <button className="btn-outline w-full" disabled={!!loading || !status} onClick={solve}>
          {loading ? `🤖 AI 正在解題並畫圖…（${elapsed} 秒，通常 15–40 秒）` : '🤖 看不懂？請 AI 一步一步講解（含圖）'}
        </button>
        {error && <ErrorLine msg={error.msg} onRetry={error.retry} />}
      </div>
    )
  }

  const canFollow = rec.followups.length < MAX_FOLLOWUPS
  return (
    <div className="space-y-3 rounded-xl border border-brand-500/20 bg-brand-50/40 p-4 text-sm">
      <div className="text-xs font-semibold text-brand-700">🤖 AI 詳細解說</div>
      {rec.mismatch && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          ⚠ AI 算出的答案（{rec.aiAnswer}）和本題標準答案（{LETTERS[q.answerIndex]}）不同，這題可能有誤，已記錄給館方檢查。請自己再驗算一次。
        </div>
      )}
      <div className="leading-relaxed"><SolutionView>{rec.solution}</SolutionView></div>

      {rec.followups.map((f, i) => (
        <div key={i} className="space-y-2 border-t border-black/5 pt-3">
          <div className="text-ink-soft">🙋 你問：{f.q}</div>
          <div className="leading-relaxed"><SolutionView>{f.a}</SolutionView></div>
        </div>
      ))}

      {loading === 'followup' && <div className="text-ink-muted">🤖 AI 思考中…（{elapsed} 秒）</div>}
      {error && <ErrorLine msg={error.msg} onRetry={error.retry} />}

      {!loading && (
        rec.understood === true ? (
          <div className="text-green-700">✓ 你說看懂了，太好了！</div>
        ) : asking || rec.understood === false ? (
          canFollow ? (
            <div className="space-y-2 border-t border-black/5 pt-3">
              <div className="font-medium">哪裡還不懂？說說看，AI 會針對那一步再講一次</div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_DOUBTS.map(t => <button key={t} className="chip border border-black/10 bg-white py-1 text-ink-soft hover:border-brand-500" onClick={() => followup(t)}>{t}</button>)}
              </div>
              <div className="flex gap-2">
                <input value={doubt} onChange={e => setDoubt(e.target.value)} maxLength={200} placeholder="例：第 2 步的 -5 為什麼變成 +5？"
                  onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); followup(doubt) } }}
                  className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-1.5 outline-none focus:border-brand-500" />
                <button className="btn-primary px-3 py-1.5" disabled={!doubt.trim()} onClick={() => followup(doubt)}>問 AI</button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
              這題已經排進錯題複習，過一天再回來試試看；家長日報也會提醒這題需要幫忙。
            </div>
          )
        ) : (
          <div className="flex flex-wrap items-center gap-2 border-t border-black/5 pt-3">
            <span className="text-ink-soft">看完了嗎？</span>
            <button className="btn-primary px-3 py-1.5" onClick={() => mark(true)}>✓ 看懂了</button>
            <button className="btn-outline px-3 py-1.5" onClick={() => mark(false)}>還是不懂</button>
          </div>
        )
      )}
    </div>
  )
}

function ErrorLine({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
      <span>{msg}</span>
      <button className="font-medium underline" onClick={onRetry}>重試</button>
    </div>
  )
}

// 專屬教材（伺服器端）：組教材（讀學生的題庫作答紀錄算準備度、上一輪診斷）、圖解觀念卡與步驟提示、AI 閱卷

import type { SupabaseClient } from '@supabase/supabase-js'
import { GEN_MODEL, hasGemini } from './ai'
import { BOOK_NAME } from './exam'
import { generateWithRetry } from './gemini'
import { safeJsonParse } from './json'
import { catalog, drawFromPool } from './pool'
import { type ConceptCard, VISUAL_SPEC, cleanCard, plainCard } from './concept'
import { prereqUnits } from './prereq'
import { computeReadiness } from './readiness'
import type { Attempt } from './types'
import {
  type Diagnosis, type ItemResult, LETTERS, type PrereqHit, type WorkbookItem,
  defaultSteps, judgeChoice, pickConcepts, toAttempts,
} from './workbook'

export const SUBJECT = '數學'
/** 每份教材本輪重點題上限、前置補強題上限（版面最多 15 頁） */
export const MAX_CORE = 36
export const MAX_PREREQ = 8

export type WorkbookRow = {
  id: string; code: string; student_id: string; subject: string; book: string; exam_seq: number; units: string[]; round: number
  items: WorkbookItem[]; layout: unknown; results: Record<string, ItemResult>; diagnosis: Diagnosis | null
  status: string; created_by: string | null; created_at: string; sent_at: string | null; graded_at: string | null
}

/** 學生在雲端的題庫作答紀錄（student_store 的 attempts/<月>）＋已閱卷專屬教材的作答 */
export async function studentAttempts(db: SupabaseClient, studentId: string): Promise<Attempt[]> {
  const { data: st } = await db.from('students').select('user_id').eq('id', studentId).maybeSingle()
  const out: Attempt[] = []
  if (st?.user_id) {
    const { data } = await db.from('student_store').select('value').eq('user_id', st.user_id).like('key', 'attempts/%')
    for (const r of data ?? []) if (Array.isArray(r.value)) out.push(...(r.value as Attempt[]))
  }
  const { data: wbs } = await db.from('workbooks').select('items, results').eq('student_id', studentId)
  const seen = new Set(out.map(a => `${a.qid}|${a.at}`))
  for (const w of wbs ?? []) for (const a of toAttempts(w.items as WorkbookItem[], (w.results ?? {}) as Record<string, ItemResult>)) {
    if (!seen.has(`${a.qid}|${a.at}`)) { out.push(a); seen.add(`${a.qid}|${a.at}`) }
  }
  return out.sort((a, b) => a.at - b.at)
}

/** 組一份教材的題目：前置補強（上一輪診斷）＋本輪重點（範圍內還沒熟練的題型，每題型一題） */
export function buildItems(input: { book: string; units: string[]; attempts: Attempt[]; diagnosis: Diagnosis | null; usedQids: Set<string> }): WorkbookItem[] {
  const cat = catalog(SUBJECT, input.book)
  if (!cat) throw new Error('找不到這一冊的題目池（目前只有數學）')
  const exclude = new Set([...Array.from(input.usedQids), ...input.attempts.map(a => a.qid)])
  const items: WorkbookItem[] = []

  // 前置補強：上一輪診斷出的題型，每個一題基礎題
  for (const h of (input.diagnosis ?? []).slice(0, MAX_PREREQ)) {
    const c = catalog(SUBJECT, h.book)
    const u = c?.units.find(x => x.code === h.unit)
    const t = u?.types.find(x => x.code === h.type)
    if (!c || !u || !t) continue
    const [q] = drawFromPool(SUBJECT, { book: h.book, unit: h.unit, type: h.type }, 1, 1, exclude)
    if (!q) continue
    exclude.add(q.id)
    items.push({
      no: 0, section: 'prereq', book: h.book, unit: h.unit, unitTitle: u.title, type: h.type, typeName: t.name, typeDesc: t.desc,
      qid: q.id, stem: q.stem, options: q.options, cite: q.cite ?? '', difficulty: 1, answer: q.answerIndex, steps: defaultSteps(1),
      reason: `第 ${h.from.join('、')} 題卡在這裡${h.why ? `：${h.why}` : ''}`,
    })
  }

  // 本輪重點：每個沒熟練的題型一題標準題
  const r = computeReadiness({ cat, units: input.units, attempts: input.attempts, daysLeft: 30 })
  for (const row of pickConcepts(r.rows, MAX_CORE)) {
    const [q] = drawFromPool(SUBJECT, { book: input.book, unit: row.unit, type: row.type }, 1, 2, exclude)
    if (!q) continue
    exclude.add(q.id)
    items.push({
      no: 0, section: 'core', book: input.book, unit: row.unit, unitTitle: row.unitTitle, type: row.type, typeName: row.name, typeDesc: row.desc,
      qid: q.id, stem: q.stem, options: q.options, cite: q.cite ?? '', difficulty: q.difficulty, answer: q.answerIndex, steps: defaultSteps(q.difficulty),
    })
  }
  return items.map((it, i) => ({ ...it, no: i + 1 }))
}

const examName = (book: string, seq: number) => `${BOOK_NAME[book] ?? book}第 ${seq} 次段考`
export const workbookTitle = (w: Pick<WorkbookRow, 'book' | 'exam_seq' | 'round'>) => `${examName(w.book, w.exam_seq)} · 第 ${w.round} 輪`

// ── 列印前準備：每個題型的圖解觀念卡（全館共用、存 concept_cards）＋每題的步驟提示 ──
const BATCH = 6
export const PREPARE_PER_CALL = 12
const cardKey = (it: Pick<WorkbookItem, 'book' | 'unit' | 'type'>) => `${it.book}:${it.unit}:${it.type}`

async function aiBatch(items: WorkbookItem[], needCard: Set<number>): Promise<Map<number, { card: ConceptCard | null; steps: string[] }>> {
  const prompt = `你是國中數學老師，要替學生的專屬紙本教材準備兩樣東西。

A. 觀念卡（只有標了「要觀念卡」的題才做）：講這個題型的核心觀念，要盡量圖形化。
   - title：觀念名稱，≤12 字
   - formula：關鍵公式或規則（LaTeX，不加 $），沒有可省略
   - points：2–3 條重點，每條 ≤28 字，數學式用 $…$；講觀念與常見錯誤，**不要解這一題、不可出現這一題的答案**
   - ${VISUAL_SPEC.replace(/\n/g, '\n     ')}
   - 圖解用一般化的例子（不要直接畫這一題的數字）；數值、座標要正確一致
B. 步驟提示（每題都做）：步驟式作答欄每一列的標題，2–4 個，每個 4–12 字，依這題的解法拆，不寫答案。基礎題 2 步、標準題 3 步、進階題 3–4 步。

只輸出 JSON：{"items":[{"no":1,"card":{"title":"…","formula":"…","points":["…"],"visual":{…}},"steps":["…","…"]}]}

題目：
${items.map(it => `第${it.no}題｜${needCard.has(it.no) ? '要觀念卡' : '不用觀念卡'}｜單元：${it.unit} ${it.unitTitle}｜題型：${it.typeName}（${it.typeDesc.slice(0, 60)}）｜${['', '基礎', '標準', '進階'][it.difficulty]}｜題目：${it.stem.slice(0, 260)}`).join('\n')}`
  const raw = await generateWithRetry([prompt], { model: GEN_MODEL, timeoutMs: 50000, totalBudgetMs: 54000, thinkingBudget: 1024, generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } })
  const d = safeJsonParse<{ items?: { no: number; card?: unknown; steps?: unknown }[] }>(raw)
  const out = new Map<number, { card: ConceptCard | null; steps: string[] }>()
  for (const x of d?.items ?? []) {
    const it = items.find(i => i.no === x.no)
    if (!it) continue
    const steps = (Array.isArray(x.steps) ? x.steps : []).filter((t): t is string => typeof t === 'string' && !!t.trim()).map(t => t.trim().slice(0, 16)).slice(0, 4)
    out.set(it.no, { card: needCard.has(it.no) ? cleanCard(x.card, it.typeName) : null, steps })
  }
  return out
}

/**
 * 準備還沒準備好的題目（每次最多 PREPARE_PER_CALL 題，避免超過 API 時限）：
 * 觀念卡先查快取 concept_cards，沒有才請 AI 畫；沒有 AI 就用題型說明＋預設步驟。回傳更新後的題目與剩下幾題。
 */
export async function prepareItems(db: SupabaseClient, items: WorkbookItem[]): Promise<{ items: WorkbookItem[]; remaining: number }> {
  const todo = items.filter(it => !it.prepared).slice(0, PREPARE_PER_CALL)
  if (!todo.length) return { items, remaining: 0 }
  const keys = Array.from(new Set(todo.map(cardKey)))
  const cache = new Map<string, ConceptCard>()
  const { data } = await db.from('concept_cards').select('key, card').in('key', keys)   // 資料表還沒建時 data 是 null，照樣往下
  for (const r of data ?? []) cache.set(r.key as string, r.card as ConceptCard)

  const done = new Map<number, { card: ConceptCard; steps: string[] }>()
  if (hasGemini()) {
    const batches: WorkbookItem[][] = []
    for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH))
    const results = await Promise.all(batches.map(b => {
      const need = new Set(b.filter(it => !cache.has(cardKey(it))).map(it => it.no))
      return aiBatch(b, need).catch(() => new Map<number, { card: ConceptCard | null; steps: string[] }>())
    }))
    const fresh: { key: string; card: ConceptCard }[] = []
    for (const m of results) for (const [no, r] of Array.from(m.entries())) {
      const it = todo.find(i => i.no === no)!
      const card = cache.get(cardKey(it)) ?? r.card
      if (r.card && !cache.has(cardKey(it))) { cache.set(cardKey(it), r.card); fresh.push({ key: cardKey(it), card: r.card }) }
      if (card) done.set(no, { card, steps: r.steps })
    }
    if (fresh.length) await db.from('concept_cards').upsert(fresh.map(f => ({ ...f, updated_at: new Date().toISOString() })), { onConflict: 'key' })
  }
  const next = items.map(it => {
    if (!todo.includes(it)) return it
    const r = done.get(it.no)
    const card = r?.card ?? cache.get(cardKey(it)) ?? plainCard(it.typeName, it.typeDesc)
    return { ...it, concept: card, steps: r && r.steps.length >= 2 ? r.steps : it.steps, prepared: true }
  })
  return { items: next, remaining: next.filter(it => !it.prepared).length }
}

// ── AI 閱卷 ──
export type ScanRegion = { no: number; image?: string; chosen: number | null }
type AIItem = { no: number; chosen?: string | null; steps?: { text?: string; ok?: boolean | null }[]; firstWrongStep?: number | null; note?: string; prereq?: { id?: string; why?: string }[] }

/** 前置觀念候選：這題單元的前置單元裡的所有題型（AI 只能從這裡挑） */
function prereqCandidates(items: WorkbookItem[]) {
  const table: (PrereqHit & { id: string })[] = []
  const byItem = new Map<number, string[]>()
  for (const it of items) {
    const ids: string[] = []
    for (const u of prereqUnits(it.book, it.unit)) {
      const unit = catalog(SUBJECT, u.book)?.units.find(x => x.code === u.unit)
      for (const t of unit?.types ?? []) {
        if (t.code === 'OTHER') continue
        let c = table.find(x => x.book === u.book && x.unit === u.unit && x.type === t.code)
        if (!c) { c = { id: `P${table.length + 1}`, book: u.book, unit: u.unit, type: t.code, typeName: `${BOOK_NAME[u.book]} ${u.unit} ${unit!.title}／${t.name}`, why: '' }; table.push(c) }
        ids.push(c.id)
      }
    }
    byItem.set(it.no, ids)
  }
  return { table, byItem }
}

/**
 * 閱卷：regions＝已裁切的作答區（有定位與版面時）；page＝整頁照片（找不到定位符時的備援）。
 * 劃記以影像判讀（chosen）為準，判讀不出來才用 AI 讀到的；對錯一律跟題庫答案比。
 */
export async function aiGrade(items: WorkbookItem[], input: { regions?: ScanRegion[]; page?: string }): Promise<Record<string, ItemResult>> {
  const now = Date.now()
  const targets = input.regions ? items.filter(it => input.regions!.some(r => r.no === it.no)) : items
  const omr = new Map((input.regions ?? []).map(r => [r.no, r.chosen]))
  let ai = new Map<number, AIItem>()
  const { table, byItem } = prereqCandidates(targets)

  if (hasGemini() && (input.page || input.regions?.some(r => r.image))) {
    const prompt = `你是國中數學閱卷老師。以下是學生在紙本講義上的手寫作答（步驟式作答欄＋選項劃記圈），請逐題判讀。
${input.page ? '這是一整頁的照片：每個作答區左上角印有「Q題號」，四角有定位角，請依題號找到對應的作答區；這頁沒有的題目不要輸出。' : '每張圖是一題的作答區，圖前面標了題號。'}

每題請做：
1. chosen：學生劃記或寫下的選項字母（A–D），看不出來填 null；有塗改時以最後明確的為準
2. steps：依作答欄每一列，簡短抄寫學生寫的內容（每步 ≤40 字，數學式照抄），並判斷這一步是否正確（ok：true／false；空白填 null）
3. firstWrongStep：第一個錯誤步驟的序號（從 1 起算）；全對或無法判斷填 null
4. note：一句短評，≤20 字，指出錯在哪（例：「移項沒有變號」）；全對填「步驟正確」
5. prereq：只有在答錯或步驟錯、而且錯誤明顯是「以前單元的觀念沒學會」時才填，最多 2 個，只能從該題的候選清單挑 id，why ≤16 字（例：「移項變號錯誤」）。只是粗心或本單元觀念錯就不要填

只輸出 JSON：{"items":[{"no":7,"chosen":"B","steps":[{"text":"…","ok":true}],"firstWrongStep":null,"note":"…","prereq":[{"id":"P3","why":"…"}]}]}

題目資料：
${targets.map(it => `第${it.no}題｜題目：${it.stem.slice(0, 400)}｜選項：${it.options.map((o, i) => `(${LETTERS[i]})${o}`).join(' ')}｜正解：(${LETTERS[it.answer]})｜作答欄：${it.steps.map((s, i) => `${i + 1}.${s}`).join('、')}${omr.get(it.no) != null ? `｜劃記判讀：(${LETTERS[omr.get(it.no)!]})` : ''}｜候選前置：${(byItem.get(it.no) ?? []).join(',') || '無'}`).join('\n')}

候選前置觀念：
${table.map(c => `${c.id}＝${c.typeName}`).join('\n') || '（無）'}`
    const parts: (string | { inlineData: { data: string; mimeType: string } })[] = [prompt]
    if (input.page) parts.push({ inlineData: { data: input.page, mimeType: 'image/jpeg' } })
    for (const r of input.regions ?? []) if (r.image) parts.push(`第${r.no}題作答區：`, { inlineData: { data: r.image, mimeType: 'image/jpeg' } })
    const raw = await generateWithRetry(parts, { model: GEN_MODEL, timeoutMs: 50000, totalBudgetMs: 55000, thinkingBudget: 2048, generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } })
    const d = safeJsonParse<{ items?: AIItem[] }>(raw)
    ai = new Map((d?.items ?? []).filter(x => Number.isInteger(x.no)).map(x => [x.no, x]))
  }

  const out: Record<string, ItemResult> = {}
  for (const it of targets) {
    const a = ai.get(it.no)
    if (!a && !omr.has(it.no)) continue                // 這張照片沒有這題
    const letter = typeof a?.chosen === 'string' ? LETTERS.indexOf(a.chosen.trim().toUpperCase().replace(/[()]/g, '')) : -1
    const chosen = omr.get(it.no) ?? (letter >= 0 && letter < it.options.length ? letter : null)
    const status = judgeChoice(it, chosen)
    const allowed = new Set(byItem.get(it.no) ?? [])
    const prereq = status === 'correct' && !a?.firstWrongStep ? [] : (a?.prereq ?? [])
      .filter(p => p.id && allowed.has(p.id)).slice(0, 2)
      .map(p => { const c = table.find(x => x.id === p.id)!; return { book: c.book, unit: c.unit, type: c.type, typeName: c.typeName, why: String(p.why ?? '').slice(0, 20) } })
    out[String(it.no)] = {
      status, chosen,
      steps: (a?.steps ?? []).slice(0, 6).map(s => ({ text: String(s.text ?? '').slice(0, 80), ok: typeof s.ok === 'boolean' ? s.ok : null })),
      firstWrongStep: Number.isInteger(a?.firstWrongStep) && a!.firstWrongStep! > 0 ? a!.firstWrongStep! : null,
      note: String(a?.note ?? (a ? '' : '只判讀劃記')).slice(0, 24),
      prereq, source: 'scan', at: now,
    }
  }
  return out
}

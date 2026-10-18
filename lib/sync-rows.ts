// ── 雲端同步：把本機紀錄拆成資料列、三方合併（純函式） ─────────────────
//
// 本機（localStorage）仍是所有畫面讀寫的地方（同步、離線可用）；雲端（Supabase student_store 表）
// 一列一筆：練習紀錄每次練習一列、錯題每題一列、題庫作答每月一列…… 作答時只上傳有變的那幾列，
// 不會每答一題就把整包紀錄重傳。
//
// 合併用「上次同步時的內容雜湊」(meta) 判斷誰改過：
//   兩邊一樣 → 不動；只有本機改 → 上傳；只有雲端改 → 用雲端；兩邊都改 → 練習紀錄取作答較多的，其他用雲端
//   只在本機：同步過（雲端被刪）→ 刪掉；沒同步過（新的）→ 上傳
//   只在雲端：同步過（本機刪了）→ 刪雲端；沒同步過 → 用雲端

export const SYNC_KEYS = ['profile', 'exam', 'activity', 'mastery', 'sessions', 'wrongbook', 'asks', 'studydays', 'attempts'] as const
export type SyncKey = typeof SYNC_KEYS[number]
export type Rows = Record<string, unknown>
/** 上次同步成功時各列內容的雜湊 */
export type Meta = Record<string, string>

type Obj = Record<string, unknown>
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : [])
const month = (t: unknown) => { const d = new Date(Number(t) || 0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

/** 每種紀錄怎麼拆列：回傳 id；null＝整包一列 */
const SPLIT: Record<SyncKey, ((x: Obj) => string) | null> = {
  profile: null,
  exam: null,
  activity: null,
  mastery: null,                                     // 物件：每個知識點一列（另外處理）
  sessions: x => String(x.id),
  wrongbook: x => String((x.question as Obj | undefined)?.id),
  asks: x => String(x.questionId),
  studydays: x => String(x.date),
  attempts: x => month(x.at),                        // 每月一列（一列是陣列）
}

export function splitRows(key: SyncKey, value: unknown): Rows {
  const out: Rows = {}
  if (value == null) return out
  if (key === 'mastery') {
    for (const [k, v] of Object.entries(value as Obj)) out[`mastery/${k}`] = v
    return out
  }
  const idOf = SPLIT[key]
  if (!idOf) { out[key] = value; return out }
  if (key === 'attempts') {
    for (const a of arr(value)) ((out[`attempts/${month(a.at)}`] ??= []) as Obj[]).push(a)
    return out
  }
  for (const x of arr(value)) out[`${key}/${idOf(x)}`] = x
  return out
}

/** 把資料列組回 storage 用的形狀（沒有任何列 → null，代表本機也不要有） */
export function joinRows(key: SyncKey, rows: Rows): unknown {
  const entries = Object.entries(rows).filter(([k]) => k === key || k.startsWith(`${key}/`))
  if (entries.length === 0) return null
  if (key === 'mastery') return Object.fromEntries(entries.map(([k, v]) => [k.slice('mastery/'.length), v]))
  if (!SPLIT[key]) return entries.find(([k]) => k === key)?.[1] ?? null
  const num = (x: Obj, f: string) => Number(x[f]) || 0
  if (key === 'attempts') return entries.flatMap(([, v]) => arr(v)).sort((a, b) => num(a, 'at') - num(b, 'at'))
  const list = entries.map(([, v]) => v as Obj)
  if (key === 'wrongbook') return list.sort((a, b) => num(a, 'lastWrongAt') - num(b, 'lastWrongAt'))
  if (key === 'asks') return list.sort((a, b) => num(a, 'createdAt') - num(b, 'createdAt'))
  if (key === 'sessions') return list.sort((a, b) => num(a, 'createdAt') - num(b, 'createdAt'))
  return list.sort((a, b) => String(a.date).localeCompare(String(b.date)))
}

/** 內容雜湊（djb2，只用來判斷有沒有變） */
export function hashOf(v: unknown): string {
  const s = JSON.stringify(v) ?? ''
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return `${(h >>> 0).toString(36)}:${s.length}`
}

/** 兩邊都改過同一列時：練習紀錄取作答較多（較完整）的那份，其他以雲端為準 */
function bothChanged(rowKey: string, local: unknown, remote: unknown): unknown {
  if (rowKey.startsWith('sessions/')) {
    const n = (s: unknown) => arr((s as Obj).rounds).reduce((t, r) => t + arr(r.answers).length, 0)
    return n(local) > n(remote) ? local : remote
  }
  if (rowKey.startsWith('attempts/')) {
    // 題庫作答只會新增：兩邊聯集
    const seen = new Set<string>()
    return [...arr(remote), ...arr(local)].filter(a => { const k = `${a.qid}|${a.at}`; if (seen.has(k)) return false; seen.add(k); return true })
      .sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0))
  }
  return remote
}

export type Reconciled = {
  /** 合併後本機該有的所有列 */
  rows: Rows
  /** 要上傳（新增或更新）的列 */
  upload: string[]
  /** 要從雲端刪掉的列 */
  remove: string[]
  /** 新的 meta（假設上傳／刪除都成功） */
  meta: Meta
}

export function reconcile(local: Rows, remote: Rows, meta: Meta): Reconciled {
  const rows: Rows = {}
  const upload: string[] = []
  const remove: string[] = []
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)])
  for (const k of Array.from(keys)) {
    const inL = k in local, inR = k in remote
    const synced = meta[k]
    if (inL && inR) {
      const hl = hashOf(local[k]), hr = hashOf(remote[k])
      if (hl === hr) { rows[k] = remote[k]; continue }
      const lChanged = hl !== synced, rChanged = hr !== synced
      const v = lChanged && !rChanged ? local[k] : !lChanged && rChanged ? remote[k] : bothChanged(k, local[k], remote[k])
      rows[k] = v
      if (hashOf(v) !== hr) upload.push(k)
    } else if (inL) {
      if (synced && hashOf(local[k]) === synced) continue          // 雲端刪了，本機沒改 → 刪
      rows[k] = local[k]; upload.push(k)                          // 新的（或刪了又改過）→ 上傳
    } else {
      if (synced && hashOf(remote[k]) === synced) { remove.push(k); continue }   // 本機刪了 → 刪雲端
      rows[k] = remote[k]
    }
  }
  const next: Meta = {}
  for (const [k, v] of Object.entries(rows)) next[k] = hashOf(v)
  return { rows, upload, remove, meta: next }
}

/** 本機寫入後：和上次同步比，哪些列要上傳、哪些要刪（不需要讀雲端） */
export function diffLocal(key: SyncKey, value: unknown, meta: Meta): { upload: Rows; remove: string[] } {
  const rows = splitRows(key, value)
  const upload: Rows = {}
  for (const [k, v] of Object.entries(rows)) if (hashOf(v) !== meta[k]) upload[k] = v
  const remove = Object.keys(meta).filter(k => (k === key || k.startsWith(`${key}/`)) && !(k in rows))
  return { upload, remove }
}

'use client'

// ── 雲端紀錄同步（Supabase student_store 表） ───────────────────────
// 登入時：下載雲端紀錄、和這台裝置的快取合併（lib/sync-rows.ts）→ 畫面才開始。
// 之後：每次 storage 寫入 → 3 秒後只上傳有變的資料列；離線或失敗會保留，連上線再補傳。
// 登出時：先把還沒上傳的傳完，再清掉這台裝置上的快取（共用平板，不留給下一位）。

import { readKey, setWriteListener, writeKeySilently } from './storage'
import { supabase } from './supabase'
import { type Meta, type Rows, type SyncKey, SYNC_KEYS, diffLocal, hashOf, joinRows, reconcile, splitRows } from './sync-rows'

const TABLE = 'student_store'
const META = '__sync_meta'
const DELAY_MS = 3000
const RETRY_MS = 30000
const CHUNK = 40

export type SyncStatus = 'idle' | 'syncing' | 'offline'
let status: SyncStatus = 'idle'
const subs = new Set<(s: SyncStatus) => void>()
const setStatus = (s: SyncStatus) => { status = s; subs.forEach(f => f(s)) }
export const getSyncStatus = () => status
export function onSyncStatus(fn: (s: SyncStatus) => void) { subs.add(fn); return () => { subs.delete(fn) } }

let uid: string | null = null
let meta: Meta = {}
const pending = new Set<SyncKey>()
let timer: ReturnType<typeof setTimeout> | null = null
let inflight: Promise<boolean> | null = null

const isSyncKey = (k: string): k is SyncKey => (SYNC_KEYS as readonly string[]).includes(k)
const saveMeta = () => writeKeySilently(META, meta)

async function pushRows(upload: Rows, remove: string[]): Promise<boolean> {
  if (!supabase || !uid) return false
  const entries = Object.entries(upload)
  for (let i = 0; i < entries.length; i += CHUNK) {
    const part = entries.slice(i, i + CHUNK)
    const { error } = await supabase.from(TABLE).upsert(part.map(([key, value]) => ({ user_id: uid, key, value })), { onConflict: 'user_id,key' })
    if (error) throw new Error(error.message)
    for (const [k, v] of part) meta[k] = hashOf(v)
    saveMeta()
  }
  for (let i = 0; i < remove.length; i += CHUNK) {
    const part = remove.slice(i, i + CHUNK)
    const { error } = await supabase.from(TABLE).delete().eq('user_id', uid).in('key', part)
    if (error) throw new Error(error.message)
    for (const k of part) delete meta[k]
    saveMeta()
  }
  return true
}

/** 登入後呼叫：下載＋合併＋補傳。失敗（離線）時仍用本機快取繼續，之後再補傳 */
export async function startSync(userId: string): Promise<{ ok: boolean; error?: string }> {
  uid = userId
  meta = (readKey(META) as Meta | null) ?? {}
  setWriteListener(k => { if (isSyncKey(k)) { pending.add(k); schedule(DELAY_MS) } })
  if (!supabase) return { ok: false, error: '未設定 Supabase' }
  setStatus('syncing')
  try {
    const remote: Rows = {}
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(TABLE).select('key, value').eq('user_id', userId).range(from, from + 999)
      if (error) throw new Error(error.message)
      for (const r of data ?? []) remote[r.key as string] = r.value
      if (!data || data.length < 1000) break
    }
    const local: Rows = {}
    for (const k of SYNC_KEYS) Object.assign(local, splitRows(k, readKey(k)))
    const r = reconcile(local, remote, meta)
    for (const k of SYNC_KEYS) writeKeySilently(k, joinRows(k, r.rows))
    // 兩邊一致的列直接記為已同步；要上傳／刪除的等成功後才記
    for (const [k, h] of Object.entries(r.meta)) if (!r.upload.includes(k)) meta[k] = h
    for (const k of Object.keys(meta)) if (!(k in r.rows) && !r.remove.includes(k)) delete meta[k]
    saveMeta()
    await pushRows(Object.fromEntries(r.upload.map(k => [k, r.rows[k]])), r.remove)
    setStatus('idle')
    return { ok: true }
  } catch (e) {
    // 離線：本機快取照用；所有紀錄種類排入待上傳，連線後補
    SYNC_KEYS.forEach(k => pending.add(k))
    setStatus('offline')
    schedule(RETRY_MS)
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function schedule(ms: number) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; void flush() }, ms)
}

/** 立刻上傳還沒上傳的紀錄；回傳是否全部成功 */
export function flush(): Promise<boolean> {
  if (inflight) return inflight.then(() => flush())
  if (!uid || pending.size === 0) return Promise.resolve(true)
  inflight = (async () => {
    const keys = Array.from(pending)
    pending.clear()
    const upload: Rows = {}
    const remove: string[] = []
    for (const k of keys) {
      const d = diffLocal(k, readKey(k), meta)
      Object.assign(upload, d.upload)
      remove.push(...d.remove)
    }
    try {
      setStatus('syncing')
      await pushRows(upload, remove)
      setStatus('idle')
      return true
    } catch {
      keys.forEach(k => pending.add(k))
      setStatus('offline')
      schedule(RETRY_MS)
      return false
    }
  })().finally(() => { inflight = null })
  return inflight
}

/** 登出：傳完未上傳的紀錄，成功才清掉本機快取（失敗就留著，下次登入再補傳） */
export async function stopSync(): Promise<boolean> {
  if (timer) { clearTimeout(timer); timer = null }
  const ok = uid ? await flush() : true
  setWriteListener(null)
  if (ok && uid) for (const k of [...SYNC_KEYS, META]) writeKeySilently(k, null)
  uid = null
  meta = {}
  setStatus('idle')
  return ok
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (uid && pending.size) void flush() })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && uid) void flush() })
}

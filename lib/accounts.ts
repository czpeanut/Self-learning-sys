'use client'

// ── 學生帳號（姓名＋4 位數密碼） ─────────────────────────────────
// 無人館的平板多人共用：每位學生的紀錄分開存（lib/storage.ts 依目前登入者切換命名空間）。
// ⚠️ 裝置帳號模式（沒設定 Supabase 時）：帳號存在這台裝置，密碼只防止同學誤用彼此的紀錄，不是真正的安全機制。
//    設定 Supabase 後改用雲端帳號（館方發的帳號＋密碼，見 docs/AUTH.md），這裡只記「目前是誰」。

export type Account = { id: string; name: string; salt: string; pinHash: string; createdAt: number; lastLoginAt: number }

const ACCOUNTS = 'sls:accounts'
const CURRENT = 'sls:current'
const LEGACY = 'sls:v1:'
/** 閒置自動登出（無人館：學生走了沒登出，下一位不會看到他的紀錄） */
export const IDLE_LOGOUT_MS = 20 * 60000

const readJSON = <T,>(k: string, fb: T): T => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) as T : fb } catch { return fb } }
const writeJSON = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* 空間不足等 */ } }

export const listAccounts = () => readJSON<Account[]>(ACCOUNTS, []).sort((a, b) => b.lastLoginAt - a.lastLoginAt)
const norm = (name: string) => name.trim().replace(/\s+/g, ' ')

async function hash(salt: string, pin: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

type Current = { id: string; at: number; cloud?: boolean; name?: string; username?: string }
/** 目前登入者：雲端帳號（Supabase user id）或裝置帳號；storage 依 id 切換命名空間 */
export type CurrentUser = { id: string; name: string; cloud: boolean; username?: string }

export function currentUser(): CurrentUser | null {
  const cur = readJSON<Current | null>(CURRENT, null)
  if (!cur) return null
  if (cur.cloud) return { id: cur.id, name: cur.name ?? '', cloud: true, username: cur.username }
  const acc = listAccounts().find(a => a.id === cur.id)
  return acc ? { id: acc.id, name: acc.name, cloud: false } : null
}
/** 雲端登入成功後記下目前是誰（lib/cloud-sync.ts 會先把紀錄下載到這個命名空間） */
export function setCloudUser(id: string, name: string, username?: string) {
  writeJSON(CURRENT, { id, at: Date.now(), cloud: true, name, username } satisfies Current)
}

export function touch() {
  const cur = readJSON<{ id: string; at: number } | null>(CURRENT, null)
  if (cur) writeJSON(CURRENT, { ...cur, at: Date.now() })
}
/** 距離上次操作多久（沒有登入者 → Infinity） */
export function idleFor(): number {
  const cur = readJSON<{ at: number } | null>(CURRENT, null)
  return cur ? Date.now() - cur.at : Infinity
}
/** 超過閒置時間就登出；回傳是否已登出 */
export function expireIfIdle(): boolean {
  const cur = readJSON<{ id: string; at: number } | null>(CURRENT, null)
  if (cur && Date.now() - cur.at > IDLE_LOGOUT_MS) { logout(); return true }
  return false
}

export function logout() { try { localStorage.removeItem(CURRENT) } catch { /* 忽略 */ } }

export type LoginResult = { ok: true; account: Account; created: boolean } | { ok: false; error: string }

/** 登入；名字不存在時建立新帳號（第一位學生會接收這台裝置在登入功能之前的紀錄） */
export async function login(nameRaw: string, pin: string, allowCreate: boolean): Promise<LoginResult> {
  const name = norm(nameRaw)
  if (!name) return { ok: false, error: '請輸入名字' }
  if (!/^\d{4}$/.test(pin)) return { ok: false, error: '密碼是 4 位數字' }
  const all = readJSON<Account[]>(ACCOUNTS, [])
  const hit = all.find(a => a.name.toLowerCase() === name.toLowerCase())
  if (hit) {
    if ((await hash(hit.salt, pin)) !== hit.pinHash) return { ok: false, error: '密碼不對' }
    hit.lastLoginAt = Date.now()
    writeJSON(ACCOUNTS, all)
    writeJSON(CURRENT, { id: hit.id, at: Date.now() })
    return { ok: true, account: hit, created: false }
  }
  if (!allowCreate) return { ok: false, error: '找不到這個名字' }
  const salt = Math.random().toString(36).slice(2, 10)
  const acc: Account = { id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36), name, salt, pinHash: await hash(salt, pin), createdAt: Date.now(), lastLoginAt: Date.now() }
  if (all.length === 0) adoptLegacy(acc.id)
  writeJSON(ACCOUNTS, [...all, acc])
  writeJSON(CURRENT, { id: acc.id, at: Date.now() })
  return { ok: true, account: acc, created: true }
}

/** 登入功能上線前的紀錄（沒有分學生）→ 搬給這台裝置的第一位學生 */
function adoptLegacy(id: string) {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(LEGACY) && !k.startsWith(`${LEGACY}u:`)) keys.push(k)
    }
    for (const k of keys) {
      localStorage.setItem(`${LEGACY}u:${id}:${k.slice(LEGACY.length)}`, localStorage.getItem(k) ?? '')
      localStorage.removeItem(k)
    }
  } catch { /* 忽略 */ }
}

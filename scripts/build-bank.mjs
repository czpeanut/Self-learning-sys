#!/usr/bin/env node
// 從 OLE-QS 官方匯出檔（data/export/，見 OLE-QS docs/USING_THE_BANK.md）產生：
//   data/pool/數學-<冊>.json      題目池＋題型目錄＋題型段考頻率（不進版控：題目只供內部教學使用，本 repo 是公開的）
//   lib/data/exam-scopes.json     各次段考的單元出現率（只有統計數字，不含題目，進版控）
//
// 用法：
//   node scripts/build-bank.mjs                    # 自動找匯出檔：$OLEQS_EXPORT → ../OLE-QS/data/export → 從 GitHub 下載
//   node scripts/build-bank.mjs --export <資料夾>
//   node scripts/build-bank.mjs --if-missing       # 題目池已存在就跳過（npm prebuild 用，部署時自動建置）
//
// 只讀 OLE-QS，不寫回。題目收錄條件：
//   - status == reviewed、單選（type single、format choice）
//   - 答案可靠：原卷答案卷（answer_key_vlm、source_answer_key）或兩個模型獨立作答一致（ai:gemini+qwen）
//     —— OLE-QS 文件建議自動計分只用這幾種；不收多數決（ai:majority）、單一模型、有疑義、沒有答案
//   - 純文字：沒有題幹圖、選項圖、題組（題組要整組出，目前不支援）、共用素材；題幹寫「如圖」的也排除
//   - 題幹＋選項完全相同的只留一題（各校互相改編，匯出檔沒有去重）

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import readline from 'node:readline'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const POOL_DIR = path.join(ROOT, 'data', 'pool')
const SCOPES = path.join(ROOT, 'lib', 'data', 'exam-scopes.json')
const CACHE = path.join(ROOT, '.cache', 'oleqs-export')
const RAW = 'https://raw.githubusercontent.com/czpeanut/OLE-QS/main/data/export'
const FILES = ['manifest.json', 'questions.jsonl.gz', 'taxonomy/math_patterns.json']

const RELIABLE = new Set(['answer_key_vlm', 'source_answer_key', 'ai:gemini+qwen'])
const FIGURE_WORDS = /如圖|下圖|右圖|左圖|附圖|上圖|圖中|圖\s*[(（]?[一二三四五六七八九十\d]/
const BOOK = { '7-1': '七上', '7-2': '七下', '8-1': '八上', '8-2': '八下', '9-1': '九上', '9-2': '九下' }
const MERGED = new Set(['數學', '自然'])   // 各版本節次對齊，合併統計
const OTHER = 'OTHER'

const args = process.argv.slice(2)
const argVal = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined }

async function locateExport() {
  const cand = [argVal('--export'), process.env.OLEQS_EXPORT, path.join(ROOT, '..', 'OLE-QS', 'data', 'export'), CACHE].filter(Boolean)
  for (const d of cand) if (FILES.every(f => fs.existsSync(path.join(d, f)))) return d
  console.log(`找不到 OLE-QS 匯出檔，從 GitHub 下載到 ${path.relative(ROOT, CACHE)}/ …`)
  for (const f of FILES) {
    const res = await fetch(`${RAW}/${f}`)
    if (!res.ok) throw new Error(`下載 ${f} 失敗：HTTP ${res.status}`)
    fs.mkdirSync(path.dirname(path.join(CACHE, f)), { recursive: true })
    fs.writeFileSync(path.join(CACHE, f), Buffer.from(await res.arrayBuffer()))
  }
  return CACHE
}

async function* readQuestions(dir) {
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(dir, 'questions.jsonl.gz')).pipe(zlib.createGunzip()), crlfDelay: Infinity })
  for await (const line of rl) if (line.trim()) yield JSON.parse(line)
}

// 國文「第十二課」等用中文數字排序
const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
function cnNum(t) {
  if (t.includes('十')) { const [a, b] = t.split('十'); return (a ? CN[a] ?? 1 : 1) * 10 + (b ? CN[b] ?? 0 : 0) }
  return CN[t] ?? 0
}
function unitSortKey(code) {
  const m = code.match(/^第([一二三四五六七八九十]+)課/)
  if (m) return [1, cnNum(m[1]), code]
  if (/^[\d-]+$/.test(code)) return [0, ...code.split('-').map(Number)]
  return [2, code]
}
const cmpKey = (a, b) => {
  const x = unitSortKey(a), y = unitSortKey(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === y[i]) continue
    if (x[i] === undefined) return -1
    if (y[i] === undefined) return 1
    return typeof x[i] === 'number' && typeof y[i] === 'number' ? x[i] - y[i] : String(x[i]).localeCompare(String(y[i]))
  }
  return 0
}

async function main() {
  if (args.includes('--if-missing') && fs.existsSync(POOL_DIR) && fs.readdirSync(POOL_DIR).some(f => f.endsWith('.json'))) {
    console.log('題目池已存在，略過（要重建請直接執行 node scripts/build-bank.mjs）')
    return
  }
  const dir = await locateExport()
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
  const patterns = JSON.parse(fs.readFileSync(path.join(dir, 'taxonomy/math_patterns.json'), 'utf8'))
  console.log(`OLE-QS 匯出檔：${manifest.exported_at}，${manifest.questions} 題`)

  // ── 單元出現率（全部科目） ──
  const papers = new Map()            // paper_id → { subject, sub, grade, sem, seq, units: Map(unitKey→n), pubs: Map }
  const unitTitle = new Map()         // subject|grade|sem|pub|sub|code → [title, chapter]
  // ── 數學題型頻率與題目池 ──
  const mathDocs = new Map()          // slot → Set(paper_id)
  const typeCount = new Map()         // slot → Map('unit:type' → n)
  const pool = new Map()              // book → []
  const seen = new Set()
  const skipped = new Map()
  const skip = why => skipped.set(why, (skipped.get(why) ?? 0) + 1)

  for await (const q of readQuestions(dir)) {
    if (q.status === 'rejected') continue
    const sub = q.sub_subject ?? ''
    let p = papers.get(q.paper_id)
    if (!p) { p = { subject: q.subject, sub: new Set(), grade: q.grade, sem: q.semester, seq: q.exam_seq, units: new Map(), pubs: new Map(), total: 0 }; papers.set(q.paper_id, p) }
    if (q.unit?.code) {
      const key = `${sub}|${q.unit.code}`
      p.units.set(key, (p.units.get(key) ?? 0) + 1)
      p.pubs.set(q.unit.publisher ?? '', (p.pubs.get(q.unit.publisher ?? '') ?? 0) + 1)
      p.total++
      const tk = `${q.subject}|${q.grade}|${q.semester}|${q.unit.publisher ?? ''}|${key}`
      if (!unitTitle.has(tk)) unitTitle.set(tk, [q.unit.title ?? '', q.unit.chapter ?? ''])
    }
    if (q.subject !== '數學') continue

    const book = `${q.grade}-${q.semester}`
    const slot = `${book}-${q.exam_seq}`
    if (!mathDocs.has(slot)) mathDocs.set(slot, new Set())
    mathDocs.get(slot).add(q.paper_id)
    const unit = q.unit?.code
    const type = q.pattern?.key ? q.pattern.key.split(':')[1] : OTHER
    if (unit) {
      if (!typeCount.has(slot)) typeCount.set(slot, new Map())
      const m = typeCount.get(slot)
      m.set(`${unit}:${type}`, (m.get(`${unit}:${type}`) ?? 0) + 1)
    }

    if (!unit || !patterns[`${book}_${unit}`]) { skip('沒有單元或單元沒有題型目錄'); continue }
    if (q.type !== 'single' || q.format !== 'choice') { skip('不是單選題'); continue }
    if (!RELIABLE.has(q.answer_source)) { skip('答案不夠可靠或沒有答案'); continue }
    const stem = (q.stem ?? '').trim()
    if (q.images?.length || q.shared_images?.length || q.group_id || q.group_stem || q.shared_text
        || (q.options ?? []).some(o => o.image) || FIGURE_WORDS.test(stem)) { skip('需要附圖或屬於題組'); continue }
    const opts = q.options ?? []
    const labels = opts.map(o => String(o.label ?? '').trim())
    if (!Array.isArray(q.answer) || q.answer.length !== 1 || !labels.includes(String(q.answer[0]).trim()) || opts.length < 2 || opts.length > 5) {
      skip('答案對不上選項'); continue
    }
    const h = crypto.createHash('sha1').update([stem, ...opts.map(o => o.text ?? '')].map(s => s.replace(/\s+/g, '')).join('\x1f')).digest('hex')
    if (seen.has(h)) { skip('重複題'); continue }
    seen.add(h)
    if (!pool.has(book)) pool.set(book, [])
    pool.get(book).push({
      id: q.id, unit, type, difficulty: q.difficulty ?? null, stem,
      options: opts.map(o => String(o.text ?? '').trim()),
      answer: labels.indexOf(String(q.answer[0]).trim()),
      answerStatus: q.answer_source === 'ai:gemini+qwen' ? 'ai_generated' : 'verified',
      cite: `[${[q.city, q.school_short, q.year].filter(Boolean).join(' ')}]`,
    })
  }

  // ── 寫題目池 ──
  fs.mkdirSync(POOL_DIR, { recursive: true })
  let total = 0
  for (const [book, qs] of [...pool.entries()].sort()) {
    const n = new Map()
    for (const q of qs) n.set(`${q.unit}:${q.type}`, (n.get(`${q.unit}:${q.type}`) ?? 0) + 1)
    const units = Object.entries(patterns).filter(([k]) => k.startsWith(book + '_'))
      .sort(([a], [b]) => cmpKey(a.split('_')[1], b.split('_')[1]))
      .map(([k, v]) => {
        const code = k.split('_')[1]
        const types = (v.types ?? []).map(t => ({ code: t.code, name: t.name, desc: t.desc ?? '', n: n.get(`${code}:${t.code}`) ?? 0 }))
        if (n.get(`${code}:${OTHER}`)) types.push({ code: OTHER, name: '其他題型', desc: '題型目錄歸不進去的題目', n: n.get(`${code}:${OTHER}`) })
        return { code, title: v.title, types }
      })
    const freq = {}
    for (const seq of ['1', '2', '3']) {
      const slot = `${book}-${seq}`
      const docs = mathDocs.get(slot)?.size ?? 0
      if (!docs) continue
      const per = {}
      for (const [k, c] of typeCount.get(slot) ?? []) per[k] = Math.round((c / docs) * 1000) / 1000
      freq[seq] = { docs, perPaper: per }
    }
    qs.sort((a, b) => cmpKey(a.unit, b.unit) || a.type.localeCompare(b.type) || a.id.localeCompare(b.id))
    const out = { source: `czpeanut/OLE-QS data/export @ ${manifest.exported_at}`, builtAt: new Date().toISOString(),
      subject: '數學', book, bookName: BOOK[book] ?? book, units, freq, questions: qs }
    fs.writeFileSync(path.join(POOL_DIR, `數學-${book}.json`), JSON.stringify(out))
    total += qs.length
    console.log(`  ${BOOK[book]}：${qs.length} 題、${units.length} 單元、${units.reduce((s, u) => s + u.types.length, 0)} 題型`)
  }
  console.log(`題目池共 ${total} 題 → ${path.relative(ROOT, POOL_DIR)}/`)
  for (const [k, v] of [...skipped.entries()].sort((a, b) => b[1] - a[1])) console.log(`  排除 ${v} 題：${k}`)

  // ── 寫單元出現率 ──
  const slots = new Map()   // key → pub → [Set(unitKey)]
  for (const p of papers.values()) {
    if (p.total < 5 || !p.seq) continue
    // 一份卷某單元只 1 題且不到 5% → 視為雜訊（歸類誤差或複習題）
    const units = [...p.units.entries()].filter(([, c]) => c >= 2 || c / p.total >= 0.05).map(([k]) => k)
    const pub = MERGED.has(p.subject) ? '*' : ([...p.pubs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '不確定')
    for (const sub of new Set(units.map(k => k.split('|')[0]))) {
      const key = `${p.subject}|${sub}|${p.grade}|${p.sem}|${p.seq}`
      if (!slots.has(key)) slots.set(key, new Map())
      const own = units.filter(k => k.startsWith(sub + '|'))
      for (const pb of MERGED.has(p.subject) ? ['*'] : [pub, '*']) {
        if (!slots.get(key).has(pb)) slots.get(key).set(pb, [])
        slots.get(key).get(pb).push(new Set(own))
      }
    }
  }
  const outSlots = {}
  for (const [key, byPub] of [...slots.entries()].sort()) {
    const [subject, , grade, sem] = key.split('|')
    for (const [pub, docs] of byPub) {
      if (docs.length < 3) continue
      const cnt = new Map()
      for (const d of docs) for (const k of d) cnt.set(k, (cnt.get(k) ?? 0) + 1)
      const units = [...cnt.entries()].filter(([, c]) => c / docs.length >= 0.1).map(([k, c]) => {
        const [sub, code] = k.split('|')
        const t = [pub, '翰林', '康軒', '南一', ''].map(pb => unitTitle.get(`${subject}|${grade}|${sem}|${pb === '*' ? '' : pb}|${sub}|${code}`)).find(Boolean)
          ?? [...unitTitle.entries()].find(([tk]) => tk.startsWith(`${subject}|${grade}|${sem}|`) && tk.endsWith(`|${sub}|${code}`))?.[1] ?? ['', '']
        return { code, title: t[0], chapter: t[1], share: Math.round((c / docs.length) * 1000) / 1000 }
      }).sort((a, b) => cmpKey(a.code, b.code))
      ;(outSlots[key] ??= {})[pub] = { docs: docs.length, units }
    }
  }
  fs.writeFileSync(SCOPES, JSON.stringify({
    source: `czpeanut/OLE-QS data/export @ ${manifest.exported_at}`,
    note: 'share = 該段考時段的考卷中，出現此單元的比例。由 scripts/build-bank.mjs 產生，請勿手改。只有統計數字，不含題目。',
    slots: outSlots,
  }))
  console.log(`段考單元出現率：${Object.keys(outSlots).length} 個段考時段 → ${path.relative(ROOT, SCOPES)}`)
}

main().catch(e => { console.error(e); process.exit(1) })

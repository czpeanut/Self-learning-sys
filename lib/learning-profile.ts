// ── 學習行為剖析：從錯題量、作答速度、錯的題型推估學習習慣與模式（純函式） ──────────
//
// 每個指標都對應一項教育／認知心理學研究（REFS），而且只在資料量足夠時才下判斷（n 不足 → 'na'）。
// 這些是「行為指標」，不是診斷或人格標籤：只描述這段期間的作答方式，建議一律歸因於「策略」而非「能力」。
// 研究整理與門檻依據見 docs/LEARNING-PROFILE.md。

import type { Confidence, Difficulty } from './types'

// ── 研究依據 ─────────────────────────────────────────────────────
export const REFS = {
  kagan: { short: 'Kagan（1965）沉思型／衝動型', full: 'Kagan, J. (1965). Matching Familiar Figures Test：作答快且錯多＝衝動型、慢且正確＝沉思型（conceptual tempo）。' },
  wise: { short: 'Wise & Kong（2005）快速猜題', full: 'Wise, S. L., & Kong, X. (2005). Response time effort：作答時間低於門檻的「快速猜題」正確率接近亂猜，代表沒有投入；門檻常用平均作答時間的 10%（NT10，Wise & Ma, 2012）。' },
  reason: { short: 'Reason（1990）疏失與錯誤', full: 'Reason, J. (1990). Human Error：會做卻做錯的「疏失（slip）」與方法本身錯誤的「錯誤（mistake）」成因不同、處理方式也不同。' },
  buggy: { short: 'Brown & Burton（1978）系統性錯誤', full: 'Brown, J. S., & Burton, R. R. (1978). Diagnostic models for procedural bugs in basic mathematical skills. Cognitive Science, 2, 155–192：同類題反覆錯在同一處，是有一套錯誤的程序（bug），不是粗心。' },
  rabbitt: { short: 'Rabbitt（1966）錯後放慢', full: 'Rabbitt, P. (1966)：人在答錯後通常會放慢（post-error slowing），反映會監控並調整；答錯後沒有放慢，代表錯誤監控較弱。' },
  beck: { short: 'Beck & Gong（2013）原地打轉', full: 'Beck, J. E., & Gong, Y. (2013). Wheel-Spinning: Students Who Fail to Master a Skill. AIED 2013：練了約 10 次仍未精熟，再多練也幾乎沒有幫助，需要換方法。' },
  hyper: { short: 'Butterfield & Metcalfe（2001）高把握錯誤', full: 'Butterfield, B., & Metcalfe, J. (2001). Errors committed with high confidence are hypercorrected. JEP:LMC, 27(6)：很有把握卻答錯的題目，訂正後最容易記住，最值得優先檢討。' },
  aleven: { short: 'Aleven 等（2006）求助行為', full: 'Aleven, V., McLaren, B., Roll, I., & Koedinger, K. (2006). A model of help seeking with a Cognitive Tutor. IJAIED 16(2)；Baker 等（2004）gaming the system：濫用提示與完全不求助都會降低學習成效。' },
  dunlosky: { short: 'Dunlosky 等（2013）分散練習', full: 'Dunlosky, J., Rawson, K., Marsh, E., Nathan, M., & Willingham, D. (2013). Improving students’ learning with effective learning techniques. PSPI 14(1)：「練習測驗」與「分散練習」是十種方法中效益最高的兩種；集中在考前一次讀完效益低。' },
  rohrer: { short: 'Rohrer & Taylor（2007）交錯練習', full: 'Rohrer, D., & Taylor, K. (2007). The shuffling of mathematics problems improves learning. Instructional Science, 35：不同題型混在一起練，練習當下分數較低，但一週後的測驗遠勝一次只練一種題型。' },
  meichenbaum: { short: 'Meichenbaum & Goodman（1971）自我教導', full: 'Meichenbaum, D., & Goodman, J. (1971). Training impulsive children to talk to themselves. J. Abnormal Psychology, 77(2)：教衝動型孩子作答前用固定步驟提醒自己，能提高正確率；單純要求放慢則不一定有效（Kagan 研究的後續批評）。' },
  fatigue: { short: '作業時間與疲勞', full: '持續作業的警覺度隨時間下降（vigilance decrement），長時段後半的正確率常明顯下滑；分段休息（如番茄鐘）可緩解。' },
} as const
export type RefKey = keyof typeof REFS

// ── 輸入 ─────────────────────────────────────────────────────────
export type AnswerEvent = {
  session: string          // 同一次練習
  order: number            // 在該次練習中的順序
  day: string              // YYYY-MM-DD
  timeMs: number
  correct: boolean
  skipped: boolean
  confidence: Confidence
  usedHint: boolean
  difficulty: Difficulty
  skill: string            // 題型／知識點
  skillName: string
}

export type ProfileInput = {
  events: AnswerEvent[]
  /** 請 AI 講解的紀錄：是否看懂、追問幾次 */
  asks: { understood: boolean | null; followups: number }[]
  /** 錯題複習：到期未複習超過 2 天的題數、已克服、總數 */
  review: { overdue: number; resolved: number; total: number }
  /** 專注計時：總專注分鐘、分心次數 */
  focus: { minutes: number; distractions: number }
  today: string            // YYYY-MM-DD
}

// ── 輸出 ─────────────────────────────────────────────────────────
export type Level = 'good' | 'watch' | 'concern' | 'na'
export type Indicator = { id: string; title: string; level: Level; display: string; evidence: string; n: number; ref: RefKey }
export type Pattern = { id: string; name: string; desc: string; tone: 'good' | 'watch' | 'concern'; strength: number }
export type Advice = { id: string; priority: number; title: string; why: string; how: string[]; ref: RefKey; parent: string }
export type LearningProfile = {
  enough: boolean          // 整體資料量是否足以判斷
  total: number
  indicators: Indicator[]
  patterns: Pattern[]
  advice: Advice[]
  tempo: { relSpeed: number | null; accuracy: number | null; quadrant: 'fluent' | 'impulsive' | 'reflective' | 'struggling' | 'balanced' | null }
  struggling: { skill: string; name: string; attempts: number; recentAcc: number }[]
  /** 是否建議開啟「冷靜作答」（衝動型作答時） */
  calmMode: boolean
}

// ── 參數（可依實際資料校正；正式版改用全體學生各題型的作答時間中位數） ──
/** 各難度的參考作答時間（國中單選題的保守估計） */
export const REF_MS: Record<Difficulty, number> = { 1: 40000, 2: 70000, 3: 110000 }
export const MIN_TOTAL = 30
const RAPID_FLOOR_MS = 3000
const rapidThreshold = (d: Difficulty) => Math.max(RAPID_FLOOR_MS, REF_MS[d] * 0.1)   // NT10

const median = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const pct = (v: number) => `${Math.round(v * 100)}%`
const sec = (ms: number) => `${Math.round(ms / 1000)} 秒`

export function buildLearningProfile(input: ProfileInput): LearningProfile {
  const ev = input.events
  const total = ev.length
  const ind: Indicator[] = []
  const add = (i: Indicator) => ind.push(i)

  const isRapid = (e: AnswerEvent) => !e.skipped && e.timeMs < rapidThreshold(e.difficulty)
  const solved = ev.filter(e => !e.skipped && !isRapid(e))       // 有認真作答的題目

  // 1. 作答節奏（Kagan）
  let tempo: LearningProfile['tempo'] = { relSpeed: null, accuracy: null, quadrant: null }
  if (solved.length >= 20) {
    const rel = median(solved.map(e => e.timeMs / REF_MS[e.difficulty]))
    const acc = solved.filter(e => e.correct).length / solved.length
    const fast = rel < 0.5, slow = rel > 1.3, good = acc >= 0.7, bad = acc < 0.6
    const quadrant = fast && good ? 'fluent' : fast && bad ? 'impulsive' : slow && good ? 'reflective' : slow && bad ? 'struggling' : 'balanced'
    tempo = { relSpeed: rel, accuracy: acc, quadrant }
    const label = { fluent: '又快又準', impulsive: '快但錯多', reflective: '慢而準確', struggling: '慢且錯多', balanced: '速度與正確率適中' }[quadrant]
    add({ id: 'tempo', title: '作答節奏', ref: 'kagan', n: solved.length,
      level: quadrant === 'impulsive' || quadrant === 'struggling' ? 'concern' : quadrant === 'reflective' ? 'watch' : 'good',
      display: label, evidence: `作答時間約為參考時間的 ${rel.toFixed(2)} 倍，正確率 ${pct(acc)}` })
  } else add({ id: 'tempo', title: '作答節奏', ref: 'kagan', n: solved.length, level: 'na', display: '資料不足', evidence: '需要至少 20 題認真作答的紀錄' })

  // 2. 快速猜題（Wise & Kong；NT10）
  const answered = ev.filter(e => !e.skipped)
  const rapid = answered.filter(isRapid)
  if (answered.length >= 20) {
    const rate = rapid.length / answered.length
    const rAcc = rapid.length ? rapid.filter(e => e.correct).length / rapid.length : 0
    add({ id: 'rapid', title: '快速猜題', ref: 'wise', n: answered.length,
      level: rate >= 0.1 ? 'concern' : rate >= 0.05 ? 'watch' : 'good',
      display: `${pct(rate)} 的題目看不到幾秒就作答`,
      evidence: rapid.length ? `${rapid.length} 題低於門檻（約 ${sec(rapidThreshold(2))}），這些題的正確率 ${pct(rAcc)}` : '沒有明顯的快速猜題' })
  } else add({ id: 'rapid', title: '快速猜題', ref: 'wise', n: answered.length, level: 'na', display: '資料不足', evidence: '需要至少 20 題' })

  // 3. 疏失 vs 系統性錯誤（Reason；Brown & Burton）
  const bySkill = new Map<string, AnswerEvent[]>()
  for (const e of solved) { if (!bySkill.has(e.skill)) bySkill.set(e.skill, []); bySkill.get(e.skill)!.push(e) }
  const skillAcc = (k: string) => { const l = bySkill.get(k)!; return l.filter(e => e.correct).length / l.length }
  const wrong = solved.filter(e => !e.correct)
  let slipShare = 0, sysShare = 0
  if (wrong.length >= 8) {
    let slip = 0, sys = 0
    for (const e of wrong) {
      const l = bySkill.get(e.skill)!
      if (l.length < 4) continue
      const acc = skillAcc(e.skill), wrongN = l.filter(x => !x.correct).length
      if (acc >= 0.75) slip++
      else if (wrongN >= 3 && acc < 0.5) sys++
    }
    slipShare = slip / wrong.length; sysShare = sys / wrong.length
    const dominant = sysShare >= 0.4 ? '集中在少數題型（系統性錯誤）' : slipShare >= 0.4 ? '多半出現在已經會的題型（疏失）' : '疏失與觀念錯誤都有'
    add({ id: 'errors', title: '錯在哪裡', ref: sysShare >= slipShare ? 'buggy' : 'reason', n: wrong.length,
      level: sysShare >= 0.4 || slipShare >= 0.4 ? 'concern' : 'watch', display: dominant,
      evidence: `${wrong.length} 道錯題中：會做卻錯 ${pct(slipShare)}、同題型反覆錯 ${pct(sysShare)}` })
  } else add({ id: 'errors', title: '錯在哪裡', ref: 'reason', n: wrong.length, level: wrong.length ? 'na' : 'good', display: wrong.length ? '錯題還不夠多，暫不判斷' : '目前沒有錯題', evidence: '需要至少 8 道認真作答的錯題' })

  // 依練習順序配對前後題（4、5 共用）
  const bySession = new Map<string, AnswerEvent[]>()
  for (const e of ev) { if (!bySession.has(e.session)) bySession.set(e.session, []); bySession.get(e.session)!.push(e) }
  const pairs: [AnswerEvent, AnswerEvent][] = []
  for (const list of Array.from(bySession.values())) {
    list.sort((a, b) => a.order - b.order)
    for (let i = 1; i < list.length; i++) if (!list[i - 1].skipped && !list[i].skipped) pairs.push([list[i - 1], list[i]])
  }
  const afterWrong = pairs.filter(([p]) => !p.correct), afterRight = pairs.filter(([p]) => p.correct)

  // 4. 答錯後會不會放慢（Rabbitt）
  let pesRatio: number | null = null
  if (afterWrong.length >= 5 && afterRight.length >= 5) {
    const rel = (e: AnswerEvent) => e.timeMs / REF_MS[e.difficulty]
    pesRatio = median(afterWrong.map(([, n]) => rel(n))) / median(afterRight.map(([, n]) => rel(n)))
    add({ id: 'pes', title: '答錯後的調整', ref: 'rabbitt', n: afterWrong.length,
      level: pesRatio < 0.9 ? 'concern' : pesRatio < 1.05 ? 'watch' : 'good',
      display: pesRatio < 0.9 ? '答錯後反而做得更快' : pesRatio < 1.05 ? '答錯後沒有放慢' : '答錯後會放慢、更小心',
      evidence: `答錯後下一題的作答時間是答對後的 ${pesRatio.toFixed(2)} 倍` })
  } else add({ id: 'pes', title: '答錯後的調整', ref: 'rabbitt', n: afterWrong.length, level: 'na', display: '資料不足', evidence: '需要至少 5 次「答錯後接著作答」' })

  // 5. 連錯（錯了之後更容易再錯）
  let streakGap = 0
  if (afterWrong.length >= 10 && afterRight.length >= 10) {
    const pWW = afterWrong.filter(([, n]) => !n.correct).length / afterWrong.length
    const pRW = afterRight.filter(([, n]) => !n.correct).length / afterRight.length
    streakGap = pWW - pRW
    add({ id: 'streak', title: '連錯傾向', ref: 'rabbitt', n: afterWrong.length,
      level: streakGap >= 0.2 ? 'concern' : streakGap >= 0.1 ? 'watch' : 'good',
      display: streakGap >= 0.2 ? '錯一題後容易接連出錯' : '錯題後能穩住',
      evidence: `答錯後下一題再錯的機率 ${pct(pWW)}，答對後再錯 ${pct(pRW)}` })
  } else add({ id: 'streak', title: '連錯傾向', ref: 'rabbitt', n: afterWrong.length, level: 'na', display: '資料不足', evidence: '需要至少 10 次「答錯後接著作答」' })

  // 6. 後段失速（疲勞）
  const longSessions = Array.from(bySession.values()).filter(l => l.length >= 12)
  let fatigueDrop = 0
  if (longSessions.length >= 2) {
    let fC = 0, fN = 0, lC = 0, lN = 0
    for (const l of longSessions) {
      const k = Math.floor(l.length / 3)
      const first = l.slice(0, k), last = l.slice(-k)
      fC += first.filter(e => e.correct).length; fN += first.length
      lC += last.filter(e => e.correct).length; lN += last.length
    }
    fatigueDrop = fC / fN - lC / lN
    add({ id: 'fatigue', title: '長時間作答的穩定度', ref: 'fatigue', n: longSessions.length,
      level: fatigueDrop >= 0.15 ? 'concern' : fatigueDrop >= 0.08 ? 'watch' : 'good',
      display: fatigueDrop >= 0.15 ? '練到後段正確率明顯下滑' : '前後段表現穩定',
      evidence: `較長的 ${longSessions.length} 次練習：前 1/3 正確率 ${pct(fC / fN)}、後 1/3 ${pct(lC / lN)}` })
  } else add({ id: 'fatigue', title: '長時間作答的穩定度', ref: 'fatigue', n: longSessions.length, level: 'na', display: '資料不足', evidence: '需要至少 2 次 12 題以上的練習' })

  // 7. 自我評估準確度（把握度 vs 對錯；高把握錯誤）
  const sure = answered.filter(e => e.confidence === 'sure')
  const notSure = answered.filter(e => e.confidence !== 'sure')
  let overconf = 0, underconf = 0
  if (sure.length >= 10) {
    overconf = sure.filter(e => !e.correct).length / sure.length
    underconf = notSure.length >= 10 ? notSure.filter(e => e.correct).length / notSure.length : 0
    add({ id: 'calibration', title: '自我評估', ref: 'hyper', n: answered.length,
      level: overconf >= 0.25 ? 'concern' : underconf >= 0.7 ? 'watch' : 'good',
      display: overconf >= 0.25 ? '有把握的題目常常錯（高估自己）' : underconf >= 0.7 ? '常常答對卻沒把握（低估自己）' : '對自己會不會很清楚',
      evidence: `「有把握」的題目錯了 ${pct(overconf)}${notSure.length >= 10 ? `；「沒把握」的題目答對 ${pct(underconf)}` : ''}` })
  } else add({ id: 'calibration', title: '自我評估', ref: 'hyper', n: sure.length, level: 'na', display: '資料不足', evidence: '需要至少 10 題標示「有把握」的作答' })

  // 8. 求助行為（Aleven；Baker）
  const hintRate = answered.length ? answered.filter(e => e.usedHint).length / answered.length : 0
  const askRate = wrong.length ? input.asks.length / wrong.length : 0
  const stuckAfterAI = input.asks.filter(a => a.understood === false).length
  let helpStyle: 'abuse' | 'avoid' | 'ok' | null = null
  if (answered.length >= 20) {
    helpStyle = hintRate >= 0.5 ? 'abuse' : wrong.length >= 10 && askRate < 0.1 && hintRate < 0.05 ? 'avoid' : 'ok'
    add({ id: 'help', title: '求助方式', ref: 'aleven', n: answered.length,
      level: helpStyle === 'ok' ? 'good' : 'concern',
      display: helpStyle === 'abuse' ? '大多數題目先看提示才作答' : helpStyle === 'avoid' ? '錯了很多卻很少看講解' : '需要時才求助',
      evidence: `看提示 ${pct(hintRate)} 的題目；${wrong.length} 道錯題請 AI 講解 ${input.asks.length} 次${stuckAfterAI ? `，其中 ${stuckAfterAI} 題看完仍不懂` : ''}` })
  } else add({ id: 'help', title: '求助方式', ref: 'aleven', n: answered.length, level: 'na', display: '資料不足', evidence: '需要至少 20 題' })

  // 9. 原地打轉（Beck & Gong）：同一題型練了 10 次以上，最近仍然不穩
  const struggling = Array.from(bySkill.entries()).map(([k, l]) => {
    const recent = l.slice(-5)
    return { skill: k, name: l[0].skillName, attempts: l.length, recentAcc: recent.filter(e => e.correct).length / recent.length }
  }).filter(s => s.attempts >= 10 && s.recentAcc < 0.6).sort((a, b) => a.recentAcc - b.recentAcc)
  if (bySkill.size) {
    add({ id: 'wheel', title: '原地打轉的題型', ref: 'beck', n: Array.from(bySkill.values()).filter(l => l.length >= 10).length,
      level: struggling.length ? 'concern' : 'good',
      display: struggling.length ? `${struggling.length} 個題型練很多次仍不穩` : '沒有卡住的題型',
      evidence: struggling.length ? struggling.slice(0, 3).map(s => `「${s.name}」練 ${s.attempts} 次、最近 5 題對 ${pct(s.recentAcc)}`).join('；') : '練過 10 次以上的題型都在進步' })
  }

  // 10. 分散練習（Dunlosky）：近 14 天
  const since = new Date(input.today + 'T00:00:00'); since.setDate(since.getDate() - 13)
  const sinceStr = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`
  const recent14 = ev.filter(e => e.day >= sinceStr)
  let massed = false
  if (recent14.length >= 30) {
    const perDay = new Map<string, number>()
    for (const e of recent14) perDay.set(e.day, (perDay.get(e.day) ?? 0) + 1)
    const days = perDay.size, maxShare = Math.max(...Array.from(perDay.values())) / recent14.length
    massed = maxShare >= 0.6 || days <= 2
    add({ id: 'spacing', title: '練習分布', ref: 'dunlosky', n: recent14.length,
      level: massed ? 'concern' : days >= 6 ? 'good' : 'watch',
      display: massed ? '集中在少數幾天大量練習' : days >= 6 ? '平均分散在多天' : '練習天數偏少',
      evidence: `近 14 天有 ${days} 天練習，單日最多占 ${pct(maxShare)}` })
  } else add({ id: 'spacing', title: '練習分布', ref: 'dunlosky', n: recent14.length, level: 'na', display: '資料不足', evidence: '近 14 天需要至少 30 題' })

  // 11. 交錯練習（Rohrer & Taylor）
  const sessions = Array.from(bySession.values()).filter(l => l.length >= 5)
  let blocked = 0
  if (sessions.length >= 3) {
    blocked = sessions.filter(l => new Set(l.map(e => e.skill)).size === 1).length / sessions.length
    add({ id: 'interleave', title: '題型混合', ref: 'rohrer', n: sessions.length,
      level: blocked >= 0.6 ? 'watch' : 'good',
      display: blocked >= 0.6 ? '多數時候一次只練一種題型' : '不同題型混著練',
      evidence: `${sessions.length} 次練習中 ${pct(blocked)} 只有單一題型` })
  }

  // 12. 錯題複習與專注（輔助）
  if (input.review.total >= 5) {
    add({ id: 'review', title: '錯題複習', ref: 'dunlosky', n: input.review.total,
      level: input.review.overdue >= 10 ? 'concern' : input.review.overdue >= 3 ? 'watch' : 'good',
      display: input.review.overdue >= 3 ? `${input.review.overdue} 題錯題過期沒複習` : '錯題有按時複習',
      evidence: `錯題 ${input.review.total} 題，已克服 ${input.review.resolved} 題` })
  }
  if (input.focus.minutes >= 50) {
    const per25 = input.focus.distractions / (input.focus.minutes / 25)
    add({ id: 'focus', title: '專注', ref: 'fatigue', n: Math.round(input.focus.minutes),
      level: per25 >= 2 ? 'concern' : per25 >= 1 ? 'watch' : 'good',
      display: per25 >= 2 ? '專注時段常常切出去' : per25 >= 1 ? '偶爾分心' : '專注時段很少分心',
      evidence: `專注 ${Math.round(input.focus.minutes)} 分鐘、切換畫面 ${input.focus.distractions} 次（每 25 分鐘 ${per25.toFixed(1)} 次）` })
  }

  // ── 模式（可同時有多個，依強度排序） ──
  const lv = (id: string) => ind.find(i => i.id === id)?.level
  const P: Pattern[] = []
  const q = tempo.quadrant
  if (q === 'impulsive' || (slipShare >= 0.4 && (pesRatio ?? 1) < 1.05))
    P.push({ id: 'impulsive', name: '衝動型作答', tone: 'concern', strength: q === 'impulsive' ? 0.9 : 0.6,
      desc: '作答很快、會的題目也常錯，答錯後也沒有放慢。問題多半不在「不會」，而在「沒看清楚就作答」。' })
  if (q === 'struggling' || sysShare >= 0.4 || struggling.length)
    P.push({ id: 'gap', name: '觀念缺口型', tone: 'concern', strength: q === 'struggling' || sysShare >= 0.4 ? 0.9 : 0.7,
      desc: '錯題集中在少數題型、花很多時間仍答錯，代表有一套錯誤的解法或前面的基礎沒打好。再多刷題效果有限，要先把觀念講清楚。' })
  if (lv('rapid') === 'concern')
    P.push({ id: 'disengaged', name: '投入不足', tone: 'concern', strength: 0.85,
      desc: '有不少題目只看幾秒就作答，正確率接近亂猜。可能是累了、題目太難而放棄，或練習目標不清楚。' })
  if (lv('calibration') === 'concern')
    P.push({ id: 'overconfident', name: '高估自己', tone: 'watch', strength: 0.7,
      desc: '很有把握的題目也常錯，代表有些觀念「以為自己懂」。好消息是：高把握的錯誤訂正後最容易記住。' })
  if (q === 'reflective')
    P.push({ id: 'reflective', name: '穩健但偏慢', tone: 'watch', strength: 0.6,
      desc: '正確率不錯，但作答時間偏長；段考有時間限制，熟練度還可以再提升。' })
  if (lv('streak') === 'concern')
    P.push({ id: 'tilt', name: '容易受挫連錯', tone: 'watch', strength: 0.6, desc: '錯了一題之後，接下來也容易出錯，可能是心急或失去信心。' })
  if (lv('fatigue') === 'concern')
    P.push({ id: 'fatigue', name: '後段失速', tone: 'watch', strength: 0.55, desc: '一次練太久，後半段正確率明顯下滑。' })
  if (massed)
    P.push({ id: 'cramming', name: '集中衝刺型', tone: 'watch', strength: 0.5, desc: '練習集中在少數幾天，平常較少。同樣的時間分散在多天，記得更久。' })
  if (q === 'fluent' && !P.some(p => p.tone === 'concern'))
    P.push({ id: 'fluent', name: '流暢熟練', tone: 'good', strength: 0.8, desc: '又快又準，基礎扎實，可以挑戰更難的題目。' })
  if (!P.length && q)
    P.push({ id: 'steady', name: '穩定學習中', tone: 'good', strength: 0.5, desc: '目前沒有明顯需要調整的作答習慣，持續保持。' })
  P.sort((a, b) => b.strength - a.strength)

  // ── 建議（依優先序；每條對應研究依據） ──
  const A: Advice[] = []
  const has = (id: string) => P.some(p => p.id === id)
  if (has('disengaged')) A.push({ id: 'engage', priority: 1, ref: 'wise', title: '先找回投入感',
    why: '快速猜題的題目幾乎等於沒練，還會讓系統誤判你的程度。',
    how: ['一次練 8–10 題就好，練完就休息', '題目太難時用「看提示」或「不會，看詳解」，不要亂猜', '系統會在你作答太快時提醒你再看一次題目'],
    parent: '孩子有時題目沒看完就作答，可能是累了或覺得太難；比起要求題數，可以先問問孩子今天的狀況。' })
  if (has('gap')) A.push({ id: 'concept', priority: 1, ref: struggling.length ? 'beck' : 'buggy', title: '卡住的題型先停止刷題，改看講解',
    why: '同一題型反覆錯在同一處，通常是解法本身有誤；研究發現練到約 10 次還不會的，再多練也幾乎沒有幫助。',
    how: [struggling.length ? `優先處理：${struggling.slice(0, 3).map(s => `「${s.name}」`).join('、')}` : '找出錯最多的 1–2 個題型',
      '每題都按「請 AI 一步一步講解」，看懂後用自己的話說一遍步驟', '看懂後先做 2–3 題基礎題，再回到原本的難度'],
    parent: `孩子在${struggling.length ? struggling.slice(0, 2).map(s => `「${s.name}」`).join('、') : '少數題型'}卡住了，多刷題幫助不大，需要有人把觀念講清楚（AI 講解或家教）。` })
  if (has('impulsive')) A.push({ id: 'selfcheck', priority: 1, ref: 'meichenbaum', title: '作答前跑一次「檢查口訣」',
    why: '會的題目也錯，是因為沒看清楚就作答。研究顯示用固定步驟提醒自己，比單純「慢一點」更有效。',
    how: ['① 題目問什麼？圈出關鍵字（正負號、單位、「不正確」）', '② 先估一下答案大概多少', '③ 選完再對照一次題目', '系統已開啟「冷靜作答」：送出前會顯示這三步'],
    parent: '孩子會的題目常因看太快而錯，可以鼓勵孩子「作答前先圈關鍵字」，比要求放慢更有用。' })
  if (has('overconfident')) A.push({ id: 'hyper', priority: 2, ref: 'hyper', title: '優先檢討「有把握卻錯」的題目',
    why: '很有把握卻答錯的題目，訂正後最容易記住，是效益最高的複習。',
    how: ['錯題本裡標「觀念錯誤」的題目先看', '寫下「我原本以為…，其實是…」', '隔天再做一次同題型確認'],
    parent: '孩子有些觀念自以為懂，訂正這類題目效果最好，可以請孩子講講原本是怎麼想的。' })
  if (lv('pes') === 'concern' || has('tilt')) A.push({ id: 'pause', priority: 2, ref: 'rabbitt', title: '答錯後停 10 秒再往下',
    why: '答錯後放慢、想一下錯在哪，是會自我調整的表現；答錯後反而更快，常會接連再錯。',
    how: ['答錯時先看完詳解再按下一題', '連錯兩題就深呼吸、喝口水', '下一波系統會自動降低你出錯題型的難度'],
    parent: '孩子錯了之後容易心急，可以提醒孩子「錯了先停一下想想」。' })
  if (has('fatigue') || lv('focus') === 'concern') A.push({ id: 'chunk', priority: 3, ref: 'fatigue', title: '分段練習，每段 25 分鐘',
    why: '練太久後半段正確率會下滑，分段休息比硬撐更有效率。',
    how: ['用 K書模式的番茄鐘：專注 25 分、休息 5 分', '每一波 8–10 題，做完休息再做下一波'],
    parent: '孩子一次讀太久會失去效率，短時間多次比長時間硬撐好。' })
  if (has('cramming') || lv('review') === 'concern' || lv('review') === 'watch') A.push({ id: 'spacing', priority: 3, ref: 'dunlosky', title: '每天少量、分散練習',
    why: '分散練習是研究評為效益最高的讀書方法之一；考前一次大量練習忘得快。',
    how: ['每天固定練 15–20 題，比週末一次 100 題好', '每天先做「今日錯題複習」再練新題', '段考衝刺頁會告訴你每天建議題量'],
    parent: '同樣的讀書時間，分散在每天比集中在考前更有效，可以陪孩子固定每天的練習時間。' })
  if (lv('interleave') === 'watch') A.push({ id: 'mix', priority: 4, ref: 'rohrer', title: '不同題型混著練',
    why: '混合練習當下比較難、分數較低，但一週後的表現遠勝一次只練一種。',
    how: ['用「針對缺口練習」（會自動混合多個題型），少用單一題型練習'],
    parent: '練習時混合不同題型雖然比較難，但記得更牢。' })
  if (has('reflective')) A.push({ id: 'speed', priority: 4, ref: 'kagan', title: '在正確的基礎上練速度',
    why: '正確率夠了，接下來要讓熟悉的題型更快完成，段考才寫得完。',
    how: ['練習設定改成每題 60 秒提醒', '已熟練的題型挑戰在時間內完成'],
    parent: '孩子做題仔細，接下來可以練習在時間內完成。' })
  if (lv('help') === 'concern') A.push(helpStyle === 'abuse'
    ? { id: 'help', priority: 3, ref: 'aleven', title: '先自己想 1 分鐘再看提示',
        why: '太快看提示，等於把思考的機會讓掉了。', how: ['先寫下第一步，卡住再看提示', '看完提示要自己把整題做完'],
        parent: '孩子較常一開始就看提示，可以鼓勵孩子先自己試試看。' }
    : { id: 'help', priority: 2, ref: 'aleven', title: '不會的題目要看講解',
        why: '錯了不看講解，同樣的錯會一直重複。', how: ['答錯又不懂時，按「請 AI 一步一步講解」', '看完還是不懂就按「還是不懂」追問'],
        parent: '孩子錯了很少看講解，可以提醒孩子善用 AI 講解功能。' })
  if (has('fluent')) A.push({ id: 'challenge', priority: 4, ref: 'kagan', title: '提高難度',
    why: '已經又快又準，維持在「有點難」的程度進步最快。', how: ['練習設定難度改為「進階」', '挑戰還沒練過的單元'],
    parent: '孩子基礎很扎實，可以鼓勵孩子挑戰更難的題目。' })
  A.sort((a, b) => a.priority - b.priority)

  return {
    enough: total >= MIN_TOTAL, total, indicators: ind, patterns: P, advice: A.slice(0, 5), tempo, struggling,
    calmMode: has('impulsive'),
  }
}

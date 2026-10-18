// 引擎與離線出題器的自我檢測：npm test
//  1. 每個離線產生器 × 3 種難度 × 300 次：選項 4 個且不重複、正解在範圍內、題幹無 NaN/undefined
//  2. 模擬學生：知識點真實能力不同，檢查多波練習後「弱點被加重出題」且掌握度往真實能力收斂
import assert from 'node:assert/strict'
import { expectedCorrect, planNextRound, updateMastery, newMastery, allocate } from '../lib/engine'
import { generateOffline, hasGenerator } from '../lib/generators'
import { getChapters, getKnowledgePoints } from '../lib/taxonomy'
import type { Difficulty, KPMastery, KPRef, Question, Session } from '../lib/types'
import { DEFAULT_SETTINGS, kpKey } from '../lib/types'

let checked = 0
const genKPs: KPRef[] = []
for (const chapter of getChapters('數學')) {
  for (const kp of getKnowledgePoints('數學', chapter)) {
    if (!hasGenerator('數學', kp)) continue
    genKPs.push({ subject: '數學', chapter, kp })
    for (const d of [1, 2, 3] as Difficulty[]) {
      for (let i = 0; i < 300; i++) {
        const q = generateOffline('數學', kp, d)!
        const ctx = `${kp} d=${d}: ${q.stem} | ${q.options.join(' / ')}`
        assert.equal(q.options.length, 4, ctx)
        assert.equal(new Set(q.options).size, 4, `選項重複 ${ctx}`)
        assert.ok(q.answerIndex >= 0 && q.answerIndex < 4, ctx)
        for (const t of [q.stem, q.explanation, ...q.options]) assert.ok(!/NaN|undefined|Infinity/.test(t), `異常文字 ${ctx}`)
        checked++
      }
    }
  }
}
console.log(`✓ 離線產生器：${genKPs.length} 個知識點（全部可在 taxonomy 找到），${checked} 題檢查通過`)

assert.deepEqual(allocate([10, 1], 5, 3), [3, 2])
assert.equal(allocate([5, 5, 5], 8, 4).reduce((a, b) => a + b, 0), 8)

// 模擬：3 個知識點，真實能力 90 / 60 / 25
const scope = genKPs.slice(0, 3)
const trueSkill: Record<string, number> = { [kpKey(scope[0])]: 90, [kpKey(scope[1])]: 60, [kpKey(scope[2])]: 25 }
let rng = 42
const rand = () => ((rng = (rng * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)

let mastery: Record<string, KPMastery> = {}
const session: Session = {
  id: 't', mode: 'practice', subject: '數學', scope, settings: { ...DEFAULT_SETTINGS, maxRounds: 6, questionsPerRound: 9 },
  rounds: [], masteryBefore: {}, status: 'active', createdAt: 0,
}
for (;;) {
  const step = planNextRound(session, mastery)
  if ('done' in step) { console.log(`  模擬結束：${step.done}，共 ${session.rounds.length} 波`); break }
  const questions: Question[] = step.plan.flatMap(p => Array.from({ length: p.count }, (_, i) => ({
    id: `${session.rounds.length}-${p.kp}-${i}`, ...p, stem: 's', options: ['a', 'b', 'c', 'd'], answerIndex: 0, explanation: '', source: 'generator' as const,
  })))
  const answers = questions.map(q => {
    const correct = rand() < expectedCorrect(trueSkill[kpKey(q)], q.difficulty)
    const a = { questionId: q.id, chosen: correct ? 0 : 1, correct, confidence: 'sure' as const, usedHint: false, timeMs: 30000 }
    mastery = { ...mastery, [kpKey(q)]: updateMastery(mastery[kpKey(q)] ?? newMastery(q), q, a) }
    return a
  })
  const dist = step.plan.map(p => `${p.kp}×${p.count}(難${p.difficulty})`).join('、')
  console.log(`  第 ${session.rounds.length + 1} 波：${dist} → ${answers.filter(a => a.correct).length}/${answers.length}`)
  session.rounds.push({ index: session.rounds.length + 1, plan: step.plan, questions, answers, startedAt: 0 })
}
const final = scope.map(r => Math.round(mastery[kpKey(r)].score))
console.log(`  最終掌握度（真實能力 90/60/25）：${final.join(' / ')}`)
assert.ok(final[0] > final[2], '強項掌握度應高於弱項')
const weakCount = session.rounds.slice(1).flatMap(r => r.questions).filter(q => kpKey(q) === kpKey(scope[2])).length
const strongCount = session.rounds.slice(1).flatMap(r => r.questions).filter(q => kpKey(q) === kpKey(scope[0])).length
assert.ok(weakCount > strongCount, `弱項應被加重出題（弱 ${weakCount} vs 強 ${strongCount}）`)
console.log(`✓ 自適應：第 2 波起弱項出 ${weakCount} 題、強項出 ${strongCount} 題`)

// ── 家長日報 ──
import { buildDailyReport, dailyReportText } from '../lib/daily-report'
import type { StudyDay } from '../lib/types'
{
  const t0 = new Date('2026-09-20T15:00:00').getTime()
  const min = 60000
  const day: StudyDay = {
    date: '2026-09-20', checkInAt: t0, checkOutAt: t0 + 240 * min, seat: 'A12',
    plan: { subjects: ['數學', '英文'], targetMinutes: 90, targetQuestions: 20, note: '寫完講義 3-2' },
    blocks: [
      { start: t0 + 5 * min, end: t0 + 55 * min, subject: '數學', kind: 'focus', plannedMin: 50, distractions: 1, completed: true },
      { start: t0 + 55 * min, end: t0 + 60 * min, subject: '休息', kind: 'break', plannedMin: 5, distractions: 0, completed: true },
      { start: t0 + 60 * min, end: t0 + 85 * min, subject: '英文', kind: 'focus', plannedMin: 25, distractions: 0, completed: true },
    ],
    reflection: { mood: 'frustrated', learned: '配方法', stuck: '應用題列式' },
  }
  const r = buildDailyReport({ date: day.date, studentName: '小明', day, sessions: [], log: { date: day.date, answered: 24, correct: 10, minutes: 30 }, asks: [], now: t0 + 260 * min })
  assert.equal(r.focus.minutes, 75)
  assert.equal(r.stayMinutes, 240)
  assert.deepEqual(r.focus.bySubject.map(s => s.subject), ['數學', '英文'])
  assert.deepEqual(r.goals.map(g => g.met), [false, true])
  assert.ok(r.alerts.some(a => a.text.includes('專注計時只有')), '在館久但專注少要提醒')
  assert.ok(r.alerts.some(a => a.text.includes('正確率 42%')), '正確率低要提醒')
  assert.ok(r.alerts.some(a => a.text.includes('卡住了')), '心情卡住要提醒')
  assert.ok(r.tipsForParent[0].includes('先聽他說'))
  const text = dailyReportText(r)
  assert.ok(text.startsWith('📚 小明 9/20 學習日報') && text.includes('專注 1 小時 15 分'), text)
  const absent = buildDailyReport({ date: '2026-09-21', studentName: '', day: null, sessions: [], log: undefined, asks: [] })
  assert.equal(absent.attended, false)
  console.log('✓ 家長日報：時數統計、目標達成、提醒規則、LINE 文字格式')
}

// ── 問 AI：答案字母擷取、解題提示詞、日報「仍不懂」提醒 ──
import { answerLetter } from '../lib/tutor'
import { buildSolvePrompt, extractAnswer } from '../lib/solve'
import type { AskRecord } from '../lib/types'
{
  assert.equal(answerLetter('(B)'), 1)
  assert.equal(answerLetter('（Ｃ）'), 2)
  assert.equal(answerLetter('D'), 3)
  assert.equal(answerLetter('$x=3$'), null)
  assert.equal(extractAnswer('**思路**\n移項\n\n**步驟**\n1. $x=3$\n\n**答案**\n(C)\n'), '(C)')
  const p = buildSolvePrompt('數學', '三角形與全等', '求 x')
  assert.ok(p.includes('**思路**') && p.includes('```figure') && p.includes('求 x'), '解題提示詞應與 student-app 相同（含 figure 規格）')
  assert.ok(!buildSolvePrompt('英文', '單字能力', 'q').includes('```figure'), '非數學不畫圖')

  const q = (kp: string): Question => ({ id: kp, subject: '數學', chapter: '一元一次方程式', kp, difficulty: 2, stem: 's', options: ['a', 'b', 'c', 'd'], answerIndex: 0, explanation: '', source: 'ai' })
  const ask = (kp: string, understood: boolean | null, n = 0): AskRecord => ({ questionId: kp, question: q(kp), createdAt: 0, updatedAt: 0, solution: 'x', followups: Array.from({ length: n }, () => ({ q: '?', a: '!', at: 0 })), understood })
  const r = buildDailyReport({ date: '2026-09-22', studentName: '', day: null, sessions: [], log: undefined, asks: [ask('移項', true), ask('去括號', false, 2), ask('去分母', null)] })
  assert.deepEqual(r.ai, { solved: 3, followups: 2, understood: 1, stuck: 1, stuckTopics: ['去括號'] })
  assert.ok(r.alerts.some(a => a.text.includes('看完 AI 解說仍不懂（去括號）')))
  assert.ok(r.tipsForParent.some(t => t.includes('家長或家教協助')))
  console.log('✓ 問 AI：答案擷取、解題提示詞、仍不懂提醒')
}

// ── 段考：日期推算、主流範圍、準備度 ──
import { daysUntil, examUnits, inferExam, mainstreamUnits, type ScopeData } from '../lib/exam'
import { computeReadiness, needToMaster, type PoolCatalog } from '../lib/readiness'
import scopes from '../lib/data/exam-scopes.json'
import type { Attempt } from '../lib/types'
{
  const d = (s: string) => new Date(s + 'T09:00:00')
  const pick = (s: string, g = 7) => { const r = inferExam(d(s), g); return `${r.semester}-${r.seq}` }
  assert.equal(pick('2026-09-05'), '1-1')
  assert.equal(pick('2026-10-17'), '1-1', '10/17 還在第 1 次段考前後')
  assert.equal(pick('2026-10-25'), '1-2', '第 1 次考完幾天後換第 2 次')
  assert.equal(pick('2026-12-20'), '1-3')
  assert.equal(pick('2027-01-10'), '1-3', '1 月中的段考屬於上學期')
  assert.equal(pick('2027-02-15'), '2-1')
  assert.equal(pick('2027-05-01'), '2-2')
  assert.equal(pick('2027-06-10'), '2-3')
  assert.equal(pick('2027-04-10', 9), '2-2', '國三下只有兩次段考')
  assert.equal(pick('2027-07-15'), '1-1', '暑假 → 下學年上學期第 1 次')
  assert.equal(daysUntil({ grade: 7, semester: 1, seq: 1, examDate: '2026-10-20' }, d('2026-10-17')), 3)

  // 主流範圍：數學七上第 1 次＝第 1 章（統計資料應呈現這個事實）
  const s = examUnits(scopes as ScopeData, '數學', 7, 1, 1, '翰林')!
  assert.ok(s.docs >= 30)
  const main = mainstreamUnits(s.units)
  assert.ok(main.length >= 3 && main.every(c => c.startsWith('1-')), `七上第 1 次主流範圍應為第 1 章，得到 ${main}`)
  assert.ok(mainstreamUnits(examUnits(scopes as ScopeData, '數學', 7, 1, 2, '翰林')!.units).every(c => c.startsWith('2-')), '第 2 次段考不累計第 1 章')

  // 準備度
  assert.equal(needToMaster(0, []), 4)
  assert.equal(needToMaster(3, [true, true, true]), 1)
  assert.equal(needToMaster(4, [false, false, true, true, true]), 1, '最近 5 題要 ≥80%')
  const cat: PoolCatalog = {
    book: '7-1', bookName: '七上',
    units: [{ code: '1-1', title: '正數與負數', types: [
      { code: 'T01', name: '常考題型', desc: '', n: 50 }, { code: 'T02', name: '冷門題型', desc: '', n: 10 }, { code: 'OTHER', name: '其他題型', desc: '', n: 5 },
    ] }],
    freq: { '1': { docs: 60, perPaper: { '1-1:T01': 3, '1-1:T02': 0.5, '1-1:OTHER': 1 } } },
  }
  const now = Date.now()
  const att = (qid: string, type: string, correct: boolean, ago = 0): Attempt =>
    ({ qid, book: '7-1', unit: '1-1', type, correct, at: now - ago, timeMs: 30000, confidence: 'sure', usedHint: false })
  const empty = computeReadiness({ cat, units: ['1-1'], attempts: [], daysLeft: 10, now })
  assert.equal(empty.readiness, 0)
  assert.equal(empty.examLoad, 3.5, '其他題型不計入')
  assert.equal(empty.gaps[0].type, 'T01', '段考常出的題型缺口排最前')
  assert.equal(empty.needTotal, 8)
  assert.equal(empty.perDay, 2)
  const mastered = computeReadiness({ cat, units: ['1-1'], attempts: ['a', 'b', 'c', 'd'].map(q => att(q, 'T01', true)), daysLeft: 10, now })
  assert.equal(mastered.rows.find(r => r.type === 'T01')!.status, 'mastered')
  assert.ok(Math.abs(mastered.readiness - 3 / 3.5) < 1e-9, '常考題型熟練 → 準備度 3/3.5')
  const repeat = computeReadiness({ cat, units: ['1-1'], attempts: ['a', 'a', 'a', 'a'].map(q => att(q, 'T01', true)), daysLeft: 10, now })
  assert.equal(repeat.rows.find(r => r.type === 'T01')!.status, 'learning', '同一題重複答對不算 4 題')
  const stale = computeReadiness({ cat, units: ['1-1'], attempts: ['a', 'b', 'c', 'd'].map(q => att(q, 'T01', true, 30 * 86400000)), daysLeft: 10, now })
  assert.equal(stale.rows.find(r => r.type === 'T01')!.status, 'stale')
  console.log('✓ 段考：日期推算、主流範圍（真實統計）、準備度與缺口')
}

// ── 學習行為剖析：模擬不同類型的學生，檢查辨識結果 ──
import { buildLearningProfile, type AnswerEvent as PEvent, type ProfileInput } from '../lib/learning-profile'
{
  let seed = 7
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const day = (i: number) => `2026-10-${String(1 + i).padStart(2, '0')}`
  type Spec = { n: number; time: (i: number, prevWrong: boolean) => number; correct: (i: number, skill: string) => boolean; conf?: (c: boolean) => 'sure' | 'unsure' | 'guess'; skills?: string[]; days?: number; perSession?: number; hint?: number }
  const make = (s: Spec): ProfileInput => {
    const ev: PEvent[] = []
    let prevWrong = false
    for (let i = 0; i < s.n; i++) {
      const skills = s.skills ?? ['A', 'B', 'C', 'D']
      const skill = skills[i % skills.length]
      const c = s.correct(i, skill)
      const per = s.perSession ?? 10
      ev.push({ session: `s${Math.floor(i / per)}`, order: i % per, day: day(Math.floor(i / per) % (s.days ?? 10)), timeMs: s.time(i, prevWrong),
        correct: c, skipped: false, confidence: s.conf ? s.conf(c) : c ? 'sure' : 'unsure', usedHint: rnd() < (s.hint ?? 0), difficulty: 2, skill, skillName: `題型${skill}` })
      prevWrong = !c
    }
    return { events: ev, asks: [], review: { overdue: 0, resolved: 0, total: 0 }, focus: { minutes: 0, distractions: 0 }, today: '2026-10-12' }
  }
  const ids = (p: ReturnType<typeof buildLearningProfile>) => p.patterns.map(x => x.id)

  // 衝動型：作答很快（約 0.3 倍參考時間），會的題型也常錯、錯後不放慢
  const impulsive = buildLearningProfile(make({ n: 80, time: () => 20000 + rnd() * 6000, correct: () => rnd() < 0.5 }))
  assert.equal(impulsive.tempo.quadrant, 'impulsive')
  assert.ok(ids(impulsive).includes('impulsive') && impulsive.calmMode, `衝動型：${ids(impulsive)}`)
  assert.equal(impulsive.advice[0].priority, 1)

  // 觀念缺口：慢，題型 D 幾乎全錯、其他都對 → 系統性錯誤＋原地打轉
  const gap = buildLearningProfile(make({ n: 80, time: () => 100000 + rnd() * 20000, correct: (_i, k) => (k === 'D' ? rnd() < 0.1 : rnd() < 0.95) }))
  assert.ok(ids(gap).includes('gap'), `觀念缺口：${ids(gap)}`)
  assert.ok(gap.struggling.some(s => s.skill === 'D'), '題型 D 應判為原地打轉')
  assert.ok(gap.advice.some(a => a.id === 'concept'))

  // 投入不足：三成題目 2 秒就作答
  const dis = buildLearningProfile(make({ n: 60, time: i => (i % 3 === 0 ? 2000 : 60000), correct: i => (i % 3 === 0 ? rnd() < 0.25 : rnd() < 0.8) }))
  assert.ok(ids(dis).includes('disengaged'), `投入不足：${ids(dis)}`)

  // 高估自己：全部標「有把握」，錯 40%
  const over = buildLearningProfile(make({ n: 60, time: () => 60000, correct: () => rnd() < 0.6, conf: () => 'sure' }))
  assert.ok(ids(over).includes('overconfident'), `高估自己：${ids(over)}`)

  // 流暢熟練：快又準、分散在 10 天
  const fluent = buildLearningProfile(make({ n: 80, time: () => 25000, correct: () => rnd() < 0.92 }))
  assert.equal(fluent.tempo.quadrant, 'fluent')
  assert.ok(ids(fluent).includes('fluent') && !fluent.calmMode, `流暢：${ids(fluent)}`)

  // 集中衝刺：80 題都在同一天
  const cram = buildLearningProfile(make({ n: 80, time: () => 60000, correct: () => rnd() < 0.75, days: 1 }))
  assert.ok(ids(cram).includes('cramming'), `集中衝刺：${ids(cram)}`)

  // 資料不足時不下判斷
  const few = buildLearningProfile(make({ n: 8, time: () => 20000, correct: () => false }))
  assert.equal(few.enough, false)
  assert.ok(few.indicators.filter(i => i.id === 'tempo' || i.id === 'rapid').every(i => i.level === 'na'))
  console.log('✓ 學習行為剖析：衝動型、觀念缺口、投入不足、高估自己、流暢、集中衝刺、資料不足')
}

// ── 弱項特訓：選題型、原題重做、連續答對達標、原地打轉停止 ──
import { DRILL_STREAK, drillProgress, drillTargets, planDrillRound } from '../lib/drill'
import { buildDayResult } from '../lib/day-result'
{
  const now = new Date('2026-10-18T15:00:00').getTime()
  const [A, B, C] = genKPs
  const mk = (ref: KPRef, id: string, d: Difficulty = 2): Question => ({ ...generateOffline(ref.subject, ref.kp, d)!, subject: ref.subject, chapter: ref.chapter, kp: ref.kp, difficulty: d, source: 'generator', id })
  const wrong = (q: Question, due: boolean) => ({ question: q, wrongCount: 1, lastWrongAt: now - 2 * 86400000, lastAnswer: 0, box: 0, nextReviewAt: due ? now - 1000 : now + 86400000, resolved: false })
  const wrongBook = [wrong(mk(A, 'wa1'), true), wrong(mk(A, 'wa2'), true), wrong(mk(B, 'wb1'), false)]
  const mastery: Record<string, KPMastery> = {
    [kpKey(A)]: { ...newMastery(A), score: 40, attempts: 6, recent: [false, false, true, false, false] },
    [kpKey(B)]: { ...newMastery(B), score: 55, attempts: 4, recent: [true, false, true, true] },
    [kpKey(C)]: { ...newMastery(C), score: 45, attempts: 5, recent: [false, true, false, false, true] },
  }
  const targets = drillTargets({ wrongBook, mastery, now })
  assert.deepEqual(targets.map(t => t.kp), [A.kp, C.kp, B.kp], '錯題多、到期的題型排最前')
  assert.deepEqual(targets[0].wrongIds, ['wa1', 'wa2'])

  const s: Session = {
    id: 'd1', mode: 'drill', subject: '數學', scope: targets, settings: { ...DEFAULT_SETTINGS, maxRounds: 5 }, rounds: [],
    masteryBefore: { [kpKey(A)]: 40, [kpKey(B)]: 55, [kpKey(C)]: 45 }, status: 'active', createdAt: now, drill: { targets },
  }
  const p1 = planDrillRound(s, wrongBook)
  assert.ok('plan' in p1)
  const pa = p1.plan.find(p => p.kp === A.kp)!
  assert.equal(pa.count, DRILL_STREAK)
  assert.equal(pa.difficulty, 1, '第一波降一級難度')
  assert.deepEqual(pa.retry, ['wa1'], '每波重做 1 題原題')
  assert.equal(p1.plan.find(p => p.kp === C.kp)!.retry, undefined, '沒有錯題的題型不重做')

  // 第 1 波：A 全對（原題＋2 題）、B 對錯對、C 全錯
  const play = (plan: typeof p1.plan, res: Record<string, boolean[]>) => {
    const qs: Question[] = [], ans: Session['rounds'][number]['answers'] = []
    for (const p of plan) {
      const ids = [...(p.retry ?? [])]
      while (ids.length < p.count) ids.push(`${p.kp}-${s.rounds.length}-${ids.length}`)
      ids.forEach((id, i) => {
        const q = { ...mk(p, id, p.difficulty), source: (p.retry ?? []).includes(id) ? 'review' as const : 'generator' as const }
        qs.push(q)
        ans.push({ questionId: id, chosen: 0, correct: res[p.kp][i] ?? true, confidence: 'sure', usedHint: false, timeMs: 30000 })
      })
    }
    s.rounds.push({ index: s.rounds.length + 1, plan, questions: qs, answers: ans, startedAt: now - 3600000 + s.rounds.length * 600000 })
  }
  play(p1.plan, { [A.kp]: [true, true, true], [B.kp]: [true, false, true], [C.kp]: [false, false, false] })
  let prog = drillProgress(s)
  assert.equal(prog.find(p => p.kp === A.kp)!.status, 'passed', '連續答對 3 題 → 達標')
  assert.equal(prog.find(p => p.kp === B.kp)!.streak, 1)

  const p2 = planDrillRound(s, wrongBook)
  assert.ok('plan' in p2)
  assert.ok(!p2.plan.some(p => p.kp === A.kp), '達標的題型不再出')
  assert.equal(p2.plan.find(p => p.kp === B.kp)!.count, 2, '連對 1 題 → 再 2 題')
  const pc = p2.plan.find(p => p.kp === C.kp)!
  assert.equal(pc.difficulty, 1, '全錯 → 維持最低難度')
  assert.ok(pc.variantsOf!.length > 0, '錯的題出變化題')

  play(p2.plan, { [B.kp]: [true, true], [C.kp]: [false, true, false] })
  prog = drillProgress(s)
  assert.equal(prog.find(p => p.kp === B.kp)!.status, 'passed')
  assert.equal(prog.find(p => p.kp === C.kp)!.status, 'stuck', '6 題對 1 題 → 停止刷題、改看講解')
  const p3 = planDrillRound(s, wrongBook)
  assert.deepEqual(p3, { done: 'all-passed' })

  // ── 今日成果報告 ──
  s.masteryAfter = { [kpKey(A)]: 62, [kpKey(B)]: 66, [kpKey(C)]: 30 }
  s.status = 'finished'
  const book = wrongBook.map(w => (w.question.id === 'wa1' ? { ...w, resolved: true } : w))
  const r = buildDayResult({
    date: '2026-10-18', sessions: [s], mastery, wrongBook: book, dailyGoal: 10, streak: 4, now,
    activity: [{ date: '2026-10-17', answered: 10, correct: 5, minutes: 10 }, { date: '2026-10-15', answered: 6, correct: 3, minutes: 5 }],
    exam: { label: '數學 七上第 1 次段考', before: 0.3, after: 0.36 },
  })
  assert.equal(r.totals.answered, 14)
  assert.equal(r.totals.correct, 8)
  assert.equal(r.goal.met, true)
  assert.equal(r.wrong.reviewed, 2, 'A、B 各重做 1 題原題')
  assert.equal(r.wrong.conquered, 1, '原題答對且已克服')
  assert.equal(r.wrong.added, 6, '特訓中新題答錯 → 新收進錯題本')
  assert.deepEqual(r.drill.passed.map(p => p.kp), [A.kp, B.kp])
  assert.deepEqual(r.drill.stuck.map(p => p.kp), [C.kp])
  assert.equal(r.compare.yesterday!.answered, 10)
  assert.equal(r.compare.avg7!.answered, 8)
  const rowA = r.skills.find(x => x.kp === A.kp)!
  assert.deepEqual([rowA.before, rowA.after, rowA.delta], [40, 62, 22])
  assert.ok(r.highlights.some(h => h.includes('達成每日目標')) && r.highlights.some(h => h.includes('特訓達標 2')) && r.highlights.some(h => h.includes('準備度 30% → 36%')), r.highlights.join('｜'))
  assert.ok(r.tomorrow[0].text.includes(C.kp) && r.tomorrow[0].href === '/wrong-book', '卡住的題型先看講解')
  const empty = buildDayResult({ date: '2026-10-10', sessions: [s], mastery, wrongBook: book, dailyGoal: 10, streak: 0, activity: [], now })
  assert.equal(empty.empty, true)
  console.log('✓ 弱項特訓：排序、原題重做、降難度、連續答對達標、原地打轉停止；今日成果報告：統計、比較、亮點、明日建議')
}

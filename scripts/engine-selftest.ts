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
  const r = buildDailyReport({ date: day.date, studentName: '小明', day, sessions: [], log: { date: day.date, answered: 24, correct: 10, minutes: 30 }, help: [], now: t0 + 260 * min })
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
  const absent = buildDailyReport({ date: '2026-09-21', studentName: '', day: null, sessions: [], log: undefined, help: [] })
  assert.equal(absent.attended, false)
  console.log('✓ 家長日報：時數統計、目標達成、提醒規則、LINE 文字格式')
}

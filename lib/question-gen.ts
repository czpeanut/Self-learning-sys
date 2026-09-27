// ── 出題服務（server 端） ─────────────────────────────────────────
// 依引擎的出題計畫產生一波題目。來源優先順序：
//   數學計算型知識點 → 程式產生器（答案必定正確、免費）
//   其他知識點       → Gemini（一次呼叫產生整波，省時間）
//   AI 不可用/失敗   → 示範題（標註 demo，流程仍可走完）
// AI 題目一律經過結構驗證，不合格的題目丟掉並以備援補足題數。

import { generateJSON, hasGemini } from './ai'
import { demoQuestion, generateOffline, hasGenerator } from './generators'
import { safeJsonParse } from './json'
import type { Difficulty, PlanItem, Question } from './types'
import { DIFFICULTY_LABEL } from './types'

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export type GenerateOptions = {
  /** 'auto'：產生器優先、其餘用 AI；'ai'：全部用 AI（數學也讓 AI 出應用題） */
  prefer?: 'auto' | 'ai'
  /** 學生本次已看過的題幹，避免重複 */
  avoidStems?: string[]
  grade?: string
}

export async function generateRound(plan: PlanItem[], opts: GenerateOptions = {}): Promise<{ questions: Question[]; usedAI: boolean; warnings: string[] }> {
  const warnings: string[] = []
  const out: Question[] = []
  const aiItems: PlanItem[] = []

  for (const item of plan) {
    const useGen = opts.prefer !== 'ai' && hasGenerator(item.subject, item.kp)
    if (useGen || !hasGemini()) {
      for (let i = 0; i < item.count; i++) out.push(offlineQuestion(item, item.difficulty, item.variantsOf?.[i]?.id))
    } else {
      aiItems.push(item)
    }
  }

  let usedAI = false
  if (aiItems.length > 0) {
    try {
      const aiQs = await generateWithAI(aiItems, opts)
      usedAI = true
      // 依計畫補足題數（AI 少給或驗證不過的，用備援補）
      for (const item of aiItems) {
        const got = aiQs.filter(q => q.kp === item.kp && q.chapter === item.chapter).slice(0, item.count)
        out.push(...got)
        for (let i = got.length; i < item.count; i++) out.push(offlineQuestion(item, item.difficulty))
        if (got.length < item.count) warnings.push(`「${item.kp}」AI 題目不足，已用備援題補上`)
      }
    } catch (e) {
      console.warn('[generate] AI 失敗，改用備援題', e)
      warnings.push('AI 出題暫時無法使用，本波改用備援題')
      for (const item of aiItems) for (let i = 0; i < item.count; i++) out.push(offlineQuestion(item, item.difficulty))
    }
  }

  return { questions: interleave(out), usedAI, warnings }
}

function offlineQuestion(item: PlanItem, difficulty: Difficulty, variantOf?: string): Question {
  const g = generateOffline(item.subject, item.kp, difficulty)
  const base = g ?? demoQuestion(item.subject, item.chapter, item.kp, difficulty)
  return {
    id: uid(),
    subject: item.subject, chapter: item.chapter, kp: item.kp, difficulty,
    ...base,
    variantOf,
    demo: !g,
    source: g ? 'generator' : 'demo',
  }
}

/** 同知識點的題目不要連在一起，交錯排列（交錯練習對長期記憶較好） */
function interleave(qs: Question[]): Question[] {
  const groups = new Map<string, Question[]>()
  for (const q of qs) {
    const k = q.kp
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(q)
  }
  const lists = Array.from(groups.values())
  const res: Question[] = []
  let added = true
  while (added) {
    added = false
    for (const l of lists) {
      const q = l.shift()
      if (q) { res.push(q); added = true }
    }
  }
  return res
}

/**
 * 數學幾何題可附圖：格式與 student-app 詳解的 ```figure``` 區塊相同，
 * 由 components/SolutionView（student-app 快照）渲染成 SVG，所以題幹與詳解都能畫圖。
 */
const FIGURE_RULE = `8. 幾何／坐標題若需要圖，可在 stem 或 explanation 最後附一個圖形區塊，寫法：三個反引號 + figure，換行放一段 JSON，再三個反引號。
   JSON 欄位：points（必填，[{"name":"A","x":0,"y":0}]）、segments（[{"from":"A","to":"B","dashed":false}]）、circles（[{"center":"O","through":"A"}] 或 r）、
   rightAngles（[{"at":"A","from":"B","to":"C"}]）、angles（[{"at":"B","from":"A","to":"C","label":"θ"}]）、segLabels（[{"on":"A-B","text":"4"}]）。
   座標必須符合題目條件（邊長、垂直、平行、比例）。題幹的圖**只能畫出題目已給的條件，不可標出要求的答案**；詳解的圖可以加輔助線（dashed:true）。
   純幾何題不要設 showCoord；非幾何題不要附圖。`

type AIQuestion = {
  kp: string; chapter: string; difficulty: number
  stem: string; options: string[]; answerIndex: number
  explanation: string; hint?: string; variantOf?: string
}

async function generateWithAI(items: PlanItem[], opts: GenerateOptions): Promise<Question[]> {
  const subject = items[0].subject
  const spec = items.map((it, i) => {
    const lines = [`${i + 1}. 大單元「${it.chapter}」／知識點「${it.kp}」：${it.count} 題，難度「${DIFFICULTY_LABEL[it.difficulty]}」(${it.difficulty})`]
    if (it.variantsOf?.length) {
      lines.push(`   其中 ${it.variantsOf.length} 題請出下列錯題的「變化題」（同一觀念，但換數字、情境或問法，不可與原題相同），並在 variantOf 填入原題 id：`)
      for (const v of it.variantsOf) lines.push(`   - [${v.id}] ${v.stem.replace(/\s+/g, ' ').slice(0, 200)}`)
    }
    return lines.join('\n')
  }).join('\n')

  const avoid = (opts.avoidStems ?? []).slice(-15).map(s => `- ${s.replace(/\s+/g, ' ').slice(0, 80)}`).join('\n')

  const prompt = `你是台灣國中${opts.grade ?? ''}${subject}老師，依 108 課綱出「四選一單選題」給學生自習練習。

出題需求：
${spec}

規則：
1. 使用繁體中文（台灣用語），題目要符合國中程度與會考風格，情境貼近學生生活。
2. 每題恰好 4 個選項，只有一個正確答案；錯誤選項要是「學生常見的錯誤想法」，不要明顯亂湊。
3. 選項文字不要加 (A)(B) 等標號。
4. 數學式用 LaTeX，行內以 $...$ 包住（JSON 裡的反斜線要寫成 \\\\）。
5. explanation 寫出完整解題步驟與觀念說明（3–6 句），並點出常見錯誤。
6. hint 給一句「不直接說答案」的提示。
7. 難度：基礎＝單一觀念直接應用；標準＝兩步驟或結合情境；進階＝綜合題或需要推理。
${subject === '數學' ? FIGURE_RULE : '8. 不需要看圖就能作答（不要出「如圖」的題目）。'}
9. 請先自行驗算確認 answerIndex 正確。
${avoid ? `\n避免與下列已出過的題目重複：\n${avoid}\n` : ''}
只輸出 JSON，格式：
{"questions":[{"chapter":"大單元","kp":"知識點","difficulty":1,"stem":"題幹","options":["","","",""],"answerIndex":0,"explanation":"詳解","hint":"提示","variantOf":"原題id或空字串"}]}`

  const raw = await generateJSON(prompt)
  const parsed = safeJsonParse<{ questions?: AIQuestion[] }>(raw)
  const list = parsed?.questions ?? []
  const valid: Question[] = []
  for (const q of list) {
    const item = items.find(it => it.kp === q.kp && it.chapter === q.chapter) ?? items.find(it => it.kp === q.kp)
    if (!item) continue
    if (typeof q.stem !== 'string' || !q.stem.trim()) continue
    if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some(o => typeof o !== 'string' || !o.trim())) continue
    if (new Set(q.options.map(o => o.trim())).size !== 4) continue
    if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex > 3) continue
    valid.push({
      id: uid(),
      subject: item.subject, chapter: item.chapter, kp: item.kp,
      difficulty: item.difficulty,
      stem: q.stem.trim(),
      options: q.options.map(o => o.replace(/^\s*[(（]?[A-DＡ-Ｄ][)）.、]\s*/, '').trim()),
      answerIndex: q.answerIndex,
      explanation: q.explanation ?? '',
      hint: q.hint || undefined,
      variantOf: q.variantOf && item.variantsOf?.some(v => v.id === q.variantOf) ? q.variantOf : undefined,
      source: 'ai',
    })
  }
  return valid
}

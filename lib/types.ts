// ── 核心資料型別 ────────────────────────────────────────────────
// 自習系統的資料流：
//   選範圍(Scope) → 產生一波題目(Round) → 作答(Answer) → 引擎評估 → 下一波 … → 學習報告(Report)

/** 難度：1 基礎、2 標準、3 進階 */
export type Difficulty = 1 | 2 | 3
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { 1: '基礎', 2: '標準', 3: '進階' }

/** 一個知識點的唯一識別（科目 + 大單元 + 知識點） */
export type KPRef = { subject: string; chapter: string; kp: string }
export const kpKey = (r: KPRef) => `${r.subject}|${r.chapter}|${r.kp}`

/** 單選題（初版只做四選一，好自動批改） */
export type Question = {
  id: string
  subject: string
  chapter: string
  kp: string
  difficulty: Difficulty
  stem: string          // 題幹（可含 $LaTeX$）
  options: string[]     // 4 個選項文字
  answerIndex: number   // 正解 index
  explanation: string   // 詳解
  hint?: string         // 提示（先想一下再看）
  /** 若為某錯題的「變化題」，記下原題 id，方便報告串起來 */
  variantOf?: string
  /** 示範模式產生（未連接 AI），報告與畫面會標註 */
  demo?: boolean
  source: 'ai' | 'generator' | 'demo' | 'review'
}

/** 作答者對自己答案的把握度 */
export type Confidence = 'sure' | 'unsure' | 'guess'
export const CONFIDENCE_LABEL: Record<Confidence, string> = { sure: '有把握', unsure: '不太確定', guess: '用猜的' }

/** 錯誤類型（系統自動判斷，學生可在回顧時更正） */
export type ErrorType = 'concept' | 'unfamiliar' | 'careless' | 'guess'
export const ERROR_TYPE_LABEL: Record<ErrorType, string> = {
  concept:    '觀念錯誤',   // 很有把握卻答錯 → 觀念可能有誤
  unfamiliar: '不熟練',     // 不太確定、答錯
  careless:   '粗心失誤',   // 作答極快且有把握 → 可能看錯/算錯
  guess:      '猜題',       // 自己標示用猜的
}

export type Answer = {
  questionId: string
  chosen: number | null     // null = 跳過
  correct: boolean
  confidence: Confidence
  usedHint: boolean
  timeMs: number
  errorType?: ErrorType
  /** 學生自選的錯因（沿用 student-app 的 ERROR_CAUSE_MAP） */
  errorCause?: string
}

/** 引擎排給下一波的「出題計畫」—— 送給 /api/generate 產題 */
export type PlanItem = KPRef & {
  difficulty: Difficulty
  count: number
  /** 需要出變化題的錯題（題幹），讓 AI 出「同觀念、換情境/數字」的題 */
  variantsOf?: { id: string; stem: string }[]
  reason: string            // 給學生看的：為什麼這波會出這個
}

export type Round = {
  index: number             // 第幾波（從 1 開始）
  plan: PlanItem[]
  questions: Question[]
  answers: Answer[]
  startedAt: number
  finishedAt?: number
}

/** 單一知識點的掌握度紀錄（跨 session 累積） */
export type KPMastery = KPRef & {
  score: number             // 0–100 掌握度
  attempts: number
  correct: number
  lastPracticedAt: number
  /** 最近 5 次對錯（新的在後），用來判斷穩定度 */
  recent: boolean[]
}

export type SessionMode = 'practice' | 'review'

export type SessionSettings = {
  questionsPerRound: number
  maxRounds: number
  /** 'adaptive' 由引擎依掌握度決定；固定難度則全程使用 */
  difficulty: 'adaptive' | Difficulty
  /** 每題建議秒數（只做提示，不強制交卷），0 = 不計時 */
  secondsPerQuestion: number
  /** 過關門檻：掌握度 ≥ 此值且本次連對即算過關 */
  passScore: number
}

export const DEFAULT_SETTINGS: SessionSettings = {
  questionsPerRound: 8,
  maxRounds: 4,
  difficulty: 'adaptive',
  secondsPerQuestion: 90,
  passScore: 80,
}

export type Session = {
  id: string
  mode: SessionMode
  subject: string
  scope: KPRef[]
  settings: SessionSettings
  rounds: Round[]
  /** 開始時各知識點掌握度快照，報告用來算「進步幅度」 */
  masteryBefore: Record<string, number>
  masteryAfter?: Record<string, number>
  status: 'active' | 'finished'
  createdAt: number
  finishedAt?: number
  endReason?: 'all-passed' | 'max-rounds' | 'user-ended'
  goal?: string
}

/** 錯題本條目（含間隔複習排程，Leitner 盒子） */
export type WrongItem = {
  question: Question
  wrongCount: number
  lastWrongAt: number
  lastAnswer: number | null
  errorType?: ErrorType
  box: number               // 0–4，答對升盒、答錯回 0
  nextReviewAt: number
  resolved: boolean         // 連續升到最高盒 → 視為已克服
}

// ── K書中心：到館自習紀錄 ───────────────────────────────────────

/** 一段專注或休息（番茄鐘） */
export type FocusBlock = {
  start: number
  end: number
  subject: string           // 讀哪一科（可為「其他」）
  kind: 'focus' | 'break'
  plannedMin: number
  /** 計時中切到別的分頁／App 的次數 */
  distractions: number
  completed: boolean        // 有沒有撐完預定時間
}

export type DayPlan = {
  subjects: string[]
  targetMinutes: number     // 今天預計專注幾分鐘
  targetQuestions: number   // 今天預計練幾題
  note: string              // 今天想完成的事（例：寫完數學講義 3-2）
}

export type Mood = 'great' | 'ok' | 'tired' | 'frustrated'
export const MOOD_LABEL: Record<Mood, string> = { great: '😄 很順利', ok: '🙂 還可以', tired: '😪 有點累', frustrated: '😣 卡住了' }

export type Reflection = { mood: Mood; learned: string; stuck: string }

/** 一天的到館紀錄（一天一筆；同日再次簽到會接續同一筆） */
export type StudyDay = {
  date: string              // YYYY-MM-DD
  checkInAt: number
  checkOutAt?: number
  seat?: string
  plan: DayPlan
  blocks: FocusBlock[]
  /** 進行中的計時（存起來，重新整理頁面不會遺失） */
  active?: Omit<FocusBlock, 'end' | 'completed'>
  reflection?: Reflection
  /** 家長留給孩子的話（下次到館在 K書模式 看得到） */
  parentNote?: { text: string; at: number; read: boolean }
}

/**
 * 無人館的「問 AI」紀錄：一題一筆。
 * - solution：student-app 同款 AI 詳解（含幾何圖），也當快取用，同一題不重複呼叫 AI
 * - followups：學生說「還是不懂」後的追問與 AI 回答
 * - understood：學生看完後自評（null = 還沒回答）；false 的題目會自動排入錯題複習、並出現在家長日報
 * - mismatch：AI 詳解算出的答案與題目標準答案不同 → 題目可能有誤，記下來給館方檢查
 */
export type AskRecord = {
  questionId: string
  question: Question
  createdAt: number
  updatedAt: number
  solution?: string
  aiAnswer?: string | null
  followups: { q: string; a: string; at: number }[]
  understood: boolean | null
  mismatch?: boolean
}

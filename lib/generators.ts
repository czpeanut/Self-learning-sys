// ── 離線題目產生器（不需 AI） ────────────────────────────────────
// 用途：
//   1. 沒設定 GEMINI_API_KEY 時，雛形仍可完整跑完「選範圍 → 多波練習 → 報告」流程
//   2. AI 忙線/失敗時的備援
//   3. 數學計算型知識點用程式出題：答案 100% 正確、零成本、可無限變化
// 目前涵蓋國中數學常見計算型知識點；其他知識點回傳 null，由上層改用 AI 或示範題。

import type { Difficulty } from './types'

export type GeneratedQuestion = {
  stem: string
  options: string[]
  answerIndex: number
  explanation: string
  hint?: string
}

type Rng = () => number
type Gen = (d: Difficulty, rng: Rng) => GeneratedQuestion

const ri = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1))
const nz = (rng: Rng, lo: number, hi: number) => { let v = 0; while (v === 0) v = ri(rng, lo, hi); return v }
const pick = <T,>(rng: Rng, arr: T[]) => arr[Math.floor(rng() * arr.length)]
const paren = (n: number) => (n < 0 ? `(${n})` : `${n}`)
const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b))
const lcm = (a: number, b: number) => Math.abs(a * b) / gcd(a, b)

/** 產生四個不重複選項並打亂；distractors 不足時自動補 ±1、±2… */
function choices(rng: Rng, correct: string | number, distractors: (string | number)[]): { options: string[]; answerIndex: number } {
  const c = String(correct)
  const set = new Set<string>([c])
  for (const d of distractors) {
    if (set.size >= 4) break
    set.add(String(d))
  }
  let bump = 1
  const num = Number(correct)
  while (set.size < 4) {
    set.add(Number.isFinite(num) ? String(num + (bump % 2 ? bump : -bump)) : `${c}（${bump}）`)
    bump++
  }
  const options = Array.from(set)
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[options[i], options[j]] = [options[j], options[i]]
  }
  return { options, answerIndex: options.indexOf(c) }
}

const range = (d: Difficulty) => (d === 1 ? 20 : d === 2 ? 60 : 200)

const GENERATORS: Record<string, Gen> = {
  // ── 整數與數線 ──
  '整數加法': (d, rng) => {
    const R = range(d)
    const a = nz(rng, -R, R), b = nz(rng, -R, R)
    const ans = a + b
    return {
      stem: `計算 $${a} + ${paren(b)}$ 的值。`,
      ...choices(rng, ans, [a - b, -ans, Math.abs(a) + Math.abs(b)]),
      explanation: `同號相加取相同符號、異號相加以「絕對值大減小」並取絕對值較大者的符號。\n$${a} + ${paren(b)} = ${ans}$`,
      hint: '先看兩數是同號還是異號。',
    }
  },
  '整數減法': (d, rng) => {
    const R = range(d)
    const a = nz(rng, -R, R), b = nz(rng, -R, R)
    const ans = a - b
    return {
      stem: `計算 $${a} - ${paren(b)}$ 的值。`,
      ...choices(rng, ans, [a + b, -ans, b - a - 2]),
      explanation: `減一個數等於加上它的相反數：$${a} - ${paren(b)} = ${a} + ${paren(-b)} = ${ans}$`,
      hint: '把「減」改成「加上相反數」。',
    }
  },
  '整數乘法': (d, rng) => {
    const R = d === 1 ? 9 : d === 2 ? 15 : 30
    const a = nz(rng, -R, R), b = nz(rng, -R, R)
    const ans = a * b
    return {
      stem: `計算 $${paren(a)} \\times ${paren(b)}$ 的值。`,
      ...choices(rng, ans, [-ans, a + b, ans + (a > 0 ? a : -a)]),
      explanation: `同號相乘為正、異號相乘為負。$|${a}| \\times |${b}| = ${Math.abs(ans)}$，所以答案是 $${ans}$。`,
    }
  },
  '絕對值': (d, rng) => {
    const R = range(d)
    const a = nz(rng, -R, R), b = nz(rng, -R, R)
    const ans = Math.abs(a) - Math.abs(b)
    return {
      stem: `求 $|${a}| - |${b}|$ 的值。`,
      ...choices(rng, ans, [a - b, Math.abs(a - b), Math.abs(a) + Math.abs(b)]),
      explanation: `絕對值是數線上與原點的距離，一定不是負數。$|${a}| = ${Math.abs(a)}$、$|${b}| = ${Math.abs(b)}$，相減得 $${ans}$。`,
    }
  },
  '相反數': (d, rng) => {
    const a = nz(rng, -range(d), range(d))
    const expr = d === 1 ? `${a}` : `-(${a})`
    const val = d === 1 ? a : -a
    return {
      stem: `$${expr}$ 的相反數是多少？`,
      ...choices(rng, -val, [val, Math.abs(val), -Math.abs(val), -val + 1]),
      explanation: `兩數和為 0 時互為相反數。$${expr} = ${val}$，所以相反數是 $${-val}$。`,
    }
  },
  '四則運算順序': (d, rng) => {
    const a = nz(rng, -9, 9), b = nz(rng, 2, 9), c = nz(rng, -9, 9)
    const e = d === 3 ? nz(rng, 2, 5) : 1
    const ans = a + b * c * e
    const wrong = (a + b) * c * e
    const stem = e === 1 ? `$${a} + ${b} \\times ${paren(c)}$` : `$${a} + ${b} \\times ${paren(c)} \\times ${e}$`
    return {
      stem: `計算 ${stem} 的值。`,
      ...choices(rng, ans, [wrong, a * b + c, -ans]),
      explanation: `先乘除、後加減：$${b} \\times ${paren(c)}${e === 1 ? '' : ` \\times ${e}`} = ${b * c * e}$，再加上 $${a}$ 得 $${ans}$。`,
      hint: '先乘除後加減。',
    }
  },
  // ── 因數倍數 ──
  '最大公因數': (d, rng) => {
    const g = d === 1 ? ri(rng, 2, 6) : d === 2 ? ri(rng, 4, 12) : ri(rng, 6, 24)
    let x = ri(rng, 2, 9), y = ri(rng, 2, 9)
    while (gcd(x, y) !== 1 || x === y) { x = ri(rng, 2, 9); y = ri(rng, 2, 9) }
    const a = g * x, b = g * y
    return {
      stem: `求 $${a}$ 與 $${b}$ 的最大公因數。`,
      ...choices(rng, g, [lcm(a, b), g * 2, Math.max(1, g / 2 | 0)]),
      explanation: `$${a} = ${g} \\times ${x}$、$${b} = ${g} \\times ${y}$，且 $${x}$ 與 $${y}$ 互質，所以 $(${a}, ${b}) = ${g}$。`,
      hint: '用短除法或質因數分解。',
    }
  },
  '最小公倍數': (d, rng) => {
    const g = ri(rng, 2, d === 1 ? 4 : 8)
    let x = ri(rng, 2, 7), y = ri(rng, 2, 7)
    while (gcd(x, y) !== 1 || x === y) { x = ri(rng, 2, 7); y = ri(rng, 2, 7) }
    const a = g * x, b = g * y, ans = g * x * y
    return {
      stem: `求 $${a}$ 與 $${b}$ 的最小公倍數。`,
      ...choices(rng, ans, [a * b, g, ans * 2]),
      explanation: `最大公因數為 $${g}$，最小公倍數 $= \\dfrac{${a} \\times ${b}}{${g}} = ${ans}$。`,
    }
  },
  '百分率': (d, rng) => {
    const base = ri(rng, 2, 20) * (d === 1 ? 10 : 25)
    const pct = pick(rng, d === 1 ? [10, 20, 25, 50] : [12, 15, 35, 40, 64, 75])
    const ans = (base * pct) / 100
    return {
      stem: `$${base}$ 的 $${pct}\\%$ 是多少？`,
      ...choices(rng, ans, [base * pct / 10, base - ans, ans + pct]),
      explanation: `$${base} \\times \\dfrac{${pct}}{100} = ${ans}$`,
    }
  },
  '折扣': (d, rng) => {
    const price = ri(rng, 3, 30) * 100
    const zhe = pick(rng, d === 1 ? [9, 8, 7, 5] : [85, 75, 65, 88])
    const rate = zhe < 10 ? zhe / 10 : zhe / 100
    const ans = Math.round(price * rate)
    const zheText = zhe < 10 ? `${zhe} 折` : `${zhe} 折（即 ${zhe}%）`
    return {
      stem: `一件原價 $${price}$ 元的外套打 ${zheText}，售價是多少元？`,
      ...choices(rng, ans, [price - ans, Math.round(price * (1 - rate / 10)), ans + 100]),
      explanation: `打 ${zhe < 10 ? zhe : zhe} 折代表售價是原價的 $${Math.round(rate * 100)}\\%$：$${price} \\times ${rate} = ${ans}$ 元。`,
      hint: '「打 8 折」是付原價的 80%。',
    }
  },
  // ── 一元一次方程式 ──
  '解方程式': (d, rng) => {
    const x = nz(rng, -12, 12)
    const a = nz(rng, 2, d === 1 ? 5 : 9) * (d === 3 && rng() < 0.5 ? -1 : 1)
    const b = nz(rng, -20, 20)
    if (d === 3) {
      const c = nz(rng, 1, 9) * (a > 0 ? -1 : 1)
      const e = a * x + b - c * x
      return {
        stem: `解方程式 $${a}x + ${paren(b)} = ${c}x + ${paren(e)}$，$x = $？`,
        ...choices(rng, x, [-x, x + 1, Math.round((e + b) / (a - c))]),
        explanation: `移項：$${a}x - ${paren(c)}x = ${e} - ${paren(b)}$，得 $${a - c}x = ${e - b}$，所以 $x = ${x}$。`,
        hint: '含 x 的項移到左邊，常數移到右邊，移項要變號。',
      }
    }
    const c = a * x + b
    return {
      stem: `解方程式 $${a}x + ${paren(b)} = ${c}$，$x = $？`,
      ...choices(rng, x, [-x, Math.round((c + b) / a), x + 2]),
      explanation: `移項：$${a}x = ${c} - ${paren(b)} = ${c - b}$，兩邊同除以 $${a}$ 得 $x = ${x}$。`,
      hint: '先把常數項移到等號右邊，記得變號。',
    }
  },
  '移項': (d, rng) => GENERATORS['解方程式'](d, rng),
  // ── 二元一次聯立 ──
  '加減消去法': (d, rng) => {
    const x = nz(rng, -6, 6), y = nz(rng, -6, 6)
    const a1 = nz(rng, 1, d === 1 ? 3 : 5), b1 = nz(rng, -4, 4)
    const a2 = nz(rng, 1, d === 1 ? 3 : 5), b2 = d === 1 ? -b1 : nz(rng, -4, 4)
    const fix = a1 * b2 === a2 * b1 ? 1 : 0     // 避免無解/無限多解
    const B2 = b2 + fix
    const c1 = a1 * x + b1 * y, c2 = a2 * x + B2 * y
    const term = (a: number, v: string, first = false) =>
      a === 0 ? '' : `${a < 0 ? '-' : first ? '' : '+'} ${Math.abs(a) === 1 ? '' : Math.abs(a)}${v} `
    const eq = (a: number, b: number, c: number) => `${term(a, 'x', true)}${term(b, 'y')}= ${c}`
    return {
      stem: `解聯立方程式 $\\begin{cases} ${eq(a1, b1, c1)} \\\\ ${eq(a2, B2, c2)} \\end{cases}$，則 $x + y = $？`,
      ...choices(rng, x + y, [x - y, x * y, -(x + y)]),
      explanation: `用加減消去法消去一個未知數，可解得 $x = ${x}$、$y = ${y}$，所以 $x + y = ${x + y}$。\n（驗算：代回兩式皆成立。）`,
      hint: '讓某個未知數的係數相同或相反，再相減或相加。',
    }
  },
  '代入消去法': (d, rng) => GENERATORS['加減消去法'](d, rng),
  // ── 平方根與畢氏定理 ──
  '平方根': (d, rng) => {
    const n = ri(rng, 2, d === 1 ? 12 : d === 2 ? 20 : 30)
    const sq = n * n
    return {
      stem: `$${sq}$ 的平方根是？`,
      ...choices(rng, `$\\pm ${n}$`, [`$${n}$`, `$${sq / 2}$`, `$-${n}$`]),
      explanation: `因為 $${n}^2 = ${sq}$ 且 $(-${n})^2 = ${sq}$，所以 $${sq}$ 的平方根是 $\\pm ${n}$（正的那個 $\\sqrt{${sq}} = ${n}$ 稱為正平方根）。`,
      hint: '正數的平方根有兩個。',
    }
  },
  '畢氏定理': (d, rng) => {
    const triples = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29]]
    const [p, q, r] = pick(rng, d === 1 ? triples.slice(0, 2) : triples)
    const k = d === 1 ? 1 : ri(rng, 1, 3)
    const a = p * k, b = q * k, c = r * k
    if (d >= 2 && rng() < 0.5) {
      return {
        stem: `直角三角形的斜邊長 $${c}$、一股長 $${a}$，另一股長是多少？`,
        ...choices(rng, b, [c - a, Math.round(Math.sqrt(c * c + a * a)), b + k]),
        explanation: `$\\sqrt{${c}^2 - ${a}^2} = \\sqrt{${c * c - a * a}} = ${b}$`,
        hint: '股² = 斜邊² − 另一股²',
      }
    }
    return {
      stem: `直角三角形兩股長分別為 $${a}$、$${b}$，斜邊長是多少？`,
      ...choices(rng, c, [a + b, c + k, Math.abs(b - a) + c - k]),
      explanation: `斜邊 $= \\sqrt{${a}^2 + ${b}^2} = \\sqrt{${a * a + b * b}} = ${c}$`,
      hint: '斜邊² = 股² + 股²',
    }
  },
  // ── 乘法公式 ──
  '和差平方': (d, rng) => {
    const base = pick(rng, d === 1 ? [20, 30, 50] : [100, 200, 1000])
    const off = ri(rng, 1, d === 3 ? 9 : 4) * (rng() < 0.5 ? -1 : 1)
    const n = base + off
    const ans = n * n
    const sign = off > 0 ? '+' : '-'
    return {
      stem: `利用乘法公式計算 $${n}^2$。`,
      ...choices(rng, ans, [base * base + off * off, ans + 2 * Math.abs(off), base * base + 2 * base * off]),
      explanation: `$${n}^2 = (${base} ${sign} ${Math.abs(off)})^2 = ${base}^2 ${sign} 2 \\times ${base} \\times ${Math.abs(off)} + ${Math.abs(off)}^2 = ${base * base} ${sign} ${2 * base * Math.abs(off)} + ${off * off} = ${ans}$`,
      hint: '$(a \\pm b)^2 = a^2 \\pm 2ab + b^2$',
    }
  },
  '平方差': (d, rng) => {
    const base = pick(rng, d === 1 ? [20, 30, 50] : [100, 200, 500])
    const off = ri(rng, 1, 9)
    const ans = base * base - off * off
    return {
      stem: `利用乘法公式計算 $${base + off} \\times ${base - off}$。`,
      ...choices(rng, ans, [base * base + off * off, base * base, ans - 2 * off]),
      explanation: `$(${base} + ${off})(${base} - ${off}) = ${base}^2 - ${off}^2 = ${base * base} - ${off * off} = ${ans}$`,
      hint: '$(a+b)(a-b) = a^2 - b^2$',
    }
  },
  // ── 數列 ──
  '等差數列一般項': (d, rng) => {
    const a1 = nz(rng, -10, 20), dd = nz(rng, -6, 8), n = ri(rng, 8, d === 1 ? 15 : 40)
    const ans = a1 + (n - 1) * dd
    const seq = [0, 1, 2, 3].map(i => a1 + i * dd).join(', ')
    return {
      stem: `等差數列 $${seq}, \\ldots$ 的第 $${n}$ 項是多少？`,
      ...choices(rng, ans, [a1 + n * dd, ans - dd, a1 * n]),
      explanation: `首項 $a_1 = ${a1}$、公差 $d = ${dd}$，$a_{${n}} = a_1 + (${n}-1)d = ${a1} + ${n - 1} \\times ${paren(dd)} = ${ans}$`,
      hint: '$a_n = a_1 + (n-1)d$',
    }
  },
  '等差級數求和公式': (d, rng) => {
    const a1 = ri(rng, 1, 10), dd = ri(rng, 1, d === 1 ? 3 : 7), n = ri(rng, 5, d === 1 ? 10 : 25)
    const an = a1 + (n - 1) * dd
    const ans = ((a1 + an) * n) / 2
    return {
      stem: `求等差級數 $${a1} + ${a1 + dd} + ${a1 + 2 * dd} + \\cdots + ${an}$ 的和。`,
      ...choices(rng, ans, [(a1 + an) * n, ((a1 + an) * (n - 1)) / 2, ans + an]),
      explanation: `項數 $n = \\dfrac{${an} - ${a1}}{${dd}} + 1 = ${n}$，和 $= \\dfrac{(${a1} + ${an}) \\times ${n}}{2} = ${ans}$`,
      hint: '和 = (首項 + 末項) × 項數 ÷ 2',
    }
  },
  // ── 幾何 ──
  '三角形內角和': (d, rng) => {
    const A = ri(rng, 20, 90), B = ri(rng, 20, 160 - A)
    const C = 180 - A - B
    if (d >= 2) {
      const ext = A + B
      return {
        stem: `$\\triangle ABC$ 中，$\\angle A = ${A}^\\circ$，$\\angle C$ 的外角為 $${ext}^\\circ$，則 $\\angle B = $？`,
        ...choices(rng, `$${B}^\\circ$`, [`$${C}^\\circ$`, `$${180 - ext}^\\circ$`, `$${ext - C}^\\circ$`]),
        explanation: `外角等於不相鄰兩內角和：$\\angle A + \\angle B = ${ext}^\\circ$，所以 $\\angle B = ${ext} - ${A} = ${B}^\\circ$。`,
      }
    }
    return {
      stem: `三角形兩內角分別為 $${A}^\\circ$ 與 $${B}^\\circ$，第三個內角是幾度？`,
      ...choices(rng, `$${C}^\\circ$`, [`$${360 - A - B}^\\circ$`, `$${Math.abs(A - B)}^\\circ$`, `$${C + 10}^\\circ$`]),
      explanation: `三角形內角和 $180^\\circ$：$180 - ${A} - ${B} = ${C}$，所以是 $${C}^\\circ$。`,
    }
  },
  '多邊形內角和': (d, rng) => {
    const n = ri(rng, 5, d === 1 ? 8 : 20)
    const ans = (n - 2) * 180
    if (d === 3) {
      const each = ans / n
      const ok = Number.isInteger(each)
      return {
        stem: `正 $${n}$ 邊形的每一個內角是幾度？${ok ? '' : '（取到小數點後一位）'}`,
        ...choices(rng, `$${ok ? each : each.toFixed(1)}^\\circ$`, [`$${(360 / n).toFixed(ok && Number.isInteger(360 / n) ? 0 : 1)}^\\circ$`, `$${ans}^\\circ$`, `$${(ans / (n - 1)).toFixed(1)}^\\circ$`]),
        explanation: `內角和 $(${n}-2) \\times 180^\\circ = ${ans}^\\circ$，正多邊形每個內角相等，$${ans} \\div ${n} ${ok ? '=' : '\\approx'} ${ok ? each : each.toFixed(1)}^\\circ$。`,
      }
    }
    return {
      stem: `${n} 邊形的內角和是幾度？`,
      ...choices(rng, `$${ans}^\\circ$`, [`$${n * 180}^\\circ$`, `$${(n - 1) * 180}^\\circ$`, `$360^\\circ$`]),
      explanation: `$n$ 邊形可從一個頂點切成 $n-2$ 個三角形，內角和 $= (${n}-2) \\times 180^\\circ = ${ans}^\\circ$。`,
      hint: '(n − 2) × 180°',
    }
  },
  // ── 統計與機率 ──
  '平均數': (d, rng) => {
    const k = d === 1 ? 5 : 7
    const data = Array.from({ length: k }, () => ri(rng, 40, 100))
    const sum = data.reduce((s, v) => s + v, 0)
    // 讓平均為整數
    const adj = (k - (sum % k)) % k
    data[0] += adj
    const avg = (sum + adj) / k
    const sorted = [...data].sort((a, b) => a - b)
    return {
      stem: `某次小考 ${k} 位同學的成績為 $${data.join(', ')}$，平均數是多少？`,
      ...choices(rng, avg, [sorted[(k - 1) / 2], avg + 2, Math.round((sum + adj) / (k - 1))]),
      explanation: `總和 $= ${sum + adj}$，平均數 $= ${sum + adj} \\div ${k} = ${avg}$`,
    }
  },
  '中位數': (d, rng) => {
    const k = d === 1 ? 7 : pick(rng, [8, 10])
    const data = Array.from({ length: k }, () => ri(rng, 1, 50))
    const s = [...data].sort((a, b) => a - b)
    const med = k % 2 ? s[(k - 1) / 2] : (s[k / 2 - 1] + s[k / 2]) / 2
    const unsortedMid = k % 2 ? data[(k - 1) / 2] : (data[k / 2 - 1] + data[k / 2]) / 2
    return {
      stem: `資料 $${data.join(', ')}$ 的中位數是多少？`,
      ...choices(rng, med, [unsortedMid, Math.round(s.reduce((a, b) => a + b, 0) / k), s[Math.floor(k / 2)] + 1]),
      explanation: `先由小到大排序：$${s.join(', ')}$。共 ${k} 筆，${k % 2 ? `第 ${(k + 1) / 2} 筆` : `第 ${k / 2}、${k / 2 + 1} 筆的平均`}即中位數 $= ${med}$。`,
      hint: '一定要先排序！',
    }
  },
  '古典機率': (d, rng) => {
    if (d === 1) {
      const target = ri(rng, 1, 6)
      const kind = pick(rng, ['大於', '小於'])
      const cnt = kind === '大於' ? 6 - target : target - 1
      const g = gcd(cnt, 6) || 1
      const ans = cnt === 0 ? '0' : `$\\dfrac{${cnt / g}}{${6 / g}}$`
      return {
        stem: `擲一顆公正骰子一次，點數${kind} $${target}$ 的機率是多少？`,
        ...choices(rng, ans, [`$\\dfrac{1}{6}$`, `$\\dfrac{${Math.min(cnt + 1, 6)}}{6}$`, `$\\dfrac{1}{2}$`, '1']),
        explanation: `所有可能 6 種，符合的有 ${cnt} 種，機率 $= \\dfrac{${cnt}}{6}${cnt && g > 1 ? ` = \\dfrac{${cnt / g}}{${6 / g}}` : ''}$。`,
      }
    }
    const s = ri(rng, 4, 10)
    const cnt = 6 - Math.abs(7 - s)
    const g = gcd(cnt, 36)
    return {
      stem: `同時擲兩顆公正骰子，點數和為 $${s}$ 的機率是多少？`,
      ...choices(rng, `$\\dfrac{${cnt / g}}{${36 / g}}$`, [`$\\dfrac{1}{${s}}$`, `$\\dfrac{${cnt}}{12}$`, `$\\dfrac{1}{6}$`, `$\\dfrac{1}{11}$`]),
      explanation: `兩顆骰子共 $6 \\times 6 = 36$ 種等可能結果，點數和為 $${s}$ 的有 ${cnt} 種，機率 $= \\dfrac{${cnt}}{36}${g > 1 ? ` = \\dfrac{${cnt / g}}{${36 / g}}` : ''}$。`,
      hint: '用 6×6 的表格列舉。',
    }
  },
  // ── 一元二次方程式 ──
  '判別式': (d, rng) => {
    const kind = ri(rng, 0, 2)          // 0 兩相異實根、1 重根、2 無實根
    const a = d === 1 ? 1 : nz(rng, 1, 3)
    let b: number, c: number
    if (kind === 1) { const r = nz(rng, -5, 5); b = -2 * a * r; c = a * r * r }
    else if (kind === 0) { const r1 = nz(rng, -6, 6); let r2 = nz(rng, -6, 6); if (r2 === r1) r2 = r1 + 1; b = -a * (r1 + r2); c = a * r1 * r2 }
    else { b = nz(rng, -4, 4); c = Math.floor((b * b) / (4 * a)) + ri(rng, 1, 6) }
    const D = b * b - 4 * a * c
    const label = D > 0 ? '兩相異實根' : D === 0 ? '重根（兩相等實根）' : '沒有實數解'
    const fmt = (v: number, t: string) => (v === 0 ? '' : `${v < 0 ? '-' : '+'} ${Math.abs(v) === 1 && t ? '' : Math.abs(v)}${t}`)
    return {
      stem: `方程式 $${a === 1 ? '' : a}x^2 ${fmt(b, 'x')} ${fmt(c, '')} = 0$ 的解的情形為何？`,
      ...choices(rng, label, ['兩相異實根', '重根（兩相等實根）', '沒有實數解', '無法判斷'].filter(x => x !== label)),
      explanation: `判別式 $b^2 - 4ac = ${paren(b)}^2 - 4 \\times ${a} \\times ${paren(c)} = ${D}$，${D > 0 ? '大於 0 → 兩相異實根' : D === 0 ? '等於 0 → 重根' : '小於 0 → 沒有實數解'}。`,
      hint: '算 $b^2 - 4ac$，看它 >0、=0 還是 <0。',
    }
  },
  '比例式': (d, rng) => {
    const a = ri(rng, 2, 9), b = ri(rng, 2, 9), k = ri(rng, 2, d === 1 ? 5 : 12)
    const c = a * k
    const ans = b * k
    return {
      stem: `若 $${a} : ${b} = ${c} : x$，則 $x = $？`,
      ...choices(rng, ans, [Math.round((a * c) / b), c + b - a, ans + k]),
      explanation: `內項乘積 = 外項乘積：$${a}x = ${b} \\times ${c}$，所以 $x = ${ans}$。`,
      hint: '外項乘積 = 內項乘積',
    }
  },
}

/** 有離線產生器的知識點（UI 用來標示「免 AI 也能練」） */
export function hasGenerator(subject: string, kp: string): boolean {
  return subject === '數學' && kp in GENERATORS
}

export function generateOffline(subject: string, kp: string, difficulty: Difficulty, rng: Rng = Math.random): GeneratedQuestion | null {
  if (!hasGenerator(subject, kp)) return null
  return GENERATORS[kp](difficulty, rng)
}

/** 沒有 AI、也沒有產生器時的示範題：讓流程能跑完，但畫面會清楚標示這不是真題目 */
export function demoQuestion(subject: string, chapter: string, kp: string, difficulty: Difficulty, rng: Rng = Math.random): GeneratedQuestion {
  const correct = ri(rng, 0, 3)
  const letters = ['A', 'B', 'C', 'D']
  return {
    stem: `【示範題・未連接 AI】這一題代表「${subject}／${chapter}／${kp}」的一道${['', '基礎', '標準', '進階'][difficulty]}題。\n設定 GEMINI_API_KEY 後會換成真正的題目。示範用正解為 (${letters[correct]})。`,
    options: letters.map(l => `選項 ${l}`),
    answerIndex: correct,
    explanation: `這是示範題，用來測試「作答 → 評估 → 下一波 → 報告」的流程。正式題目會附上完整詳解。`,
    hint: `示範題的正解寫在題目裡：(${letters[correct]})`,
  }
}

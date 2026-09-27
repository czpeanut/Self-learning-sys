// 「還是不懂」追問：無人館沒有真人老師，由 AI 針對學生卡住的那一步引導說明。
// 風格沿用 student-app 詳解：白話、簡短、國中程度、公式用 $...$；可再附 ```figure``` 圖。

import { buildSubjectConstraints } from './solve'

export function buildFollowupPrompt(input: {
  subject: string; chapter: string; questionText: string; solution: string
  history: { q: string; a: string }[]; doubt: string
}): string {
  const past = input.history.map((h, i) => `學生第 ${i + 1} 次追問：${h.q}\n你的回答：${h.a}`).join('\n\n')
  return `科目：${input.subject}　章節：${input.chapter}

題目：
${input.questionText}

已經給學生看過的詳解：
${input.solution}
${past ? `\n先前的追問：\n${past}\n` : ''}
學生現在說：「${input.doubt}」

限制：
${buildSubjectConstraints(input.subject, input.chapter)}

你是台灣國中生的家教，現場沒有老師，學生只能靠你。請針對學生「卡住的那一點」解釋：
- 先用一句話說出他可能卡住的原因（例如：不知道為什麼要移項變號）。
- 再用更小的步驟、或換一個生活化的例子說明，不要把整份詳解重講一次。
- 150 字以內（不含公式），用國中生聽得懂的白話，數學式用 $...$ 包住。
- 最後用一個「確認理解的小問題」結尾（不要附答案），讓學生自己想想看。
- 若畫圖有幫助（幾何題），可以附一個 \`\`\`figure\`\`\` 區塊，規格與詳解中的圖相同；非幾何題不要畫。
- 如果學生的問題與本題無關，禮貌地請他專注在這一題。
直接輸出內容，不要前言。`
}

/** 從詳解的答案抽出選項字母（A–D）；抽不到回 null */
export function answerLetter(answer: string | null): number | null {
  if (!answer) return null
  const m = answer.match(/[(（]\s*([A-DＡ-Ｄ])\s*[)）]/) ?? answer.match(/^\s*([A-D])\s*$/)
  if (!m) return null
  const ch = m[1]
  const code = ch.charCodeAt(0)
  return code >= 0xff21 ? code - 0xff21 : code - 65
}

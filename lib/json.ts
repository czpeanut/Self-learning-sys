// 容錯 JSON 解析（移植自 student-app lib/quiz.ts）
// LLM 常在 JSON 字串裡吐出未轉義的 LaTeX 反斜線或原始換行，導致 JSON.parse 失敗。

export function safeJsonParse<T>(raw: string): T | null {
  const text = stripFence(raw)
  try { return JSON.parse(text) as T } catch { /* fall through */ }
  try { return JSON.parse(sanitizeJsonString(text)) as T } catch { return null }
}

/** 去掉 ```json … ``` 外框 */
function stripFence(raw: string): string {
  const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  return (m ? m[1] : raw).trim()
}

export function sanitizeJsonString(raw: string): string {
  let out = ''
  let inStr = false
  let escaped = false
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    const code = raw.charCodeAt(i)
    if (!inStr) {
      out += ch
      if (ch === '"') inStr = true
      continue
    }
    if (escaped) { out += ch; escaped = false; continue }
    if (ch === '\\') {
      const next = raw[i + 1]
      if (next && '"\\/bfnrtu'.includes(next)) { out += ch; escaped = true }
      else out += '\\\\'
      continue
    }
    if (ch === '"') { out += ch; inStr = false; continue }
    if (code < 0x20) {
      if (ch === '\n') out += '\\n'
      else if (ch === '\r') out += '\\r'
      else if (ch === '\t') out += '\\t'
      else out += '\\u' + code.toString(16).padStart(4, '0')
      continue
    }
    out += ch
  }
  return out
}

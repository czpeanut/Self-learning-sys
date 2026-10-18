/**
 * 移除環境變數中複製貼上時混入的隱形字元（BOM、零寬字元、不換行空白）。
 * 沿用 student-app lib/env.ts 的做法：這些字元一旦進到 HTTP header（Supabase 的 apikey 等）
 * 會讓請求直接失敗（"Cannot convert argument to a ByteString"）。
 */
export function cleanEnv(s?: string): string {
  return (s ?? '').replace(/[﻿​-‍⁠ ]/g, '').trim()
}

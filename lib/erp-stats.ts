// ── ERP 總覽統計（純函式）：使用中的學生數、在館人數、活躍度 ─────────────

export type StudentLite = { id: string; user_id: string; grade: string | null; disabled: boolean; created_at: string }
export type AttendanceRow = { student_id: string; date: string; check_in_at: string; check_out_at: string | null }
type Activity = { date: string; answered: number }

export type Usage = {
  total: number               // 全部帳號
  enabled: number             // 使用中（未停用）
  inCenter: number            // 現在在館（今天簽到、還沒簽退）
  checkedInToday: number
  practicedToday: number
  active7: number             // 近 7 天有練習或到館
  active30: number
  newThisMonth: number
  byGrade: Record<string, number>
  days: { date: string; attendance: number; practiced: number }[]   // 近 14 天
}

const shift = (date: string, n: number) => { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

export function usageStats(input: { students: StudentLite[]; attendance: AttendanceRow[]; activity: { user_id: string; value: unknown }[]; today: string }): Usage {
  const { students, attendance, today } = input
  const enabled = students.filter(s => !s.disabled)
  const userToStudent = new Map(students.map(s => [s.user_id, s.id]))
  // 每位學生有活動的日期（練習或到館）
  const activeDays = new Map<string, Set<string>>()
  const practiced = new Map<string, Set<string>>()
  const mark = (m: Map<string, Set<string>>, sid: string, d: string) => { if (!m.has(sid)) m.set(sid, new Set()); m.get(sid)!.add(d) }
  for (const a of input.activity) {
    const sid = userToStudent.get(a.user_id)
    if (!sid || !Array.isArray(a.value)) continue
    for (const d of a.value as Activity[]) if (d.answered > 0) { mark(practiced, sid, d.date); mark(activeDays, sid, d.date) }
  }
  for (const r of attendance) mark(activeDays, r.student_id, r.date)
  const activeWithin = (n: number) => enabled.filter(s => Array.from(activeDays.get(s.id) ?? []).some(d => d > shift(today, -n) && d <= today)).length
  const todayRows = attendance.filter(r => r.date === today)
  const byGrade: Record<string, number> = {}
  for (const s of enabled) byGrade[s.grade || '未填'] = (byGrade[s.grade || '未填'] ?? 0) + 1
  return {
    total: students.length,
    enabled: enabled.length,
    inCenter: todayRows.filter(r => !r.check_out_at).length,
    checkedInToday: todayRows.length,
    practicedToday: enabled.filter(s => practiced.get(s.id)?.has(today)).length,
    active7: activeWithin(7),
    active30: activeWithin(30),
    newThisMonth: students.filter(s => s.created_at.slice(0, 7) === today.slice(0, 7)).length,
    byGrade,
    days: Array.from({ length: 14 }, (_, i) => {
      const d = shift(today, i - 13)
      return { date: d, attendance: attendance.filter(r => r.date === d).length, practiced: enabled.filter(s => practiced.get(s.id)?.has(d)).length }
    }),
  }
}

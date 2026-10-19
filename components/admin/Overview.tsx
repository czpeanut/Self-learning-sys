'use client'

// ERP 總覽：使用中的學生數、現在在館、近 14 天到館／練習人數、待完成檢測、通知管道
import { Tile } from '@/components/ui'
import type { Usage } from '@/lib/erp-stats'
import { hm } from './api'

export type OverviewData = {
  me: { role: 'admin' | 'teacher'; email: string | null; name: string | null }
  today: string
  usage: Usage
  inCenter: { name: string; seat: string | null; since: string }[]
  pendingTests: number
  channels: { line: boolean; lineWebhook: boolean; email: boolean }
}

export default function Overview({ d }: { d: OverviewData }) {
  const u = d.usage
  const max = Math.max(1, ...u.days.map(x => Math.max(x.attendance, x.practiced)))
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="使用中的學生" value={u.enabled} sub={`帳號共 ${u.total} 個 · 本月新增 ${u.newThisMonth}`} />
        <Tile label="現在在館" value={u.inCenter} sub={`今天到館 ${u.checkedInToday} 人`} />
        <Tile label="今天有練習" value={u.practicedToday} sub="人" />
        <Tile label="近 7 天活躍" value={u.active7} sub={`近 30 天 ${u.active30} 人（到館或練習）`} />
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_280px]">
        <section className="card p-5">
          <h2 className="font-semibold">近 14 天</h2>
          <div className="mt-1 flex gap-4 text-xs text-ink-muted">
            <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--viz-series-1)' }} />到館人數</span>
            <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--viz-series-2)' }} />有練習人數</span>
          </div>
          <div className="mt-3 flex h-40 items-end gap-1.5">
            {u.days.map(x => (
              <div key={x.date} className="flex flex-1 flex-col items-center gap-1" title={`${x.date}：到館 ${x.attendance}、練習 ${x.practiced}`}>
                <div className="flex h-32 w-full items-end justify-center gap-0.5">
                  <div className="w-1/2 rounded-t" style={{ height: `${(x.attendance / max) * 100}%`, background: 'var(--viz-series-1)' }} />
                  <div className="w-1/2 rounded-t" style={{ height: `${(x.practiced / max) * 100}%`, background: 'var(--viz-series-2)' }} />
                </div>
                <div className="text-[10px] text-ink-muted">{Number(x.date.slice(8))}</div>
              </div>
            ))}
          </div>
        </section>
        <section className="card p-5">
          <h2 className="font-semibold">現在在館（{d.inCenter.length}）</h2>
          {d.inCenter.length === 0 ? <p className="mt-2 text-sm text-ink-muted">目前沒有人在館</p> : (
            <ul className="mt-2 divide-y divide-black/5 text-sm">
              {d.inCenter.map((x, i) => <li key={i} className="flex justify-between py-1.5"><span>{x.name}{x.seat && <span className="ml-1 text-xs text-ink-muted">座位 {x.seat}</span>}</span><span className="tabular-nums text-ink-soft">{hm(x.since)} 到館</span></li>)}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="card p-5 text-sm">
          <h2 className="font-semibold">年級分布</h2>
          <ul className="mt-2 space-y-1">{Object.entries(u.byGrade).sort().map(([g, n]) => <li key={g} className="flex justify-between"><span>{g}</span><span className="tabular-nums">{n} 人</span></li>)}</ul>
        </section>
        <section className="card p-5 text-sm">
          <h2 className="font-semibold">程度檢測</h2>
          <p className="mt-2">還沒交卷：<b>{d.pendingTests}</b> 份</p>
        </section>
        <section className="card p-5 text-sm">
          <h2 className="font-semibold">家長通知管道</h2>
          <ul className="mt-2 space-y-1">
            <li>{d.channels.line ? '✅' : '⬜'} LINE 官方帳號{d.channels.line && !d.channels.lineWebhook && '（缺 Channel secret，家長無法自行綁定）'}</li>
            <li>{d.channels.email ? '✅' : '⬜'} Email</li>
          </ul>
          {!d.channels.line && !d.channels.email && <p className="mt-2 text-xs text-amber-800">還沒設定任何通知管道，設定方式見 docs/ERP.md</p>}
        </section>
      </div>
    </div>
  )
}

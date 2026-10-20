'use client'

// ERP 總覽：使用中的學生數、現在在館、近 14 天到館／練習人數、待完成檢測、通知管道
import type { Usage } from '@/lib/erp-stats'
import { Icon } from '@/components/brand'
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
      {/* 四張漸層數字卡 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          { n: u.enabled, cap: '使用中的學生', sub: `帳號共 ${u.total} 個 · 本月新增 ${u.newThisMonth}`, color: 'lime', icon: 'user' },
          { n: u.inCenter, cap: '現在在館', sub: `今天到館 ${u.checkedInToday} 人`, color: 'sky', icon: 'home' },
          { n: u.practicedToday, cap: '今天有練習', sub: '人', color: 'violet', icon: 'chart' },
          { n: u.active7, cap: '近 7 天活躍', sub: `近 30 天 ${u.active30} 人（到館或練習）`, color: 'pink', icon: 'pulse' },
        ] as const).map(x => (
          <div key={x.cap} className={`t-${x.color} relative overflow-hidden p-4 ${x.color === 'lime' ? 'text-ink' : 'text-white'}`}
            style={{ background: 'var(--tile)', borderRadius: '24px 6px 24px 24px', boxShadow: '0 14px 30px -14px var(--glow)' }}>
            <div aria-hidden className="absolute -bottom-10 -right-6 h-28 w-28 rotate-45 rounded-[26px] bg-white/15" />
            <div className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center bg-white/25 leaf-sm"><Icon name={x.icon} size={19} /></div>
            <div className="relative text-[13px] font-bold opacity-90">{x.cap}</div>
            <div className="relative font-head text-[40px] font-bold leading-tight tabular-nums">{x.n}</div>
            <div className="relative text-xs opacity-90">{x.sub}</div>
          </div>
        ))}
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
                  <div className="w-1/2" style={{ height: `${(x.attendance / max) * 100}%`, background: 'linear-gradient(180deg, #7a95ff, #3b4fff)', borderRadius: '6px 2px 0 0' }} />
                  <div className="w-1/2" style={{ height: `${(x.practiced / max) * 100}%`, background: 'linear-gradient(180deg, #ffc06b, #ff6a3d)', borderRadius: '6px 2px 0 0' }} />
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

'use client'

// ⚠️ 此檔為 czpeanut/student-app 的 components/SolutionView.tsx 快照（commit 59e1270），請勿單邊修改；student-app 更新時整份重新複製。

import MathText from './MathText'
import GeometryFigure, { parseFigure } from './GeometryFigure'

/**
 * 渲染 AI 詳解：把 ```figure {...}``` 幾何圖形區塊抽出來，固定擺在「思路」與「步驟」之間
 * （即「步驟」標題之前）；其餘文字交給 MathText（KaTeX）。
 */
const FIG_RE = /```figure\s*([\s\S]*?)```/g
const STEP_RE = /\*\*\s*步驟\s*\*\*/   // 「步驟」標題

export default function SolutionView({
  children, className, figureSize,
}: { children: string | null | undefined; className?: string; figureSize?: number }) {
  const text = children ?? ''

  // 抽出所有圖形區塊，並得到移除圖塊後的純文字
  const figures: string[] = []
  const cleaned = text.replace(FIG_RE, (_full, body: string) => { figures.push(body); return '' })
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const specs = figures.map(parseFigure).filter(Boolean) as NonNullable<ReturnType<typeof parseFigure>>[]

  // 沒有圖：直接整段渲染
  if (specs.length === 0) {
    return <MathText className={className}>{cleaned || text}</MathText>
  }

  // 在「步驟」標題前切開，圖插在中間
  const m = cleaned.match(STEP_RE)
  const cut = m && m.index != null ? m.index : cleaned.length
  const before = cleaned.slice(0, cut).trim()
  const after  = cleaned.slice(cut).trim()

  return (
    <>
      {before && <MathText className={className}>{before}</MathText>}
      {specs.map((spec, i) => (
        <div key={i} className="my-2 flex justify-center">
          <GeometryFigure spec={spec} size={figureSize} />
        </div>
      ))}
      {after && <MathText className={className}>{after}</MathText>}
    </>
  )
}

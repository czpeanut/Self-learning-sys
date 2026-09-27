#!/usr/bin/env bash
# 檢查沿用自 student-app 的模組是否與來源一致（去掉本專案加的快照註解行後比對）
# 用法：npm run sync:check [student-app 路徑，預設 ../student-app]
set -u
SRC="${1:-../student-app}"
[ -d "$SRC" ] || { echo "找不到 student-app：$SRC"; exit 2; }
fail=0
check() {  # $1 本專案檔案、$2 來源檔案、$3 本專案檔頭要略過的行數（預設 0）
  if diff -qB <(tail -n +"$(( ${3:-0} + 1 ))" "$1" | grep -v '快照（commit') "$SRC/$2" >/dev/null; then echo "✓ $1"; else echo "✗ $1 與 student-app/$2 不同"; fail=1; fi
}
check lib/gemini.ts lib/gemini.ts
check components/MathText.tsx components/MathText.tsx
check components/SolutionView.tsx components/SolutionView.tsx
check components/GeometryFigure.tsx components/GeometryFigure.tsx
check lib/taxonomy.ts lib/taxonomy.ts 4
# 解題提示詞：比對 lib/solve.ts 內的提示詞與函式是否仍出現在來源 route 中
node -e '
const fs=require("fs");const src=fs.readFileSync(process.argv[1]+"/app/api/solve/route.ts","utf8");const mine=fs.readFileSync("lib/solve.ts","utf8");
const a=mine.indexOf("科目：${subject");const b=mine.indexOf("`\n  return prompt");
const prompt=mine.slice(a,b).split("\n").map(l=>l.trim()).join("\n");
const srcFlat=src.split("\n").map(l=>l.trim()).join("\n");
const fn=mine.slice(mine.indexOf("function buildSubjectConstraints")).replace("export ","").split("\n").map(l=>l.trim()).join("\n").trim();
const ok1=srcFlat.includes(prompt), ok2=srcFlat.includes(fn.slice(0, fn.lastIndexOf("}")));
console.log((ok1?"✓":"✗")+" lib/solve.ts 解題提示詞");console.log((ok2?"✓":"✗")+" lib/solve.ts 科目限制");process.exit(ok1&&ok2?0:1)
' "$SRC" || fail=1
exit $fail

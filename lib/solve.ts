// AI 解題（詳解＋幾何輔助圖）
// ⚠️ 提示詞、答案擷取、科目限制完全沿用 czpeanut/student-app `app/api/solve/route.ts` 的 action: 'solve'（commit 59e1270），
//    由程式從原檔擷取，請勿單邊修改；student-app 調整解題提示詞時，重新同步這一段。
//    詳解中的 ```figure``` 區塊由 components/SolutionView + GeometryFigure（同為 student-app 快照）渲染。

/** 詳解模型：沿用 student-app 實測結論——3.7-flash 產生的幾何圖與詳解一致且座標正確 */
export const SOLVE_MODEL = process.env.GEMINI_SOLVE_MODEL?.trim() || 'gemini-3.7-flash'
export const SOLVE_THINKING_BUDGET = 4096

/** 產生與 student-app 完全相同的解題提示詞 */
export function buildSolvePrompt(subject: string, chapter: string, questionText: string): string {
  const body = { question_text: questionText }
  const subjectConstraints = buildSubjectConstraints(subject, chapter)
  const prompt = `科目：${subject || '未指定'}${chapter ? `　章節：${chapter}` : ''}

題目：
${body.question_text}

限制：
${subjectConstraints}

你是在幫台灣國中生講解，讀者是 13~15 歲的學生。請像老師在黑板前講重點一樣：簡短、白話、好懂。

用繁體中文，嚴格照以下格式輸出，不要加任何前言或結語：

**思路**
一句話點出關鍵想法（30 字以內）。

**步驟**
1. （關鍵算式，數學公式用 $...$ 包住）
2. （下一步）
（最多 4 步，每步一行）

**答案**
（直接寫答案）

寫作要求（很重要）：
- **文字總量控制在 200 字以內**（不含公式）。講清楚就停：不要補充延伸說明、不要重述題目、不要寫結論段。
- 用國中生聽得懂的白話，不要學術腔，不要出現超出國中程度的術語或符號。
- 只寫「非寫不可」的算式；連續計算請串成一行（如 $面積=\frac{1}{2}\times 8\times 8=32$），不要每行重複等號左邊，也不要把一條算式拆成好幾行。
- 能合併的步驟就合併，不要為了湊步驟而分點。

${subject === '數學'
  ? `若本題屬於「幾何、坐標幾何、平面/立體圖形」類且附圖有助理解，請在最後**額外**附上一個圖形區塊（非幾何題請完全省略，不要硬畫）。用三個反引號加 figure，區塊內只放一段 JSON（不要在裡面寫文字說明）：
\`\`\`figure
{
  "points": [{"name":"A","x":0,"y":0}, {"name":"B","x":4,"y":0}, {"name":"C","x":0,"y":3}],
  "segments": [{"from":"A","to":"B"}, {"from":"B","to":"C"}, {"from":"C","to":"A"}],
  "rightAngles": [{"at":"A","from":"B","to":"C"}],
  "segLabels": [{"on":"A-B","text":"4"}, {"on":"A-C","text":"3"}, {"on":"B-C","text":"5"}],
  "circles": [{"center":"O","through":"A"}],
  "angles": [{"at":"B","from":"A","to":"C","label":"θ"}]
}
\`\`\`
**最重要：figure 裡的座標只是「為了把圖畫準」的內部繪圖工具，不代表這題要用座標方法解。**
- 解題方法要符合題目本質：若是純幾何題（全等、相似、畢氏、角度、平行、圓性質、面積…），就用**純幾何觀念**解，**不要**在文字詳解裡建立座標系、不要寫出點的座標、不要用座標公式（距離公式、斜率…）。能不用座標就不用。
- 只有當題目「本身就是坐標幾何題」（已給座標、或要求在坐標平面上作答）時，才用座標方法解題。
- 對應到圖：純幾何題的 points 仍要給座標（畫圖需要），但 **showCoord 一律省略/false**，改用點名稱(A、B、C)＋ segLabels 標出已知邊長與條件；唯有坐標幾何題才用 showCoord:true 標出座標。
圖形規則：
- 座標必須與題目條件完全一致（邊長、垂直、平行、比例、角度都要正確）。
- from/to/center/through/at 一律參照 points 內定義過的 name。
- points 為必填；circles 可用 r 或 through；rightAngles 畫直角；angles 畫角弧與標記；segLabels 標邊長/已知量。
- **輔助線一定要畫出來**：只要詳解過程中作了輔助線（斜邊上的高、中線、中垂線、角平分線、延長線、對角線、切線、半徑、連線…），就必須加進 figure，並用 "dashed": true 與原本的邊區別。需要的垂足或交點要新增成 point 並命名（例如斜邊上的高，垂足取名 H），垂直處用 rightAngles 標直角，必要時用 segLabels 標出該輔助線代表的量（如高 h）。圖要和文字詳解一致——詳解提到的線，圖上都看得到。
- 只放必要元素，不確定就不要放該欄位。`
  : ''}`
  return prompt
}

/**
 * 從詳解文字抽出「**答案**」段的內容（到下一個 **標題** 或 figure 區塊或結尾為止）。
 * 用來把較可靠的詳解答案回寫覆蓋辨識時的簡答。
 */
export function extractAnswer(solution: string): string | null {
  const m = solution.match(/\*\*\s*答案\s*\*\*\s*\n?([\s\S]*?)(?:\n\s*\*\*|```|$)/)
  if (!m) return null
  const ans = m[1].trim().replace(/^[（(]?直接寫答案[)）]?$/, '').trim()
  return ans || null
}

/**
 * 根據科目與章節，生成對應的「解題限制」提示詞
 * 確保 AI 只用課內已教、符合該章節程度的方法解題
 */
export function buildSubjectConstraints(subject: string, chapter: string): string {
  const base = [
    '只能使用台灣國中課綱內、在此章節之前（含本章）已經教過的概念與方法。',
    '絕對不可使用後續章節尚未教到的知識（例如：不可用高中才教的方法）。',
    '解題方法必須是本章節學生能理解的方式，用白話說明，不用艱深術語。',
  ]

  const mathRules: Record<string, string[]> = {
    '整數與分數': ['只能用整數四則運算、分數通分、約分。不可用方程式或未知數。'],
    '比與比例式': ['只能用比的性質、比例式交叉相乘。不可用方程式解法（除非已在本章介紹）。'],
    '一元一次方程式': ['只能用移項、等量公理解方程式。不可用二次公式或聯立方程。'],
    '二元一次聯立方程式': ['只能用代入消去法或加減消去法。不可用矩陣或克萊姆法則。'],
    '一元二次方程式': ['只能用因式分解、配方法、公式解（若已教）。不可用微積分或進階代數。'],
    '不等式': ['只能用不等式基本性質移項。不可用絕對值進階技巧（除非本章已教）。'],
    '多項式': ['只能用提公因式、乘法公式展開。不可用長除法（除非本章已教）。'],
    '平面圖形': ['只能用面積公式、周長公式。不可用三角函數或向量。'],
    '立體圖形': ['只能用體積、表面積公式。不可用積分。'],
    '勾股定理': ['只能用畢氏定理 a²+b²=c²。不可用三角函數（sin/cos/tan）。'],
    '相似形': ['只能用相似比、對應角相等。不可用三角比。'],
    '三角形的基本性質': ['只能用內角和、外角定理。不可用三角函數或向量。'],
    '統計': ['只能用平均數、中位數、眾數、範圍。不可用標準差（除非本章已教）。'],
    '機率': ['只能用基本機率公式 P=m/n。不可用排列組合公式（除非本章已教）。'],
    '數列': ['只能用等差數列公式。不可用等比數列（若尚未教）。'],
    '函數': ['只能用函數定義與代入求值。不可用導數或極值。'],
    '一次函數': ['只能用 y=mx+b 與座標平面。不可用二次函數或向量。'],
    '二次函數': ['只能用配方法求頂點、代入法求根。不可用微分。'],
    '圓': ['只能用圓的基本性質（圓心角、弦、切線）。不可用三角函數求弧長（除非本章已教）。'],
  }

  const scienceRules: Record<string, string[]> = {
    // 理化
    '物質的組成': ['只能用粒子模型概念。不可使用化學式方程式（除非本章已教）。'],
    '化學反應': ['只能用質量守恆、基本化學方程式配平。不可用氧化還原半反應式。'],
    '酸鹼鹽': ['只能用 pH 概念、酸鹼指示劑、中和反應。不可用 Ka/Kb 平衡常數。'],
    '運動與力': ['只能用速度=距離/時間、牛頓第二定律 F=ma、摩擦力基本概念。不可用微積分求加速度、不可用能量方法取代力學分析（除非本章已教）。'],
    '功與能': ['只能用功=力×位移、動能=½mv²、位能=mgh、能量守恆。不可用積分。'],
    '電與磁': ['只能用歐姆定律 V=IR、串並聯電路公式。不可用向量電磁場分析。'],
    '波動與光': ['只能用波速=頻率×波長、反射折射定律。不可用惠更斯原理或相對論。'],
    // 生物
    '細胞': ['只能用細胞基本構造與功能描述。不可用分子生物學（DNA複製機制細節）。'],
    '遺傳': ['只能用孟德爾遺傳定律、表現型與基因型、龐納特方格。不可用連鎖遺傳、不可用 Hardy-Weinberg。'],
    '演化': ['只能用天擇、適應概念。不可用族群遺傳學公式。'],
    // 地球科學
    '天氣': ['只能用氣壓、風向、鋒面基本概念。不可用熱力學方程式。'],
    '地震與板塊': ['只能用板塊構造論、規模與烈度概念。不可用地震波方程式。'],
  }

  const extra: string[] = []

  if (['數學'].includes(subject)) {
    // 找最匹配的章節規則
    for (const [key, rules] of Object.entries(mathRules)) {
      if (chapter.includes(key) || key.includes(chapter.replace(/[（）()第一二三四五六七八九十章節]/g, ''))) {
        extra.push(...rules)
        break
      }
    }
    extra.push('只寫關鍵算式，連續計算用連等式串成一行，不要每行重複等號左邊、不要把一條算式拆成多行。')
  }

  if (['理化', '生物', '地球科學'].includes(subject)) {
    for (const [key, rules] of Object.entries(scienceRules)) {
      if (chapter.includes(key) || key.includes(chapter.replace(/[（）()第一二三四五六七八九十章節]/g, ''))) {
        extra.push(...rules)
        break
      }
    }
    extra.push('先寫出公式再代入數字，但一行寫完即可。')
    extra.push('物理量須標明單位。')
  }

  if (['國文', '英文'].includes(subject)) {
    extra.push('解析方式以國中程度的文法概念為主，不使用大學語言學術語。')
    extra.push('英文題目的文法解析請使用國中課綱內出現過的文法點（時態、句型）。')
  }

  if (['歷史', '地理', '公民'].includes(subject)) {
    extra.push('以教科書中已出現的史實、地理概念、公民知識作答，不引用超綱資料。')
  }

  return [...base, ...extra].map((r, i) => `${i + 1}. ${r}`).join('\n')
}

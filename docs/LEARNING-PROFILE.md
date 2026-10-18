# 學習行為剖析模型

從學生的**錯題量、作答速度、錯的題型**（加上把握度、提示與 AI 講解的使用、練習時間分布），推估學習習慣與模式，
並給出有研究依據的改善建議。程式：`lib/learning-profile.ts`（純函式）、資料收集 `lib/profile-data.ts`、頁面 `/habits`。

> 原則：這是**作答行為的觀察，不是診斷或人格標籤**。每個指標都有最低資料量，不足就不下判斷；
> 建議一律歸因於「策略」（可以改的做法），不歸因於「能力」或「個性」。

## 一、研究基礎

| # | 研究 | 核心發現 | 在模型中的用途 |
|---|---|---|---|
| 1 | Kagan（1965）沉思型／衝動型（Matching Familiar Figures Test） | 作答快且錯多＝衝動型；慢而正確＝沉思型 | 「作答節奏」四象限：速度 × 正確率 |
| 2 | Wise & Kong（2005）Response Time Effort；Wise & Ma（2012）常模門檻 NT10 | 作答時間低於門檻的「快速猜題」正確率接近亂猜，代表沒有投入；門檻常用平均作答時間的 10% | 「快速猜題」比例；作答過快時提醒 |
| 3 | Reason（1990）Human Error | 會做卻做錯的「疏失（slip）」與方法錯誤的「錯誤（mistake）」成因與處理方式不同 | 錯題分成「會做卻錯」與「同題型反覆錯」 |
| 4 | Brown & Burton（1978）BUGGY，Cognitive Science 2:155–192 | 同類題反覆錯在同一處，是學生有一套錯誤的程序（bug），不是粗心 | 系統性錯誤判定 → 建議看講解、補基礎而不是刷題 |
| 5 | Rabbitt（1966）錯後放慢（post-error slowing） | 人答錯後通常會放慢，反映錯誤監控與調整；後續研究另有錯後正確率提升等調整 | 「答錯後的調整」：比較答錯後與答對後下一題的作答時間 |
| 6 | Beck & Gong（2013）Wheel-Spinning，AIED 2013 | 練約 10 次仍未精熟的學生，再多練也幾乎沒幫助，需要不同的介入 | 「原地打轉的題型」：同題型 ≥10 次、最近 5 題正確率 <60% |
| 7 | Butterfield & Metcalfe（2001）高把握錯誤的超矯正（hypercorrection） | 很有把握卻答錯的題目，得到回饋後最容易被訂正 | 「自我評估」：高把握錯誤率；建議優先檢討這類題目 |
| 8 | Aleven 等（2006）求助模型；Baker 等（2004）gaming the system | 濫用提示（不需要也看）與迴避求助（需要卻不看）都會降低學習 | 「求助方式」：看提示比例、錯題請 AI 講解的比例 |
| 9 | Dunlosky 等（2013）Improving Students’ Learning，PSPI 14(1) | 十種方法中「練習測驗」與「分散練習」效益最高；重讀、畫重點效益低 | 「練習分布」：近 14 天練習天數、單日集中度；錯題按時複習 |
| 10 | Rohrer & Taylor（2007）Instructional Science 35 | 數學題型混合練習當下較難，但一週後的測驗遠勝分題型練習 | 「題型混合」：單一題型練習的比例 |
| 11 | Meichenbaum & Goodman（1971）自我教導訓練 | 教衝動型孩子作答前用固定步驟提醒自己，可提高正確率；單純要求放慢則不一定有效（Kagan 構念的後續批評） | 衝動型的介入：「冷靜作答」檢查口訣，而不只是強制等待 |
| 12 | 持續作業的警覺度下降（vigilance decrement） | 長時間作業後段表現下滑，分段休息可緩解 | 「長時間作答的穩定度」：前 1/3 與後 1/3 正確率比較 |

## 二、指標與門檻

參考作答時間（國中單選題的保守估計，之後用全體學生的實際中位數校正）：基礎 40 秒、標準 70 秒、進階 110 秒。

| 指標 | 計算 | 最低資料量 | 判斷 |
|---|---|---|---|
| 作答節奏 | 認真作答題目的「作答時間 ÷ 參考時間」中位數、正確率 | 20 題 | 快＜0.5 倍、慢＞1.3 倍；準 ≥70%、錯多＜60% → 四象限 |
| 快速猜題 | 作答時間 < max(3 秒, 參考時間 10%) 的比例 | 20 題 | ≥10% 需要調整、≥5% 留意 |
| 錯在哪裡 | 錯題中：該題型正確率 ≥75%（會做卻錯）vs 該題型錯 ≥3 次且正確率 <50%（反覆錯） | 8 道錯題 | 任一類 ≥40% 為主要類型 |
| 答錯後的調整 | 答錯後下一題 ÷ 答對後下一題的相對作答時間（中位數） | 各 5 次 | <0.9 需要調整、<1.05 留意 |
| 連錯傾向 | P(錯｜前題錯) − P(錯｜前題對) | 各 10 次 | ≥0.2 需要調整、≥0.1 留意 |
| 長時間作答的穩定度 | 12 題以上的練習：前 1/3 與後 1/3 正確率差 | 2 次 | 下滑 ≥15 點需要調整、≥8 點留意 |
| 自我評估 | 「有把握」題目的錯誤率；「沒把握」題目的正確率 | 10 題有把握 | 高把握錯誤 ≥25% → 高估；沒把握卻答對 ≥70% → 低估 |
| 求助方式 | 看提示比例；錯題請 AI 講解的次數 ÷ 錯題數 | 20 題 | 提示 ≥50% → 濫用；錯 ≥10 題且講解 <10%、提示 <5% → 迴避 |
| 原地打轉 | 同題型 ≥10 次，最近 5 題正確率 <60% | — | 有任一題型即需要調整 |
| 練習分布 | 近 14 天練習天數、單日最大占比 | 30 題 | 單日 ≥60% 或 ≤2 天 → 集中衝刺 |
| 題型混合 | 5 題以上的練習中只有單一題型的比例 | 3 次 | ≥60% 留意 |
| 錯題複習、專注 | 到期超過 2 天未複習的錯題；每 25 分鐘分心次數 | 5 題／50 分鐘 | 過期 ≥10 題、分心 ≥2 次需要調整 |

## 三、作答模式

由指標組合而成，可同時出現多個，依強度排序：

| 模式 | 條件 | 主要建議 |
|---|---|---|
| 衝動型作答 | 快但錯多；或「會做卻錯」≥40% 且答錯後不放慢 | 作答前檢查口訣（自動開啟「冷靜作答」） |
| 觀念缺口型 | 慢且錯多；或「反覆錯」≥40%；或有原地打轉的題型 | 停止刷題，看 AI 講解、補基礎題後再回到原難度 |
| 投入不足 | 快速猜題 ≥10% | 縮短每次題量、不會就看提示而不是亂猜 |
| 高估自己 | 高把握錯誤 ≥25% | 優先檢討「有把握卻錯」的題目 |
| 穩健但偏慢 | 慢而準確 | 在正確的基礎上練速度 |
| 容易受挫連錯 | 連錯傾向 ≥0.2 | 答錯後停 10 秒、看完詳解再往下 |
| 後段失速 | 後 1/3 正確率下滑 ≥15 點 | 番茄鐘分段 |
| 集中衝刺型 | 練習集中在少數幾天 | 每天少量、分散練習 |
| 流暢熟練 | 快又準確，且沒有需要調整的模式 | 提高難度 |

## 四、系統裡的介入

- **冷靜作答**（`/habits` 可設定自動／開啟／關閉）：偵測到衝動型作答時自動開啟。送出前顯示三步檢查口訣，題目出現 5 秒後才能送出。
  依據 Meichenbaum & Goodman（1971）：重點是「自我檢查的步驟」，等待時間只是讓學生有空做檢查。
- **作答過快提醒**（一直開啟）：3 秒內送出會先提醒「要不要再看一次題目」，再按一次才送出（快速猜題門檻）。
- **家長日報**：顯示前 3 個作答模式，以及給家長的溝通方式（不排名、不貼標籤）。
- 既有機制本來就符合研究：錯題 Leitner 間隔複習（分散練習）、「針對缺口練習」自動混合題型（交錯練習）、引擎依上一波表現調整難度。

## 五、限制

- 參考作答時間是估計值；題目長度、科目差異很大（國文閱讀題會比計算題慢），正式版應改用全體學生每個題型的作答時間中位數。
- 作答時間包含發呆、離開座位；「快速猜題」與「答錯後放慢」對這類雜訊敏感，所以都用中位數並設最低資料量。
- Kagan 的節奏構念有方法學批評（速度與正確率在計分上互相影響），所以本模型把四象限當「描述」，介入採用效果較一致的自我教導。
- 把握度由學生自己標示，有人習慣全按「有把握」，自我評估指標要搭配其他指標看。
- 這些門檻是依研究精神訂的起始值，累積真實資料後應以學生後續成績（段考、準備度變化）驗證並調整。

## 參考文獻

- Aleven, V., McLaren, B., Roll, I., & Koedinger, K. (2006). Toward meta-cognitive tutoring: A model of help seeking with a Cognitive Tutor. *IJAIED, 16*(2), 101–128.
- Baker, R. S., Corbett, A. T., & Koedinger, K. R. (2004). Detecting student misuse of intelligent tutoring systems. *ITS 2004*, LNCS 3220, 531–540.
- Beck, J. E., & Gong, Y. (2013). Wheel-spinning: Students who fail to master a skill. *AIED 2013*, 431–440.
- Brown, J. S., & Burton, R. R. (1978). Diagnostic models for procedural bugs in basic mathematical skills. *Cognitive Science, 2*, 155–192.
- Butterfield, B., & Metcalfe, J. (2001). Errors committed with high confidence are hypercorrected. *JEP: LMC, 27*(6), 1491–1494.
- Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). Improving students’ learning with effective learning techniques. *Psychological Science in the Public Interest, 14*(1), 4–58.
- Kagan, J. (1965). Individual differences in the resolution of response uncertainty. *JPSP, 2*, 154–160.（MFFT 與沉思／衝動型）
- Meichenbaum, D. H., & Goodman, J. (1971). Training impulsive children to talk to themselves. *Journal of Abnormal Psychology, 77*(2), 115–126.
- Rabbitt, P. M. (1966). Errors and error correction in choice-response tasks. *Journal of Experimental Psychology, 71*(2), 264–272.
- Reason, J. (1990). *Human Error.* Cambridge University Press.
- Rohrer, D., & Taylor, K. (2007). The shuffling of mathematics problems improves learning. *Instructional Science, 35*, 481–498.
- Wise, S. L., & Kong, X. (2005). Response time effort: A new measure of examinee motivation in computer-based tests. *Applied Measurement in Education, 18*(2), 163–183.
- Wise, S. L., & Ma, L. (2012). Setting response time thresholds for a CAT item pool: The normative threshold method. NCME 年會。

/** 摘要顯示用：拿掉 ```figure``` 圖形區塊（完整顯示請用 SolutionView 畫出圖） */
export const stripFigure = (s: string) => s.replace(/```figure[\s\S]*?```/g, '［圖］').trim()

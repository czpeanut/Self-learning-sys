// 相容層：student-app 的元件（GeometryFigure 等）從 '@/lib/quiz' 匯入 safeJsonParse，
// 保留這個路徑讓快照檔可以原封不動複製過來。
export { safeJsonParse, sanitizeJsonString } from './json'

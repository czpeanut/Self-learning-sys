import { NextResponse } from 'next/server'
import { GEN_MODEL, hasGemini } from '@/lib/gemini'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ ai: hasGemini(), model: hasGemini() ? GEN_MODEL : null })
}

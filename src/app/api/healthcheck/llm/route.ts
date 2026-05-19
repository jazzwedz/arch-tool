import { NextResponse } from "next/server"
import {
  getLLM,
  getLLMProviderName,
  isLLMConfigured,
  LLM_DISABLED_MESSAGE,
} from "@/lib/llm"

// POST — live-probe the configured LLM provider with a tiny 1-token
// completion. Returns the provider name, model in use, latency, and any
// error message. The cost of a single 1-token call is negligible.
export async function POST() {
  const provider = getLLMProviderName()
  const startedAt = Date.now()

  if (!isLLMConfigured()) {
    return NextResponse.json({
      ok: false,
      provider,
      elapsedMs: 0,
      error: LLM_DISABLED_MESSAGE,
    })
  }

  try {
    const llm = await getLLM()
    await llm.complete({ prompt: "Hi", maxTokens: 1 })
    return NextResponse.json({
      ok: true,
      provider,
      model: llm.model,
      elapsedMs: Date.now() - startedAt,
    })
  } catch (error: unknown) {
    return NextResponse.json({
      ok: false,
      provider,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

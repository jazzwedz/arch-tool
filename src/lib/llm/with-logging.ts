// Decorator that wraps any LLMProvider so every complete() call
// produces a structured llm_call log entry — full prompt + response
// when LLM_LOG_FULL=true (default), summary metadata only when
// LLM_LOG_FULL=summary. Failures are still logged with the error
// message and the latency, so an admin can grep for slow / failing
// calls in the Admin console.
//
// The wrapper preserves describe() and probe() — diagnostics keep
// their pre-LLM probe semantics, no double round-trip.

import type { LLMProvider, LLMCompleteOptions } from "./types"
import type { ProbeTrace } from "../diagnostics"
import { getLogger } from "../log"

export function withLogging(inner: LLMProvider): LLMProvider {
  const log = getLogger()
  return {
    name: inner.name,
    model: inner.model,
    describe: () => inner.describe(),
    probe: (): Promise<ProbeTrace> => inner.probe(),
    async complete(opts: LLMCompleteOptions): Promise<string> {
      const startedAt = Date.now()
      try {
        const response = await inner.complete(opts)
        log.llmCall({
          provider: inner.name,
          model: inner.model,
          promptChars: opts.prompt.length,
          responseChars: response.length,
          latencyMs: Date.now() - startedAt,
          ok: true,
          prompt: opts.prompt,
          response,
        })
        return response
      } catch (err) {
        log.llmCall({
          provider: inner.name,
          model: inner.model,
          promptChars: opts.prompt.length,
          responseChars: 0,
          latencyMs: Date.now() - startedAt,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          prompt: opts.prompt,
        })
        throw err
      }
    },
  }
}

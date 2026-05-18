// Lazy Anthropic SDK initialization so the app can boot without
// ANTHROPIC_API_KEY set. AI-powered routes call isAnthropicConfigured()
// first and return a 503 with a clear message when the key is missing —
// the catalog, drawio builder, and Confluence Publish flow (forward-only,
// without AI patches) still work in that mode.

import Anthropic from "@anthropic-ai/sdk"

let _client: Anthropic | null = null

export function isAnthropicConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY
  return !!key && !key.includes("placeholder")
}

export function getAnthropicClient(): Anthropic {
  if (!isAnthropicConfigured()) {
    throw new Error(
      "AI features are not enabled — set ANTHROPIC_API_KEY to use Generate, Blast Radius memo and Pull-smart."
    )
  }
  if (!_client) _client = new Anthropic()
  return _client
}

export const AI_DISABLED_MESSAGE =
  "AI features are not enabled in this deployment. Set ANTHROPIC_API_KEY to use Generate, Blast Radius memo and Pull-smart."

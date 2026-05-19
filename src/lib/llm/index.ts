// LLM factory — selects a provider based on the LLM_PROVIDER env var.
//
//   LLM_PROVIDER=anthropic           → AnthropicProvider (default)
//   LLM_PROVIDER=openai-compatible   → OpenAICompatibleProvider
//     (also accepts: "openai" — same thing; the protocol, not the vendor)
//
// The OpenAI-compatible adapter covers any gateway that speaks the Chat
// Completions protocol: OpenAI native, Azure OpenAI, OpenRouter, Together,
// Groq, LiteLLM, Portkey, Cloudflare AI Gateway, Ollama, LM Studio, vllm.
//
// Model is read from `config.yaml` (`llm.model`) in the arch-data repo
// when present, with an env-var fallback (ANTHROPIC_MODEL or LLM_MODEL)
// and a hardcoded default. Provider type stays in env because changing it
// usually implies new secrets that also need a redeploy.

import { AnthropicProvider } from "./anthropic"
import { OpenAICompatibleProvider } from "./openai-compatible"
import type { LLMProvider } from "./types"
import { loadConfig } from "../config"

export type { LLMProvider, LLMCompleteOptions } from "./types"

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514"
const DEFAULT_OPENAI_MODEL = "gpt-4o"

let _provider: LLMProvider | null = null

export type LLMProviderName = "anthropic" | "openai-compatible"

export function getLLMProviderName(): LLMProviderName {
  const raw = (process.env.LLM_PROVIDER || "anthropic").toLowerCase().trim()
  if (raw === "openai" || raw === "openai-compatible") return "openai-compatible"
  return "anthropic"
}

export function isLLMConfigured(): boolean {
  const provider = getLLMProviderName()
  if (provider === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY
    return !!key && !key.includes("placeholder")
  }
  const baseUrl = process.env.LLM_BASE_URL
  const apiKey = process.env.LLM_API_KEY
  return !!baseUrl && !!apiKey
}

export const LLM_DISABLED_MESSAGE =
  "AI features are not enabled. Set ANTHROPIC_API_KEY, or LLM_PROVIDER=openai-compatible with LLM_BASE_URL and LLM_API_KEY (see .env.local.example)."

export async function getLLM(): Promise<LLMProvider> {
  if (_provider) return _provider

  const provider = getLLMProviderName()
  const config = await loadConfig()
  const configModel = config.llm?.model

  if (provider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey || apiKey.includes("placeholder")) {
      throw new Error(LLM_DISABLED_MESSAGE)
    }
    const model = configModel || process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL
    _provider = new AnthropicProvider({ apiKey, model })
    return _provider
  }

  const baseUrl = process.env.LLM_BASE_URL
  const apiKey = process.env.LLM_API_KEY
  if (!baseUrl || !apiKey) {
    throw new Error(LLM_DISABLED_MESSAGE)
  }
  const model = configModel || process.env.LLM_MODEL || DEFAULT_OPENAI_MODEL
  _provider = new OpenAICompatibleProvider({ baseUrl, apiKey, model })
  return _provider
}

// For tests / Settings page refresh after config or env change.
export function resetLLMProvider(): void {
  _provider = null
}

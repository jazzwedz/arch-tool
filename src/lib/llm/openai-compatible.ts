import type { LLMProvider, LLMCompleteOptions, LLMDescribe } from "./types"
import { maskSecret, runHttpProbe, type ProbeTrace } from "../diagnostics"

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>
  error?: { message?: string }
}

// OpenAI-compatible Chat Completions adapter.
// Works with any gateway or service that exposes the OpenAI Chat Completions
// protocol: OpenAI native, Azure OpenAI, OpenRouter, Together, Groq, LiteLLM,
// Portkey, Cloudflare AI Gateway, Ollama, LM Studio, vllm, etc.
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = "openai-compatible"
  readonly model: string
  private baseUrl: string
  private apiKey: string

  constructor(opts: { baseUrl: string; apiKey: string; model: string }) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "")
    this.apiKey = opts.apiKey
    this.model = opts.model
  }

  async complete(opts: LLMCompleteOptions): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: opts.maxTokens,
        messages: [{ role: "user", content: opts.prompt }],
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(
        `LLM request failed: ${res.status} ${res.statusText} — ${text.slice(0, 500)}`
      )
    }

    const data = (await res.json()) as ChatCompletionResponse
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      throw new Error(
        `LLM returned no content: ${JSON.stringify(data).slice(0, 500)}`
      )
    }
    return content
  }

  describe(): LLMDescribe {
    return {
      provider: "openai-compatible",
      baseUrl: this.baseUrl,
      model: this.model,
      authScheme: "Bearer",
      authHint: maskSecret(this.apiKey),
      endpointTemplate: "/chat/completions",
    }
  }

  async probe(): Promise<ProbeTrace> {
    return runHttpProbe({
      method: "POST",
      url: `${this.baseUrl}/chat/completions`,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1,
        messages: [{ role: "user", content: "Hi" }],
      }),
      providerLabel: "LLM gateway",
    })
  }
}

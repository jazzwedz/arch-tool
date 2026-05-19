import Anthropic from "@anthropic-ai/sdk"
import type { LLMProvider, LLMCompleteOptions } from "./types"

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic"
  readonly model: string
  private client: Anthropic

  constructor(opts: { apiKey: string; model: string }) {
    this.client = new Anthropic({ apiKey: opts.apiKey })
    this.model = opts.model
  }

  async complete(opts: LLMCompleteOptions): Promise<string> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: opts.maxTokens,
      messages: [{ role: "user", content: opts.prompt }],
    })
    return message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
  }
}

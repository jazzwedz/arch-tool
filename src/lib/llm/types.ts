export interface LLMCompleteOptions {
  prompt: string
  maxTokens: number
}

export interface LLMProvider {
  readonly name: string
  readonly model: string
  complete(opts: LLMCompleteOptions): Promise<string>
}

// src/domain/llm/types.ts

// Bir tamamlama isteğinin girdisi
export interface CompletionInput {
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
  temperature?: number;
}

// Bir tamamlama sonucunun çıktısı
export interface CompletionResult {
  text: string;
  model: string;
}

// Üst katmanın (UI/hook) bildiği TEK arayüz.
// Hangi provider olduğunu bilmez — adapter pattern'in kalbi bu.
export interface LLMProvider {
  readonly name: string;
  complete(input: CompletionInput): Promise<CompletionResult>;
}
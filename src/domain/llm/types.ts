// src/domain/llm/types.ts

// Input for a completion request
export interface CompletionInput {
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
  temperature?: number;
}

// Output of a completion request
export interface CompletionResult {
  text: string;
  model: string;
}

// The only interface the upper layer (UI/hook) knows about.
// It does not know which provider is in use; this is the heart of the adapter pattern.
export interface LLMProvider {
  readonly name: string;
  complete(input: CompletionInput): Promise<CompletionResult>;
}
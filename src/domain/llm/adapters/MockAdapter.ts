// src/domain/llm/adapters/MockAdapter.ts
import type { LLMProvider, CompletionInput, CompletionResult } from "../types.js";

// Gerçek API yerine sabit cevap dönen sahte provider.
// Mimariyi API key olmadan test etmeni sağlar.
export class MockAdapter implements LLMProvider {
  readonly name = "mock";

  async complete(input: CompletionInput): Promise<CompletionResult> {
    const lastMessage = input.messages[input.messages.length - 1]!;
    return {
      text: `Mock cevap: "${lastMessage.content}" sorusunu aldım.`,
      model: "mock-model-v1",
    };
  }
}
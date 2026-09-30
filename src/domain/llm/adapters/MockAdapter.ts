// src/domain/llm/adapters/MockAdapter.ts
import type { LLMProvider, CompletionInput, CompletionResult } from "../types.js";

// A mock provider that returns a fixed response instead of calling a real API.
// Lets you test the architecture without an API key.
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
// src/domain/llm/adapters/MockAdapter.ts
import type { LLMProvider, CompletionInput, CompletionResult } from "../types.js";

// A mock provider that returns a fixed response instead of calling a real API.
// Lets you test the architecture without an API key.
export class MockAdapter implements LLMProvider {
  readonly name = "mock";

  async complete(input: CompletionInput): Promise<CompletionResult> {
    return {
      text: mockAnswer(input),
      model: "mock-model-v1",
    };
  }

  // Streams the same fixed response word by word, with a short delay to mimic a real model.
  async *stream(input: CompletionInput): AsyncIterable<string> {
    for (const word of mockAnswer(input).split(/(?<= )/)) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      yield word;
    }
  }
}

function mockAnswer(input: CompletionInput): string {
  const lastMessage = input.messages.at(-1)!;
  return `Mock cevap: "${lastMessage.content}" sorusunu aldım.`;
}

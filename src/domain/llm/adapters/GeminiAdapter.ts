// src/domain/llm/adapters/GeminiAdapter.ts
import { GoogleGenAI } from "@google/genai";
import type { LLMProvider, CompletionInput, CompletionResult } from "../types.js";

// Gemini'yi bizim ortak LLMProvider arayüzümüze uyarlayan adapter.
export class GeminiAdapter implements LLMProvider {
  readonly name = "gemini";
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(apiKey: string, model = "gemini-3.6-flash") {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async complete(input: CompletionInput): Promise<CompletionResult> {
    const contents = input.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const config = input.system ? { systemInstruction: input.system } : undefined;
    const response = await this.client.models.generateContent({
      model: this.model,
      contents,
      ...(config ? { config } : {}),
    });

    return {
      text: response.text ?? "",
      model: this.model,
    };
  }
}

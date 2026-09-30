// src/domain/llm/ModelStrategy.ts
import type { LLMProvider } from "./types.js";
import { GeminiAdapter } from "./adapters/GeminiAdapter.js";

// Task type: how demanding is the task?
export type TaskType = "cheap" | "reasoning";

// The strategy selects which model to use based on the task type.
// The rule "simple task -> cheaper model, difficult task -> more capable model" lives here.
export class ModelStrategy {
  constructor(private apiKey: string) {}

  select(task: TaskType): LLMProvider {
    switch (task) {
      case "cheap":
        // Simple tasks: fast and inexpensive model
        return new GeminiAdapter(this.apiKey, "gemini-3.6-flash");
      case "reasoning":
        // Difficult tasks: more capable model
        return new GeminiAdapter(this.apiKey, "gemini-3.7-flash");
      default:
        throw new Error(`Bilinmeyen task tipi: ${task}`);
    }
  }
}
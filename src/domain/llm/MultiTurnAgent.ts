// src/domain/llm/MultiTurnAgent.ts
import type { LLMProvider, Message } from "./types.js";
import { insuranceTools, runTool } from "./tools.js";

const MAX_TURNS = 4;

// A multi-turn agent using the provider's native function calling.
// The model receives the tool definitions and returns structured tool calls;
// we run them, send the results back, and repeat until the model answers in text.
export class MultiTurnAgent {
  constructor(private readonly provider: LLMProvider) {}

  async run(userGoal: string): Promise<string> {
    const messages: Message[] = [{ role: "user", content: userGoal }];

    for (let turn = 0; turn < MAX_TURNS; turn += 1) {
      const response = await this.provider.complete({
        system:
          "Sen bir sigorta asistanısın. Kullanıcının hedefini çözmek için gerekirse araçları kullan. " +
          "Tüm bilgiler hazır olduğunda kullanıcıya doğrudan yanıt ver.",
        messages,
        tools: insuranceTools,
      });

      const toolCalls = response.toolCalls ?? [];
      if (toolCalls.length === 0) {
        return response.text.trim();
      }

      messages.push({ role: "assistant", content: response.text, toolCalls });

      for (const call of toolCalls) {
        console.log(`[Araç çağrısı]: ${call.name}(${JSON.stringify(call.args)})`);
        const toolResult = runTool(call.name, call.args);
        console.log("[Araç sonucu]:", toolResult);
        messages.push({
          role: "tool",
          name: call.name,
          content: toolResult,
          ...(call.id ? { toolCallId: call.id } : {}),
        });
      }
    }

    throw new Error("Araç çağrıları beklenen tur sayısında tamamlanamadı.");
  }
}

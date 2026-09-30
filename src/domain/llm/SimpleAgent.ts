// src/domain/llm/SimpleAgent.ts
import type { LLMProvider } from "./types.js";
import { getPolicyInfo } from "./tools.js";

// A simplified agent: introduces a tool to the AI, lets the AI decide,
// and, if needed, runs the tool and sends the result back to the AI.
export class SimpleAgent {
  constructor(private provider: LLMProvider) {}

  async run(userGoal: string): Promise<string> {
    // --- TURN 1: Introduce the goal and tool to the AI ---
    const firstResponse = await this.provider.complete({
      system:
        "Sen bir sigorta asistanısın. Poliçe bilgisi gerekirse, SADECE şu formatta yanıt ver: " +
        "TOOL:getPolicyInfo:<poliçe_numarası>\n" +
        "Eğer araç gerekmiyorsa doğrudan cevap ver.",
      messages: [{ role: "user", content: userGoal }],
    });

    const aiDecision = firstResponse.text.trim();
    console.log("[AI'ın kararı]:", aiDecision);

    // --- Does the AI want to call a tool? ---
    if (aiDecision.startsWith("TOOL:getPolicyInfo:")) {
      // Extract the policy number
      const policyNumber = aiDecision.split(":")[2]?.trim() ?? "";

      // RUN THE TOOL
      const toolResult = getPolicyInfo(policyNumber);
      console.log("[Araç sonucu]:", toolResult);

      // --- TURN 3: Send the result back to the AI and generate the final answer ---
      const finalResponse = await this.provider.complete({
        system:
          "Sen bir sigorta asistanısın. Araç sonucunu kullanarak kullanıcıya nazikçe cevap ver.",
        messages: [
          {
            role: "user",
            content: `Kullanıcının sorusu: ${userGoal}\n\nAraçtan gelen bilgi: ${toolResult}\n\nBu bilgiyle kullanıcıya nazikçe cevap ver.`,
          },
        ],
      });

      return finalResponse.text.trim();
    }

    // The AI did not request a tool; return its response directly
    return aiDecision;
  }
}

// src/domain/llm/MultiTurnAgent.ts
import type { LLMProvider } from "./types.js";
import { getContactInfo, getPolicyInfo } from "./tools.js";

export class MultiTurnAgent {
  constructor(private provider: LLMProvider) {}

  async run(userGoal: string): Promise<string> {
    const messages: { role: "user" | "assistant"; content: string }[] = [
      { role: "user", content: userGoal },
    ];

    for (let turn = 0; turn < 4; turn += 1) {
      const response = await this.provider.complete({
        system:
          "Sen bir sigorta asistanısın. Kullanıcının hedefini çözmek için gerekirse araç çağır. " +
          "Poliçe bilgisi için tam olarak TOOL:getPolicyInfo:<poliçe_numarası>, " +
          "iletişim bilgisi için tam olarak TOOL:getContactInfo:<poliçe_numarası> formatını kullan. " +
          "İki bilgi de istendiyse iki aracı ayrı turlarda çağır. Araç sonucu verildiğinde " +
          "gerekli diğer aracı çağır; tüm bilgiler hazır olduğunda kullanıcıya doğrudan yanıt ver.",
        messages,
      });

      const decision = response.text.trim();
      console.log("[AI'ın yanıtı]:", decision);

      const policyMatch = decision.match(/^TOOL:getPolicyInfo:(.+)$/);
      const contactMatch = decision.match(/^TOOL:getContactInfo:(.+)$/);

      if (policyMatch) {
        const policyNumber = policyMatch[1]?.trim() ?? "";
        const toolResult = getPolicyInfo(policyNumber);
        console.log("[Araç sonucu]:", toolResult);
        messages.push(
          { role: "assistant", content: decision },
          { role: "user", content: `getPolicyInfo sonucu: ${toolResult}` },
        );
        continue;
      }

      if (contactMatch) {
        const policyNumber = contactMatch[1]?.trim() ?? "";
        const toolResult = getContactInfo(policyNumber);
        console.log("[Araç sonucu]:", toolResult);
        messages.push(
          { role: "assistant", content: decision },
          { role: "user", content: `getContactInfo sonucu: ${toolResult}` },
        );
        continue;
      }

      return decision;
    }

    throw new Error("Araç çağrıları beklenen tur sayısında tamamlanamadı.");
  }
}

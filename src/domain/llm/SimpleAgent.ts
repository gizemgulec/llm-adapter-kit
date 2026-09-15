// src/domain/llm/SimpleAgent.ts
import type { LLMProvider } from "./types.js";
import { getPolicyInfo } from "./tools.js";

// Basitleştirilmiş agent: AI'a bir araç tanıtır, AI karar verir,
// gerekirse aracı çalıştırıp sonucu AI'a geri verir.
export class SimpleAgent {
  constructor(private provider: LLMProvider) {}

  async run(userGoal: string): Promise<string> {
    // --- 1. TUR: AI'a hedefi ve aracı tanıt ---
    const firstResponse = await this.provider.complete({
      system:
        "Sen bir sigorta asistanısın. Poliçe bilgisi gerekirse, SADECE şu formatta yanıt ver: " +
        "TOOL:getPolicyInfo:<poliçe_numarası>\n" +
        "Eğer araç gerekmiyorsa doğrudan cevap ver.",
      messages: [{ role: "user", content: userGoal }],
    });

    const aiDecision = firstResponse.text.trim();
    console.log("[AI'ın kararı]:", aiDecision);

    // --- 2. AI araç çağırmak istiyor mu? ---
    if (aiDecision.startsWith("TOOL:getPolicyInfo:")) {
      // Poliçe numarasını ayıkla
      const policyNumber = aiDecision.split(":")[2]?.trim() ?? "";

      // Aracı ÇALIŞTIR
      const toolResult = getPolicyInfo(policyNumber);
      console.log("[Araç sonucu]:", toolResult);

      // --- 3. Sonucu AI'a geri ver, final cevabı üret ---
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

    // AI araç istemedi, doğrudan cevabı döndür
    return aiDecision;
  }
}

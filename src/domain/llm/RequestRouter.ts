// src/domain/llm/RequestRouter.ts
import type { LLMProvider } from "./types.js";
import { ComplaintPipeline } from "./ComplaintPipeline.js";

// Type of the incoming request
export type RequestType = "complaint" | "question";

// The router determines the type of an incoming message and directs it to the appropriate flow.
// Like a traffic officer, it guides each request into the right lane.
export class RequestRouter {
  constructor(private provider: LLMProvider) {}

  // --- STEP 1: Classify (is this a complaint or a question?) ---
  private async classify(message: string): Promise<RequestType> {
    const result = await this.provider.complete({
      system:
        "Sana bir müşteri mesajı verilecek. Bu bir şikayet mi yoksa bilgi sorusu mu? " +
        "SADECE tek kelimeyle cevap ver: SIKAYET veya SORU.",
      messages: [{ role: "user", content: message }],
    });

    const answer = result.text.trim().toUpperCase();
    // Determine the type based on the response
    return answer.includes("SIKAYET") ? "complaint" : "question";
  }

  // --- STEP 2: Route based on the type ---
  async route(message: string): Promise<{ type: RequestType; output: string }> {
    const type = await this.classify(message);

    if (type === "complaint") {
      // Complaint -> route to the pipeline created earlier
      const pipeline = new ComplaintPipeline(this.provider);
      const result = await pipeline.run(message);
      return {
        type,
        output: `Özet: ${result.summary}\nAciliyet: ${result.urgency}`,
      };
    } else {
      // Question -> provide a simple, fast, single-step answer
      const result = await this.provider.complete({
        system: "Sen bir sigorta destek asistanısın. Soruyu kısa ve net yanıtla.",
        messages: [{ role: "user", content: message }],
      });
      return { type, output: result.text.trim() };
    }
  }
}
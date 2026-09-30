// src/domain/llm/ComplaintPipeline.ts
import type { LLMProvider } from "./types.js";

// A multi-step chain that processes a customer complaint.
// Each step uses the output of the previous step.
export class ComplaintPipeline {
  // The pipeline does not know which provider it receives; it only depends on LLMProvider.
  // This means it works with any provider created by an adapter, factory, or strategy.
  constructor(private provider: LLMProvider) {}

  async run(complaint: string): Promise<{ summary: string; urgency: string }> {
    // --- STEP 1: Summarize ---
    const summaryResult = await this.provider.complete({
      system: "Sen bir sigorta destek asistanısın. Verilen şikayeti en fazla 2 cümlede özetle.",
      messages: [{ role: "user", content: complaint }],
    });
    const summary = summaryResult.text.trim();

    // --- STEP 2: Determine urgency (using the output of Step 1) ---
    const urgencyResult = await this.provider.complete({
      system:
        "Sana bir şikayet özeti verilecek. Aciliyetini SADECE tek kelimeyle söyle: DÜŞÜK, ORTA veya YÜKSEK.",
      messages: [{ role: "user", content: summary }],
    });
    const urgency = urgencyResult.text.trim();

    return { summary, urgency };
  }
}
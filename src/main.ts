// src/main.ts
import { MockAdapter } from "./domain/llm/adapters/MockAdapter.js";

async function run() {
  const provider = new MockAdapter();

  const result = await provider.complete({
    messages: [{ role: "user", content: "Merhaba, adapter pattern nedir?" }],
  });

  console.log("Provider:", provider.name);
  console.log("Model:", result.model);
  console.log("Cevap:", result.text);
}

run();
// server/index.ts
// Wires the real providers into the app and starts the server. Routes live in app.ts.
import "dotenv/config";
import { createApp } from "./app.js";
import { RagPipeline } from "../src/domain/llm/RagPipeline.js";
import { FallbackProvider } from "../src/domain/llm/FallbackProvider.js";
import { Retriever } from "../src/domain/llm/knowledgeBase.js";
import { GeminiAdapter } from "../src/domain/llm/adapters/GeminiAdapter.js";
import { GeminiEmbeddingAdapter } from "../src/domain/llm/adapters/GeminiEmbeddingAdapter.js";

// --- Initialize the API key and pipeline once ---
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error(".env dosyasında GEMINI_API_KEY bulunamadı.");
}
// Only real providers here. MockAdapter is for tests: as a fallback it would send its
// placeholder text to users as if it were a real answer. Add a second real provider to this list.
const provider = new FallbackProvider([
  new GeminiAdapter(apiKey),
]);
const retriever = new Retriever(new GeminiEmbeddingAdapter(apiKey));
const rag = new RagPipeline(provider, retriever);

// --- Start the server ---
const PORT = Number(process.env.PORT) || 3000;
createApp(rag).listen(PORT, () => {
  console.log(`✅ Backend proxy çalışıyor: http://localhost:${PORT}`);
});

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A provider-agnostic LLM layer (TypeScript, Google Gemini) wired end to end: a React Native/Expo app sends a Turkish insurance question to an Express backend proxy, which answers it through a RAG pipeline. The Gemini API key lives only on the server.

There are two separate npm projects: the root (backend + `src/` domain library) and `mobile/` (Expo app, with its own `package.json` and `node_modules`).

## Commands

Root (backend). There's no build step; everything runs through `tsx`. There's no test runner or linter yet, and `npm test` only prints an error.

```bash
npx tsx server/index.ts   # backend proxy on :3000, or $PORT (POST /ask, POST /ask/stream, GET /health)
npx tsx src/main.ts       # CLI demo: runs three sample questions through RagPipeline
npx tsc --noEmit          # typecheck root (mobile/ is excluded; strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes)
```

Both entry points need `GEMINI_API_KEY` in the root `.env` (loaded through `dotenv/config`; the file is gitignored).

Mobile (run from `mobile/`):

```bash
npx expo start
npx expo install <package>   # use this, not npm install, for SDK-compatible versions
npx tsc --noEmit
```

`mobile/App.tsx` hardcodes `BACKEND_URL` to a LAN IP (`http://<ip>:3000/ask/stream`). A physical device can't reach `localhost`, so update it to the dev machine's IP.

## Architecture

Everything in `src/domain/llm/` depends only on the provider interfaces in `types.ts`: `LLMProvider` (`complete(CompletionInput) → CompletionResult`) and `EmbeddingProvider` (`embed(text) → number[]`). Higher layers never import a concrete provider; concrete adapters are wired together only in `server/index.ts` and `src/main.ts`.

`types.ts` also defines provider-neutral tool calling: `CompletionInput.tools` (`ToolDefinition` with a JSON Schema `parameters`), `CompletionResult.toolCalls`, and a `Message` union with `user`, `assistant` (optionally carrying `toolCalls`) and `tool` (a tool result) roles. Adapters translate these to the provider format. `ToolCall.providerMetadata` is opaque round-trip data (Gemini's `thoughtSignature`); keep it on the assistant message, or Gemini rejects the next request.

- **Adapters** (`adapters/`): `GeminiAdapter` maps the common message format to Gemini (`assistant` → `model`, `system` → `systemInstruction`). `MockAdapter` echoes the input and needs no API key.
- **Composition around providers**:
  - `ProviderFactory` creates a provider by name (`"gemini"`/`"mock"`).
  - `ModelStrategy` selects a Gemini model by task (`"cheap"` vs `"reasoning"`).
  - `FallbackProvider` is itself an `LLMProvider`. It tries each wrapped provider in order, wrapping each call in `withRetry`.
  - `withRetry` (`retry.ts`) uses exponential backoff and retries only transient errors: 408, 429, 5xx, and network errors with no `status`. Other HTTP errors (e.g. 400 invalid key) fail immediately and move on to the next provider.
  - When every provider fails, `FallbackProvider` throws `AllProvidersFailedError`. The server maps it to a 503 with a user-facing "try again later" message (an `error` event on `/ask/stream`). Any other error is a 500.
  - The server's chain is `FallbackProvider([Gemini])`. Don't add `MockAdapter` to it: as a fallback, its placeholder text (which echoes the whole RAG prompt) would reach users as if it were a real answer. A second real provider goes in this list.
- **Streaming**: every provider implements `stream(input): AsyncIterable<string>` (text only, no tool calls).
  - `FallbackProvider.stream` retries and falls back only until the first chunk arrives; a mid-stream error goes to the caller, since switching providers would duplicate text. If the caller stops early, it closes the inner provider stream, so generation stops when the client disconnects.
  - `RagPipeline.askStream` runs retrieval first, then returns `{ sources, answer }` with `answer` as the stream.
  - `POST /ask/stream` responds with NDJSON, one event per line: `sources`, then `delta` events, then `done`, or `error` if it fails after starting. Validation errors are a normal 400 JSON response. `/ask` is unchanged.
  - The mobile app reads the stream with `fetch` from `expo/fetch`, because React Native's built-in `fetch` can't stream response bodies.
- **RAG** (`RagPipeline` → `Retriever` in `knowledgeBase.ts` → `EmbeddingProvider`):
  - The knowledge base is an in-memory array of insurance docs.
  - Embeddings go through the `EmbeddingProvider` interface in `types.ts`, implemented by `GeminiEmbeddingAdapter` (`gemini-embedding-001`). `RagPipeline` takes an `LLMProvider` and a `Retriever`, never an API key.
  - `Retriever` computes the doc vectors lazily and caches them per instance, for the life of the process. It caches the promise, so concurrent first requests share one computation, and a failed computation isn't cached.
  - `Retriever` retries transient embedding errors through `withRetry`, then throws `ProviderUnavailableError` (from `errors.ts`, the base class of `AllProvidersFailedError`). The server maps any `ProviderUnavailableError` to 503.
  - There is deliberately no fallback to another embedding model: vectors from different models aren't comparable, so the documents and the question must be embedded by the same provider.
  - Retrieval ranks docs by cosine similarity (`topN=2`, `minScore = MIN_RELEVANCE_SCORE = 0.75`, measured for `gemini-embedding-001`; re-measure if the model or docs change).
  - The prompt asks the model to cite `[kaynak-id]` and to answer "Bu konuda bilgim yok" when the context is insufficient.
  - `ask()` returns `{ answer, sources }`. The server spreads this into the `/ask` response, and the mobile app renders `sources`.
  - The `keywords` field on knowledge-base docs is left over from earlier keyword retrieval and is unused now.
- **Orchestration demos** (not wired into the server):
  - `ComplaintPipeline` chains summarize → urgency.
  - `RequestRouter` classifies a message as complaint or question, then routes it.
  - `MultiTurnAgent` uses native function calling: it sends `insuranceTools` from `tools.ts`, runs each returned call through `runTool`, appends the results as `tool` messages, and stops after 4 turns. Adding a tool means adding a definition and a handler in `tools.ts`.
  - `SimpleAgent` is the earlier single-turn version, kept as a "before" example. It still uses a text protocol (the model replies `TOOL:getPolicyInfo:<arg>`, which is parsed by hand).
  - `MockAdapter` ignores `tools` and always returns text.

## Conventions

- ESM with `module: nodenext`: relative imports must use the `.js` extension, even for `.ts` files. `verbatimModuleSyntax` is on, so type-only imports must use `import type`.
- Code comments are in English. All user-facing strings, LLM prompts, error messages, and log lines are in **Turkish**. Keep new ones in Turkish.
- `server/index.ts` validates `question` (must be a string, non-empty after trimming, at most `MAX_QUESTION_LENGTH` = 1000 characters). `mobile/App.tsx` duplicates the same limit; keep the two in sync.
- This is a learning and portfolio project. Keep changes incremental and targeted, not large rewrites.
- Don't add claims to the README or docs that the code doesn't support (e.g. fine-tuning/LoRA, on-device AI, native bridges, none of which exist).
- Gemini model names change often. If a model name errors, look up the current name instead of guessing.
- `mobile/AGENTS.md` holds Expo guidance: Expo APIs change every SDK release, so check the versioned docs for the installed `expo` major (currently 57) rather than relying on memory, and never hand-edit `ios/`/`android/`. Its Expo Router notes don't apply yet: the app is a single `App.tsx` with no `src/app/` directory.

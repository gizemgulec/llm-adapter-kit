# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A provider-agnostic LLM layer (TypeScript, Google Gemini) wired end to end: a React Native/Expo app sends a Turkish insurance question to an Express backend proxy, which answers it through a RAG pipeline. The Gemini API key lives only on the server.

There are two separate npm projects: the root (backend + `src/` domain library) and `mobile/` (Expo app, with its own `package.json` and `node_modules`).

## Commands

Root (backend). There's no build step; everything runs through `tsx`. There's no test runner or linter yet, and `npm test` only prints an error.

```bash
npx tsx server/index.ts   # backend proxy on :3000 (POST /ask, GET /health)
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

`mobile/App.tsx` hardcodes `BACKEND_URL` to a LAN IP (`http://<ip>:3000/ask`). A physical device can't reach `localhost`, so update it to the dev machine's IP.

## Architecture

Everything in `src/domain/llm/` depends only on the `LLMProvider` interface in `types.ts` (`complete(CompletionInput) → CompletionResult`). Higher layers never import a concrete provider, with one exception noted below.

`types.ts` also defines provider-neutral tool calling: `CompletionInput.tools` (`ToolDefinition` with a JSON Schema `parameters`), `CompletionResult.toolCalls`, and a `Message` union with `user`, `assistant` (optionally carrying `toolCalls`) and `tool` (a tool result) roles. Adapters translate these to the provider format. `ToolCall.providerMetadata` is opaque round-trip data (Gemini's `thoughtSignature`); keep it on the assistant message, or Gemini rejects the next request.

- **Adapters** (`adapters/`): `GeminiAdapter` maps the common message format to Gemini (`assistant` → `model`, `system` → `systemInstruction`). `MockAdapter` echoes the input and needs no API key.
- **Composition around providers**:
  - `ProviderFactory` creates a provider by name (`"gemini"`/`"mock"`).
  - `ModelStrategy` selects a Gemini model by task (`"cheap"` vs `"reasoning"`).
  - `FallbackProvider` is itself an `LLMProvider`. It tries each wrapped provider in order, wrapping each call in `withRetry` (`retry.ts`, linear-increasing backoff).
  - The server uses `FallbackProvider([Gemini, Mock])`, so when Gemini fails the server returns a mock answer instead of a 500.
- **RAG** (`RagPipeline` → `knowledgeBase.retrieve` → `embeddings.ts`):
  - The knowledge base is an in-memory array of insurance docs.
  - Doc embeddings (`gemini-embedding-001`) are computed lazily on the first request and cached in a module-level variable for the life of the process.
  - Retrieval ranks docs by cosine similarity (`topN=2`, `minScore=0.5`).
  - The prompt asks the model to cite `[kaynak-id]` and to answer "Bu konuda bilgim yok" when the context is insufficient.
  - `ask()` returns `{ answer, sources }`. The server spreads this into the `/ask` response, and the mobile app renders `sources`.
  - The `keywords` field on knowledge-base docs is left over from earlier keyword retrieval and is unused now.
  - **Exception:** `RagPipeline` takes the raw `apiKey` as well as a provider, because embeddings call Gemini directly instead of going through `LLMProvider`.
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

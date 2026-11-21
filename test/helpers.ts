// test/helpers.ts — shared fakes for the unit tests (not a test file itself).
import { mock } from "node:test";
import type { LLMProvider, CompletionInput, CompletionResult } from "../src/domain/llm/types.js";

// The code logs every step; keep test output readable.
export function silenceLogs(): void {
  mock.method(console, "log", () => {});
  mock.method(console, "error", () => {});
}

// An error shaped like the Gemini SDK's ApiError (it carries an HTTP `status`).
export function httpError(status: number, message = `HTTP ${status}`): Error {
  return Object.assign(new Error(message), { status });
}

// A provider that records its inputs and answers from a script, one entry per call.
// Each entry is either a result or an error to throw.
export function scriptedProvider(
  name: string,
  script: (CompletionResult | Error)[]
): LLMProvider & { inputs: CompletionInput[] } {
  const inputs: CompletionInput[] = [];
  let call = 0;
  const next = () => {
    const entry = script[Math.min(call++, script.length - 1)];
    if (!entry) throw new Error("empty script");
    if (entry instanceof Error) throw entry;
    return entry;
  };
  return {
    name,
    inputs,
    async complete(input) {
      inputs.push(structuredClone(input));
      return next();
    },
    async *stream(input) {
      inputs.push(structuredClone(input));
      yield next().text;
    },
  };
}

// A provider whose stream yields the given chunks, optionally failing after some of them.
// `closed` becomes true when the stream is finished or closed early by the caller.
export function streamingProvider(
  name: string,
  chunks: string[],
  options: { failBeforeFirst?: Error; failAfter?: { count: number; error: Error } } = {}
): LLMProvider & { closed: () => boolean; calls: () => number } {
  let closed = false;
  let calls = 0;
  return {
    name,
    closed: () => closed,
    calls: () => calls,
    async complete() {
      calls++;
      if (options.failBeforeFirst) throw options.failBeforeFirst;
      return { text: chunks.join(""), model: name };
    },
    async *stream() {
      calls++;
      try {
        if (options.failBeforeFirst) throw options.failBeforeFirst;
        for (const [i, chunk] of chunks.entries()) {
          if (options.failAfter && i === options.failAfter.count) throw options.failAfter.error;
          yield chunk;
        }
      } finally {
        closed = true;
      }
    },
  };
}

export async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

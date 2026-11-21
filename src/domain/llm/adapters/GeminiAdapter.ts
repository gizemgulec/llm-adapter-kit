// src/domain/llm/adapters/GeminiAdapter.ts
import { GoogleGenAI, type Content, type GenerateContentParameters, type Part } from "@google/genai";
import type {
  LLMProvider,
  CompletionInput,
  CompletionResult,
  Message,
  ToolCall,
} from "../types.js";

// An adapter that maps Gemini to our common LLMProvider interface.
export class GeminiAdapter implements LLMProvider {
  readonly name = "gemini";
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(apiKey: string, model = "gemini-3.6-flash") {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async complete(input: CompletionInput): Promise<CompletionResult> {
    const response = await this.client.models.generateContent(this.buildRequest(input));

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const text = textFromParts(parts);

    const toolCalls: ToolCall[] = parts.flatMap((part) => {
      const call = part.functionCall;
      if (!call?.name) return [];
      return [
        {
          name: call.name,
          args: call.args ?? {},
          ...(call.id ? { id: call.id } : {}),
          ...(part.thoughtSignature ? { providerMetadata: part.thoughtSignature } : {}),
        },
      ];
    });

    return {
      text,
      model: this.model,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };
  }

  async *stream(input: CompletionInput): AsyncIterable<string> {
    const chunks = await this.client.models.generateContentStream(this.buildRequest(input));
    for await (const chunk of chunks) {
      const text = textFromParts(chunk.candidates?.[0]?.content?.parts ?? []);
      if (text) yield text;
    }
  }

  private buildRequest(input: CompletionInput): GenerateContentParameters {
    const config = {
      ...(input.system ? { systemInstruction: input.system } : {}),
      ...(input.maxTokens !== undefined ? { maxOutputTokens: input.maxTokens } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.tools?.length
        ? {
            tools: [
              {
                functionDeclarations: input.tools.map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  parametersJsonSchema: tool.parameters,
                })),
              },
            ],
          }
        : {}),
    };

    return {
      model: this.model,
      contents: toGeminiContents(input.messages),
      config,
    };
  }
}

// Joins the visible text of a response, skipping the model's internal "thought" parts.
function textFromParts(parts: Part[]): string {
  return parts
    .filter((part) => part.text && !part.thought)
    .map((part) => part.text)
    .join("");
}

// Converts our provider-neutral history into Gemini's format.
// Exported for tests.
export function toGeminiContents(messages: Message[]): Content[] {
  const contents: Content[] = [];

  for (const message of messages) {
    const { role, parts } = toGeminiTurn(message);

    // Merge consecutive turns with the same role (e.g. results of parallel tool calls).
    const previous = contents.at(-1);
    if (previous?.role === role) {
      previous.parts = [...(previous.parts ?? []), ...parts];
    } else {
      contents.push({ role, parts });
    }
  }

  return contents;
}

function toGeminiTurn(message: Message): { role: "user" | "model"; parts: Part[] } {
  switch (message.role) {
    case "user":
      return { role: "user", parts: [{ text: message.content }] };

    case "assistant": {
      const parts: Part[] = message.content ? [{ text: message.content }] : [];
      for (const call of message.toolCalls ?? []) {
        parts.push({
          functionCall: { name: call.name, args: call.args, ...(call.id ? { id: call.id } : {}) },
          // Gemini requires the thought signature to be returned with the call it came with.
          ...(call.providerMetadata ? { thoughtSignature: call.providerMetadata } : {}),
        });
      }
      return { role: "model", parts };
    }

    case "tool":
      // Gemini expects tool results as functionResponse parts in a user turn.
      return {
        role: "user",
        parts: [
          {
            functionResponse: {
              name: message.name,
              response: { result: message.content },
              ...(message.toolCallId ? { id: message.toolCallId } : {}),
            },
          },
        ],
      };
  }
}

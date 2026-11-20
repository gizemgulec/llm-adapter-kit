// src/domain/llm/types.ts

// A tool the model may call. `parameters` is a JSON Schema object describing the arguments.
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// A tool call requested by the model.
export interface ToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
  // Opaque provider-specific data that must be sent back unchanged in the next request
  // (e.g. Gemini's thoughtSignature). Upper layers should only pass it through.
  providerMetadata?: string;
}

// One entry in the conversation history.
export type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; name: string; content: string; toolCallId?: string };

// Input for a completion request
export interface CompletionInput {
  system?: string;
  messages: Message[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}

// Output of a completion request
export interface CompletionResult {
  text: string;
  model: string;
  // Present only when the model asked to call one or more tools.
  toolCalls?: ToolCall[];
}

// The only interface the upper layer (UI/hook) knows about.
// It does not know which provider is in use; this is the heart of the adapter pattern.
export interface LLMProvider {
  readonly name: string;
  complete(input: CompletionInput): Promise<CompletionResult>;
}

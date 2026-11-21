import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toGeminiContents } from "../src/domain/llm/adapters/GeminiAdapter.js";

describe("toGeminiContents", () => {
  it("maps user and assistant messages to Gemini's user and model roles", () => {
    assert.deepEqual(
      toGeminiContents([
        { role: "user", content: "Selam" },
        { role: "assistant", content: "Merhaba" },
      ]),
      [
        { role: "user", parts: [{ text: "Selam" }] },
        { role: "model", parts: [{ text: "Merhaba" }] },
      ]
    );
  });

  it("sends tool calls back with their id and thought signature", () => {
    const [model] = toGeminiContents([
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "c1", name: "getPolicyInfo", args: { policyNumber: "12345" }, providerMetadata: "sig" }],
      },
    ]);
    assert.deepEqual(model, {
      role: "model",
      // no empty text part
      parts: [
        {
          functionCall: { id: "c1", name: "getPolicyInfo", args: { policyNumber: "12345" } },
          thoughtSignature: "sig",
        },
      ],
    });
  });

  it("merges the results of parallel tool calls into one user turn", () => {
    const contents = toGeminiContents([
      { role: "user", content: "Poliçe ve iletişim?" },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { name: "getPolicyInfo", args: { policyNumber: "1" } },
          { name: "getContactInfo", args: { policyNumber: "1" } },
        ],
      },
      { role: "tool", name: "getPolicyInfo", content: "Kasko", toolCallId: "a" },
      { role: "tool", name: "getContactInfo", content: "Ahmet" },
    ]);

    assert.equal(contents.length, 3);
    assert.deepEqual(contents[2], {
      role: "user",
      parts: [
        { functionResponse: { name: "getPolicyInfo", response: { result: "Kasko" }, id: "a" } },
        { functionResponse: { name: "getContactInfo", response: { result: "Ahmet" } } },
      ],
    });
  });
});

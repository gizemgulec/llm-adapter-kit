import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MultiTurnAgent } from "../src/domain/llm/MultiTurnAgent.js";
import { insuranceTools, runTool } from "../src/domain/llm/tools.js";
import { scriptedProvider, silenceLogs } from "./helpers.js";

silenceLogs();

describe("runTool", () => {
  it("runs getPolicyInfo and getContactInfo", () => {
    assert.equal(runTool("getPolicyInfo", { policyNumber: "12345" }), "Kasko poliçesi, bitiş tarihi: 15 Mart 2027");
    assert.equal(runTool("getContactInfo", { policyNumber: "67890" }), "Ayşe Demir - 0533 444 55 66");
  });

  it("trims the policy number", () => {
    assert.equal(runTool("getPolicyInfo", { policyNumber: " 12345 " }), "Kasko poliçesi, bitiş tarihi: 15 Mart 2027");
  });

  it("returns errors as text so the model can react to them", () => {
    assert.match(runTool("getPolicyInfo", { policyNumber: "99999" }), /bulunamadı/);
    assert.match(runTool("deleteEverything", {}), /Bilinmeyen araç/);
    assert.match(runTool("getPolicyInfo", { policyNumber: 12345 }), /policyNumber \(string\) gerekli/);
    assert.match(runTool("getPolicyInfo", {}), /policyNumber \(string\) gerekli/);
  });

  it("has a handler for every declared tool", () => {
    for (const tool of insuranceTools) {
      assert.doesNotMatch(runTool(tool.name, { policyNumber: "12345" }), /Bilinmeyen araç/);
    }
  });
});

describe("MultiTurnAgent", () => {
  it("runs the requested tool, sends the result back, and returns the final answer", async () => {
    const provider = scriptedProvider("llm", [
      {
        text: "",
        model: "m",
        toolCalls: [{ id: "call-1", name: "getPolicyInfo", args: { policyNumber: "12345" }, providerMetadata: "sig" }],
      },
      { text: " Poliçeniz 15 Mart 2027'de bitiyor. ", model: "m" },
    ]);

    const answer = await new MultiTurnAgent(provider).run("12345 ne zaman bitiyor?");

    assert.equal(answer, "Poliçeniz 15 Mart 2027'de bitiyor.");
    assert.deepEqual(provider.inputs[0]?.tools, insuranceTools);

    const [, assistant, toolResult] = provider.inputs[1]?.messages ?? [];
    assert.deepEqual(assistant, {
      role: "assistant",
      content: "",
      // providerMetadata (Gemini's thought signature) must survive the round trip
      toolCalls: [{ id: "call-1", name: "getPolicyInfo", args: { policyNumber: "12345" }, providerMetadata: "sig" }],
    });
    assert.deepEqual(toolResult, {
      role: "tool",
      name: "getPolicyInfo",
      content: "Kasko poliçesi, bitiş tarihi: 15 Mart 2027",
      toolCallId: "call-1",
    });
  });

  it("answers directly when the model calls no tool", async () => {
    const provider = scriptedProvider("llm", [{ text: "Merhaba!", model: "m" }]);
    assert.equal(await new MultiTurnAgent(provider).run("Selam"), "Merhaba!");
    assert.equal(provider.inputs.length, 1);
  });

  it("gives up when the model keeps calling tools", async () => {
    const provider = scriptedProvider("llm", [
      { text: "", model: "m", toolCalls: [{ name: "getPolicyInfo", args: { policyNumber: "12345" } }] },
    ]);
    await assert.rejects(new MultiTurnAgent(provider).run("döngü"), /beklenen tur sayısında/);
    assert.equal(provider.inputs.length, 4);
  });
});

// src/domain/llm/tools.ts
import type { ToolDefinition } from "./types.js";

// A mock policy database (this would be an API or database in a real application)
const fakePolicyDB: Record<string, { endDate: string; type: string }> = {
  "12345": { endDate: "15 Mart 2027", type: "Kasko" },
  "67890": { endDate: "3 Kasım 2026", type: "Trafik" },
};

// A tool the AI can use to retrieve information by policy number.
export function getPolicyInfo(policyNumber: string): string {
  const policy = fakePolicyDB[policyNumber];
  if (!policy) {
    return `${policyNumber} numaralı poliçe bulunamadı.`;
  }
  return `${policy.type} poliçesi, bitiş tarihi: ${policy.endDate}`;
}

// The second tool retrieves the policyholder's contact information.
const fakeContactDB: Record<string, string> = {
  "12345": "Ahmet Yılmaz - 0532 111 22 33",
  "67890": "Ayşe Demir - 0533 444 55 66",
};

export function getContactInfo(policyNumber: string): string {
  const contact = fakeContactDB[policyNumber];
  if (!contact) {
    return `${policyNumber} numaralı poliçe için iletişim bilgisi bulunamadı.`;
  }
  return contact;
}

// --- Native function calling ---
// Tool definitions sent to the model, and a dispatcher that runs the tool it picks.

const policyNumberParameters = {
  type: "object",
  properties: {
    policyNumber: { type: "string", description: "Poliçe numarası, örn. 12345" },
  },
  required: ["policyNumber"],
};

export const insuranceTools: ToolDefinition[] = [
  {
    name: "getPolicyInfo",
    description: "Poliçe numarasına göre poliçe türünü ve bitiş tarihini getirir.",
    parameters: policyNumberParameters,
  },
  {
    name: "getContactInfo",
    description: "Poliçe numarasına göre poliçe sahibinin adını ve telefonunu getirir.",
    parameters: policyNumberParameters,
  },
];

const toolHandlers: Record<string, (policyNumber: string) => string> = {
  getPolicyInfo,
  getContactInfo,
};

// Runs the tool the model asked for. Errors are returned as text so the model can react to them.
export function runTool(name: string, args: Record<string, unknown>): string {
  const handler = toolHandlers[name];
  if (!handler) {
    return `Bilinmeyen araç: ${name}`;
  }
  const policyNumber = args["policyNumber"];
  if (typeof policyNumber !== "string") {
    return `${name} için policyNumber (string) gerekli.`;
  }
  return handler(policyNumber.trim());
}

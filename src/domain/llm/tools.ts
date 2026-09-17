// src/domain/llm/tools.ts

// Sahte bir poliçe veritabanı (gerçekte bir API/DB olurdu)
const fakePolicyDB: Record<string, { endDate: string; type: string }> = {
  "12345": { endDate: "15 Mart 2027", type: "Kasko" },
  "67890": { endDate: "3 Kasım 2026", type: "Trafik" },
};

// AI'ın kullanabileceği araç: poliçe numarasıyla bilgi getirir.
export function getPolicyInfo(policyNumber: string): string {
  const policy = fakePolicyDB[policyNumber];
  if (!policy) {
    return `${policyNumber} numaralı poliçe bulunamadı.`;
  }
  return `${policy.type} poliçesi, bitiş tarihi: ${policy.endDate}`;
}

// İkinci araç: poliçe sahibinin iletişim bilgisini getirir
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
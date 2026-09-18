# llm-adapter-kit

Provider-agnostic LLM integration layer in TypeScript.
Farklı yapay zeka sağlayıcılarını (Gemini, Mock) tek bir arayüz altında toplayan,
Adapter · Factory · Strategy pattern'leri ve orchestration katmanları içeren bir öğrenme projesi.

## Katmanlar

### Adapter
Her AI sağlayıcısının konuşma şekli farklı. Adapter'lar bu farklı servisleri
tek ortak arayüze (`LLMProvider`) çevirir. Böylece üst katman "hangi sağlayıcı"
olduğunu bilmez.

### Factory
Nesneyi nasıl kuracağını bilen ve senin yerine kuran yardımcı.
`main.ts` artık `new GeminiAdapter(apiKey)` yazmıyor; sadece `"gemini"` diyor,
fabrika kurulmuş adapter'ı veriyor. Kurma mantığı tek yerde toplanıyor.

### Strategy
İşin tipine göre model seçer. Basit işler ucuz modele, akıl yürütme
gerektirenler güçlü modele gider. Böylece maliyet ve kalite dengelenir.

### Orchestration
- **Chaining:** Çok adımlı akış; her adımın çıktısı sonrakinin girdisi.
- **Routing:** Gelen isteği sınıflandırıp doğru akışa yönlendirir.
- **Agent loop:** Modele hedef ve araçlar verilir; hangi aracı ne zaman
  çağıracağına model kendi karar verir, hedefe ulaşana kadar döngüde döner.

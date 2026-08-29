# AGENTS.md — FAGENT & depo-1 için Ajan Yönergesi

> Bu dosya, projede çalışan tüm kodlama ajanları (Codex, Claude, vb.) içindir.
> Amaç: projeye giren bir ajanın **mimariyi, kuralları ve asla ihlal edilmemesi
> gereken ilkeleri** ilk anda öğrenmesi. Ayrıntılı proje hafızası için `CLAUDE.md`
> (kararların gerekçeleri) ve `fagent/README.md` (ajan mimarisi) dosyalarını da oku.

---

## 0. En önemli 5 kural (bunları ihlal etme)

1. **API ANAHTARI YOK.** FAGENT hiçbir özellikte istemci tarafında API anahtarı
   kullanmaz. Kod, anahtar olmadan çalışmayı ASLA bırakmamalı. Yeni bir özellik
   anahtar gerektiriyorsa, ya anahtarsız bir alternatif bul ya da yapma.
2. **SAHTE VERİ YOK.** Doğrulanmamış/uydurma fiyat veya piyasa verisi gösterme.
   BIST hisse ve TEFAS fon için ücretsiz-resmi-anahtarsız kaynak YOK (araştırıldı);
   bu yüzden bunlar manuel-girişli kalır. Simüle fiyat göstermektense hiç gösterme.
3. **VERİ TARAYICIDA KALIR.** Tüm kullanıcı verisi `localStorage`'da. Sunucu yok,
   hesap yok, telemetri yok. Bu bir gizlilik/KVKK tasarım kararıdır — bozma.
4. **`agent.ts` SAF KALIR.** `fagent/src/agent.ts` hiçbir I/O (localStorage, ağ,
   DOM) içermez. Tüm veri parametre olarak geçirilir. Bu, test edilebilirliği ve
   ileride LLM'e geçişi mümkün kılar. Yan etkiyi App.tsx'e ya da ayrı modüle koy.
5. **2 KEZ DOĞRULAMADAN COMMIT ATMA.** (a) `npm run typecheck && npm run build`
   temiz olmalı, (b) Playwright e2e regresyonu tamamen yeşil olmalı. İkisi de
   geçmeden commit/push yok. Yeni davranış eklersen ilgili teste kontrol ekle.

---

## 1. Proje nedir

`depo-1` iki bağımsız uygulama içerir. **Öncelikli olan `fagent/`.**

- **FAGENT** (`fagent/`): API anahtarı gerektirmeyen, Türk bireysel yatırımcılar
  için portföy takip + yapay zeka asistanı. React + TypeScript + Vite. Canlı yayında.
- **Aura Finance** (repo kökü `src/` + `server/`): BDT günlüğü + abonelik demosu.
  FAGENT'tan bağımsız; şu an aktif geliştirilmiyor. `server/` klasörü FAGENT'ın
  ileride gerçek LLM'e geçişi için hazır bekleyen Express proxy'sini içerir.

---

## 2. Kurulum ve komutlar (fagent/)

```bash
cd fagent
npm install
npm run dev          # geliştirme sunucusu (varsayılan port 5173)
npm run typecheck    # tsc --noEmit -p tsconfig.app.json  (DOĞRULAMA 1a)
npm run build        # üretim derlemesi -> dist/           (DOĞRULAMA 1b)
```

Netlify ayarları: Base `fagent` · Build `npm run build` · Publish `fagent/dist`.
Canlı hedef: `fagentai.netlify.app`.

---

## 3. Dosya haritası (fagent/src/)

| Dosya | Sorumluluk | Not |
| --- | --- | --- |
| `App.tsx` | Tüm UI — 8 sekme, formlar, grafikler, ajan sohbeti | ~1.200 satır |
| `store.ts` | Veri modeli + `actions` sözleşmesi (localStorage) | Tek yazma noktası |
| `agent.ts` | Ajanın yanıt mantığı | **SAF — I/O yok** |
| `agentMemory.ts` | Uzun süreli bellek (kullanım istatistiği) | localStorage |
| `agentTraining.ts` | Eğitilebilir bilgi tabanı (öğretilen Q&A) | localStorage |
| `market.ts` | Canlı fiyat (Frankfurter döviz, CoinGecko kripto) | Anahtarsız |
| `csv.ts` | CSV içe/dışa aktarma | RFC4180-benzeri |

### localStorage anahtarları
- `fagent.portfolio.v1` — portföy (holdings + txns)
- `fagent.agent.memory.v1` — kullanım istatistiği
- `fagent.agent.training.v1` — öğretilen soru-cevaplar

Sidebar'daki **SIFIRLA** üçünü de temizler — yeni bir kalıcı katman eklersen onu da temizle.

---

## 4. Ajan mimarisi (özet — detay: fagent/README.md)

Ajanın yetenekleri katman katman inşa edildi, hepsi anahtarsız:

1. **Sohbet motoru** (`agent.ts` → `chatReply`): niyet algılama, bağlam hafızası
   ("devam et"), varlık sorguları, sohbet içinde 3 tür grafik.
2. **Uzun süreli bellek** (`agentMemory.ts`): ne sorduğunu hatırlar, kişiselleştirilmiş karşılama.
3. **Eğitilebilir bilgi** (`agentTraining.ts`): kullanıcı Q&A öğretir; built-in kuralları ezer.
4. **Geri bildirim + aksiyon** (`App.tsx`): 👍/👎 + komutla işlem ("THYAO'dan 500 TL sat" →
   Onayla/Vazgeç → onay sonrası `actions.addTxn`).
5. **Proaktif içgörüler** (`agent.ts` → `proactiveInsights`): kullanıcı SORMADAN,
   enflasyona karşı reel getiri uyarısı. **BtcTurk'ün Bloki'sinden ayrışan çekirdek yetenek.**

### `chatReply` yanıt önceliği (sıra önemlidir)
`öğretilmiş bilgi → işlem komutu → bellek sorgusu → takip cümlesi → grafik → kıyaslama
→ genel kurallar → varlık arama → fallback`

**Dürüstlük ilkesi:** Ajan bir LLM DEĞİLDİR — kural tabanlı (regex + Jaccard benzerliği).
Bu, arayüzde ve dokümanda açıkça belirtilir. "Model eğittik" gibi ifadeler kullanma.

---

## 5. Veri modeli sözleşmesi (store.ts)

- **İşlemler `holdingId` ile eşleşir, isimle DEĞİL.** İki varlık aynı adı taşısa bile
  karışmasın diye. Yeni işlem mantığı yazarken ID kullan.
- **Kâr/zarar:** `costBasis` (maliyet) ile `amount` (güncel değer) ayrı. Satışta maliyet
  ağırlıklı ortalama yöntemiyle orantılı azalır (kâr/zarar YÜZDESİ satıştan etkilenmez).
- **Tarih:** `todayLocalDate()` kullan — `toISOString()` UTC verir, TR saatinde (UTC+3)
  gece yarısına yakın yanlış gün üretir.
- **Ad çakışması:** `normalizeName()` ile case/boşluk duyarsız.

---

## 6. Test — ÖNEMLİ UYARI

E2e testler (Playwright, ~188 kontrol) şu an **repo içinde DEĞİL**, geçici bir
scratchpad dizininde tutuluyordu. Codex bunları göremez.

**Codex ile kalıcı işbirliği için testlerin repoya taşınması gerekir.** Bu yapılana
kadar, davranış değiştiren her PR'da en azından şunları manuel doğrula:
- Karma/kripto örnek portföy yükleniyor, sekmeler çalışıyor
- Kâr/zarar doğru hesaplanıyor (satışta oran korunuyor)
- Ajan: analiz, grafik çizme, komutla işlem (onay akışı), proaktif kart
- CSV içe/dışa aktarma round-trip

> Öneri: `fagent/tests/` altına Playwright kurulumu + mevcut testler eklenmeli,
> `package.json`'a `"test": "..."` script'i girmeli. (Bkz. bu dosyanın sonundaki TODO.)

---

## 7. Kod stili ve konvansiyonlar

- **Yorumlar Türkçe.** Mevcut kodun yorum yoğunluğuna ve tonuna uy.
- **Bağımlılık eklemekte tutumlu ol.** Şu an sadece: react, react-dom, recharts,
  lucide-react. Yeni bir kütüphane gerçekten gerekli mi, iki kez düşün.
- **TypeScript strict.** `noUnusedLocals`, `noUnusedParameters` açık.
- Recharts `PieChart` ile lucide `PieChart` çakışır → ikonu `PieChartIcon` diye al.
- Türkçe dilbilgisi: "grafik" iyelik ekiyle "grafiğimi" olur (k→ğ). Regex'lerde tam
  kelime yerine kök kullan (`graf`).

---

## 8. Git akışı

- Aktif dal: `claude/independent-prompts-setup-ofxdvs` — hem buraya hem `main`'e pushlanıyor.
- Korunan dal: `fagent-stable` (@ `e753c56`) — silme/üzerine yazma.
- Commit mesajları açıklayıcı ve Türkçe; "Doğrulama (2 kez + regresyon)" bölümü ekle.

---

## 9. Devam eden bağlam (2026-07 itibarıyla)

- Ürün, BtcTurk'e sunuluyor. BtcTurk'ün kendi AI asistanı **Bloki** var (komutla
  işlem yapıyor). FAGENT'ın farkı: **tüm serveti görür + proaktif reel getiri uyarısı.**
  Konumlandırma "rakip" değil "tamamlayıcı katman" olmalı.
  Ayrıntılı karşılaştırma ve konumlandırma dokümanı: [`docs/bloki-vs-fagent.md`](docs/bloki-vs-fagent.md).
- Netlify'a güncel `dist` deploy edilmeli (proaktif içgörü kartının canlıda görünmesi için).

---

## 10. TODO (Codex ile işbirliği için öncelikli)

- [ ] Playwright testlerini repoya taşı (`fagent/tests/` + `package.json` script) —
      işbirliğinin doğrulanabilir olması için en kritik adım.
- [ ] Netlify'a güncel build deploy.
- [ ] Proaktif katmanı Ajan sekmesinin karşılama mesajına da taşı (opsiyonel).

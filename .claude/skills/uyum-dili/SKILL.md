---
name: uyum-dili
description: Kullanıcıya görünen metin (arayüz, ajan mesajı, belge) yazarken yasak kelime/kalıp listesi ve betimleyici cümle şablonları. Metne dokunmadan önce kullan.
---

# Uyum dili (AGENTS.md §0; karar günlüğü §1.13)

Ajan çıktısı betimleyicidir: ne olduğunu söyler, ne yapılacağını söylemez.

## Yasak (kullanıcıya görünen metinde)
- Tavsiye: "öneri", "öneriyoruz", "tavsiye" (yalnız "tavsiye değildir" uyarısında geçebilir), "-malısın/-meli", "yapmalı", "tercih et".
- Emir/yönlendirme: "al", "sat", "kaydır", "uygula", "ekle (portföye)" gibi işlem emri.
  İSTİSNA (ONAYLI, `docs/adim3-ekip-plani.md` (d)): "Deftere ekle" düğmesi meşrudur, düzeltme. Yalnızca düğmeyle defter yazılır; yazıyla "ekle/evet/tamam" yazımı tetiklemez.
- İşlem yürütme izlenimi: "işlendi", "gerçekleştirildi", "emir verildi". Doğrusu: "deftere kaydedildi".
- "demo", "deneme sürümü": ürün demo değildir. Örnek veri "örnek veri" diye etiketlenir (dürüst etiket, kalır).
- Kesinlik: "sayılır", "gerekir", "kesin", "garanti".
- Markdown işareti (`**`) ajan mesajında.

## Şablonlar
- "Portföyde X payı %N; belirlediğin hedefe göre %M sapma var."
- "Bu hesap, varsayılan %N enflasyon varsayımıyla yapıldı (varsayım)."
- "Geçmiş performans gelecek getiriyi göstermez; bu bir yatırım tavsiyesi değildir."
- "Defterine X kaydı eklendi; gerçek bir işlem yürütülmedi."

## Kontrol
`grep -rn -i "öneri\|malısın\|demo\|işlendi" src/` -> yalnızca kod yorumu ve reddetme kalıpları (agent.ts tavsiye reddi) kalmalı. Değişen metni arayan e2e seçicilerini aynı kalemde güncelle. Regex için `turkce-regex` skill'i.

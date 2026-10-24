# Ekip ekosistemi — taslak (HENÜZ BAŞLATILMADI)

Durum: KURULDU 2026-10-24 (kullanıcı "tamam başla" dedi). Ayrıntı: `docs/ajan-sistemi.md` → Ekosistem.

## İstenenler
1. **Ortak hafıza:** `CLAUDE.md` → "EKİP HAFIZASI" bölümü. Her ajan işe başlarken okur; hata yapılınca satır eklenir.
2. **İstem iskeleti:** yönetmen tüm rol istemlerini aynı bölümlerle üretir (örn. Bağlam / Görev / Kısıtlar /
   Okunacak dosyalar / Çıktı biçimi). Bölüm adları roller arasında aynı anlama gelir; farklı rollere farklı terim kullanılmaz.
3. **Teknoloji talebi:** ajan yeni bir kütüphane/yöntem/servis isterse "teknoloji talebi" mesajı yazar (ne, neden,
   alternatifi, maliyeti). **Üst kurul** (yönetmen + güvenlik + uyum) onaylar ya da reddeder. Kural: güvenlik riski,
   istemciye gizli anahtar, kullanıcı verisinin dışarı çıkması, SPK/KVKK sorunu, kişiye özel al/sat önerisi ya da
   işlem yürütme varsa RED. Onay/ret gerekçesiyle `docs/karar-gunlugu.md`'ye yazılır.
4. **Skill ekosistemi:** bir ajan aynı bilgiyi tekrar tekrar yüklüyorsa (büyük dosya, uzun kural listesi) bunun yerine
   `.claude/skills/<ad>/SKILL.md` yazar; kısa açıklama + gerektiğinde okunacak ayrıntı. Roller birbirinin skill'ini
   kullanabilir. Yönetmen skill listesini ve çakışmaları düzenli tutar.

## Ertelenenler
Zaman serisi (lag), rassal yürüyüş, transfer öğrenme, Fourier: şimdilik kullanılmaz (bkz. CLAUDE.md).

## Başlarken yapılacaklar (sırayla)
- İstem iskeletini yaz; `fagent-yonetmen.md` ve `fagent-ekip.js` istemlerini ona taşı.
- "Teknoloji talebi" mesaj türünü panoya ve kurul akışına ekle.
- İlk skill'ler: `app-tsx-haritasi` (bölüm → satır aralığı), `e2e-kosu`, `turkce-regex`.
- Koşuda ajan başına dosya-okuma sayısını ölç; tekrar azaldı mı bak.

---
name: turkce-regex
description: Türkçe metin eşleştirme (tavsiye reddi, komut ayrıştırma) yazarken ya da değiştirirken Türkçe harf ve ReDoS tuzaklarına düşmemek için. agent.ts'te regex'e dokunmadan önce kullan.
---

# Türkçe regex kuralları

- `\b` KULLANMA: JS'te ASCII olmayan harflerde (ı, ş, ğ, ü, ö, ç, İ) sözcük sınırını yanlış bulur. Bunun yerine `(?:^|[^\p{L}])` / `(?![\p{L}])` ve `u` bayrağı.
- Girdiyi önce normalle: `metin.toLocaleLowerCase('tr-TR')`. İ→i, I→ı dönüşümü böyle doğru olur. `/i` bayrağına güvenme.
- Ekler: "almalı mıyım", "alınır mı", "satayım mı" gibi çekimlenmiş biçimleri kök+ek olarak yakala; kökü ('al', 'sat') tek başına yakalama — meşru kayıt komutunu ("THYAO'dan 500 TL sat") bozar.
- ReDoS: iç içe `.*`, `(a+)+` yok. Sözcükler arası sınırlı boşluk: `[^\n]{0,40}`.
- Her yeni kalıp için iki liste test et: YAKALANMASI gerekenler (en az 9 tavsiye cümlesi: "hangisi daha iyi", "şimdi girmeli miyim", "kaç lot almalıyım", "stop koymalı mıyım", "altın alayım mı", "hisse satayım mı", "THYAO almalı mıyım", "portföyümü dengele", "bu hisse alınır mı") ve YAKALANMAMASI gerekenler (meşru kayıt komutları, betimleyici sorular). İ/I/ı/i varyantlarını da dene.
- Ret mesajı betimleyicidir: neden tavsiye veremediğini söyler, "öneri/uygula/emir/-malısın" dili kullanmaz.

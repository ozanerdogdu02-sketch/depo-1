# Üst Kurul ve teknoloji talebi

Ajanlar yeni bir teknoloji (kütüphane, yöntem, servis, araç) kullanmak isterse **kullanmadan önce** talep yazar.
Üst Kurul = `fagent-yonetmen` + `fagent-guvenlik` + `fagent-uyum` (karar için `.claude/agents/fagent-ust-kurul.md`).

## Talep biçimi (pano mesajı, tür: `talep`, kime: `ust-kurul`)
```
TALEP: <ad + sürüm>
NE İÇİN: <hangi kalem/iş>
NEDEN: <mevcut çözümle neden olmuyor>
ALTERNATİF: <kullanmamanın maliyeti / başka seçenek>
VERİ AKIŞI: <kullanıcı verisi dışarı çıkıyor mu, istemciye ne giriyor>
MALİYET/LİSANS: <ücret, lisans, bakım>
```

## Karar
Kurul her talebi **ONAY / KOŞULLU ONAY / RED** olarak gerekçesiyle yanıtlar ve `docs/teknoloji-talepleri.md`'ye yazar.

**Otomatik RED** (tartışılmaz):
- İstemciye gizli anahtar/API anahtarı girmesini gerektiren.
- Kullanıcının portföy verisini üçüncü tarafa gönderen (AI/LLM servisi dâhil).
- Kişiye özel al/sat önerisi ya da gerçek işlem yürütme sağlayan.
- Lisansı belirsiz/kapalı kaynak ve veri dışarı çıkaran araç (örn. Jev reddi).
- SPK/KVKK ihlali yaratan; kaynağı doğrulanamayan.

**Ek incelemeler:** yeni bağımlılık → `npm audit` + lisans; sunucu tarafı → güvenlik "erişim" mercek; para/ödeme → insan onayı şart.
Ertelenmiş teknolojiler (zaman serisi/lag, rassal yürüyüş, transfer öğrenme, Fourier) talep gelirse "ertelendi" ile reddedilir (CLAUDE.md).
**Son söz insanındır:** kurul onayı yeni bağımlılığı kendiliğinden eklemez; ekleme kalemi normal kapıdan geçer.

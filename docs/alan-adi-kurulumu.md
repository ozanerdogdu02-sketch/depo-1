# Kendi Alan Adına Geçiş

> Şu an site `fagentai.netlify.app` adresinde. Bu belge kendi alan adına geçişi anlatır.
> **Alan adını sen satın alacaksın** — bu adım bende değil, ödeme ve kimlik bilgisi gerektiriyor.

---

## 1. Alan adını seç ve satın al

| Uzantı | Yıllık (yaklaşık) | Not |
|---|---|---|
| `.com` | 350–600 TL | En tanıdık, uluslararası. İlk tercih. |
| `.com.tr` | 200–400 TL | Türkiye'ye ait algısı güçlü. **Belge istenebilir** (marka/şirket). |
| `.app` | 500–800 TL | HTTPS zorunlu (zaten var). Teknik ürün algısı. |
| `.io` / `.co` | 800–1.500 TL | Pahalı, ek fayda sınırlı. |

**Öneri:** `.com`. Kurumsal bir muhataba (BtcTurk gibi) verilen adreste en az soru işareti bırakır.

**İsim seçerken:** kısa, telefonda söylenebilir, harf harf açıklamak gerekmeyen bir şey.
`fagent.com` müsait değilse `fagentapp.com`, `fagent.com.tr` gibi türevler denenebilir.

**Nereden:** Cloudflare Registrar (maliyetine satar, ek ücret yok), Namecheap, ya da
yerli sağlayıcılar (Natro, İsimtescil). Netlify üzerinden de alınabilir ama fiyatı genelde
daha yüksek.

---

## 2. Netlify'a bağla

1. Netlify panelinde siteyi aç → **Domain management** → **Add a domain**
2. Aldığın alan adını yaz → Netlify sana DNS kayıtlarını verir
3. İki yol var:

**A) Netlify DNS kullan (kolay olan).** Alan adı sağlayıcında **nameserver**'ları
Netlify'ınkilerle değiştirirsin (`dns1.p0x.nsone.net` gibi dört adres). Netlify her şeyi
kendi yönetir. Yayılması 1–24 saat sürer.

**B) Kendi DNS'inde kal.** Sağlayıcının panelinde iki kayıt açarsın:

| Tür | Ad | Değer |
|---|---|---|
| `A` | `@` | `75.2.60.5` (Netlify'ın verdiği IP — panelden teyit et) |
| `CNAME` | `www` | `<site-adin>.netlify.app` |

**Öneri: A yolu.** Daha az yerde hata yapılır ve sertifika otomatik yenilenir.

---

## 3. HTTPS

Netlify, alan adı doğrulandıktan sonra **Let's Encrypt sertifikasını otomatik** alır.
Domain management → HTTPS bölümünde "Certificate: Active" görünmeli. Genelde birkaç dakika
sürer; 1 saati geçerse "Renew certificate" ile tetikle.

**www yönlendirmesi:** Netlify'da bir alan adını "primary" seçersin, diğeri otomatik ona
yönlenir. `fagent.com` primary olsun, `www.fagent.com` ona düşsün.

---

## 4. ⚠️ Alan adı bağlandıktan SONRA kodda güncellenecek yerler

Bunlar atlanırsa link önizlemeleri ve arama motoru kaydı eski adresi gösterir:

**`fagent/index.html`** — üç yerde tam adres yazılı:

```html
<link rel="canonical" href="https://fagentai.netlify.app/" />
<meta property="og:url" content="https://fagentai.netlify.app/" />
<meta property="og:image" content="https://fagentai.netlify.app/og.png" />
<meta name="twitter:image" content="https://fagentai.netlify.app/og.png" />
```

Hepsini yeni alan adıyla değiştir. **`og:image` mutlaka tam adres olmalı** — göreli yol
(`/og.png`) sosyal medya botlarında çalışmaz.

**Diğer yerler:** `docs/` altındaki sunum ve kartlarda `fagentai.netlify.app` geçen satırlar
(`grep -rn "netlify.app" docs/ fagent/` ile bul).

---

## 5. Doğrulama

Alan adı yayına girdikten sonra:

- [ ] `https://<alanadi>` açılıyor, kilit simgesi var
- [ ] `http://` adresi otomatik `https://`'e yönleniyor
- [ ] `www` alt alanı da çalışıyor
- [ ] `/panel`, `/ajan` gibi derin bağlantılar **doğrudan** açılıyor
      (SPA yönlendirmesi `netlify.toml`'de tanımlı — çalışmıyorsa oraya bak)
- [ ] Linki WhatsApp'a ya da LinkedIn'e yapıştır: başlık, açıklama ve görsel çıkıyor mu?
      Çıkmıyorsa [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/) ile
      önbelleği temizle.
- [ ] `/api/evds` hâlâ çalışıyor (SPA yönlendirmesi onu yutmamalı)

---

## 6. Maliyet özeti

| Kalem | Yıllık |
|---|---|
| Alan adı | ~400–600 TL |
| Netlify barındırma | **0 TL** (ücretsiz katman yeterli) |
| SSL sertifikası | **0 TL** (Let's Encrypt, otomatik) |

Toplam: **yılda bir alan adı ücreti.** Sunucu olmadığı için başka işletme gideri yok —
ürünün mimarisi bunu mümkün kılıyor.

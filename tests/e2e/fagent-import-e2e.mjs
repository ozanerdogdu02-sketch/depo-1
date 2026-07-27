import { chromium } from 'playwright-core';
import fs from 'fs';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const out = process.env.TEST_ARTIFACTS;
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });

await page.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
await page.waitForTimeout(300);

// --- Tam döngü: dışa aktar → sıfırla → içe aktar → veriler geri gelmeli ---
const [dl] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('.mini-btn', { hasText: 'CSV' }).click(),
]);
const csvPath = await dl.path();
console.log('  (indirilen CSV:', csvPath, ')');

page.once('dialog', d => d.accept());
await page.locator('text=SIFIRLA').click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Kendi paramı gireceğim' }).click();
await page.waitForTimeout(300);
check('Sıfırlama sonrası 0 varlık', await page.locator('text=0 varlık').count() > 0);

await page.setInputFiles('input[aria-label="CSV dosyası seç"]', csvPath);
await page.waitForTimeout(400);
check('İçe aktarma başarı mesajı görünür', await page.locator('text=5 varlık eklendi').count() > 0);
check('5 varlık listede (₺143.700 toplam geri geldi)', (await page.locator('.big-number').first().textContent())?.includes('143.700') ?? false);
check('THYAO round-trip ile geri geldi (maliyet+değer korunmuş)', await page.locator('text=Maliyet: ₺28.000').count() > 0);
await page.screenshot({ path: `${out}/i1-ice-aktarma-basarili.png` });

// --- Başlıksız CSV de çalışmalı (Excel'de kaydedince kullanıcı başlığı silebilir vs.) ---
const noHeaderPath = `${out}/no-header.csv`;
fs.writeFileSync(noHeaderPath, '﻿Yeni Fon;Fon;1000,00;1200,50;200,50;20,05\r\n', 'utf8');
await page.setInputFiles('input[aria-label="CSV dosyası seç"]', noHeaderPath);
await page.waitForTimeout(400);
check('Başlıksız CSV de doğru içe aktarıldı', await page.locator('text=1 varlık eklendi').count() > 0);
check('Ondalık virgülle yazılmış tutar doğru okundu (₺1.201)', await page.locator('text=₺1.201').count() > 0 || await page.locator('text=₺1.200').count() > 0);

// --- Hatalı/eksik veri içeren CSV: geçersiz satırlar atlanmalı, uygulama çökmemeli ---
const badPath = `${out}/bad.csv`;
fs.writeFileSync(badPath, 'Varlık;Tür;Maliyet (TL);Güncel Değer (TL)\r\nGeçerli Varlık;Hisse;5000;5500\r\n;Hisse;1000;1000\r\nBilinmeyen Tür;Uzay Parası;500;500\r\nSayı Değil;Fon;abc;100\r\n', 'utf8');
await page.setInputFiles('input[aria-label="CSV dosyası seç"]', badPath);
await page.waitForTimeout(400);
check('Karışık dosyada 1 geçerli eklendi, 3 atlandı', await page.locator('text=1 varlık eklendi, 3 satır eksik/geçersiz veri nedeniyle atlandı').count() > 0);
check('Uygulama çökmedi (Panel hâlâ çalışıyor)', await page.locator('text=Toplam Portföy').count() > 0);
await page.screenshot({ path: `${out}/i2-hatali-dosya.png` });

// --- Tamamen boş/geçersiz dosya ---
const emptyPath = `${out}/empty.csv`;
fs.writeFileSync(emptyPath, 'sadece rastgele metin, csv degil\r\n\r\n', 'utf8');
await page.setInputFiles('input[aria-label="CSV dosyası seç"]', emptyPath);
await page.waitForTimeout(400);
check('Tamamen geçersiz dosyada hata mesajı (kırmızı)', await page.locator('text=geçerli satır bulunamadı').count() > 0);

// --- CSV içinde mevcut isimle çakışan satır: atlanmalı ve "isim çakışması" olarak raporlanmalı ---
const dupPath = `${out}/dup.csv`;
fs.writeFileSync(dupPath, 'Varlık;Tür;Maliyet (TL);Güncel Değer (TL)\r\nGeçerli Varlık;Hisse;1000;1000\r\nYepyeni Varlık;Fon;2000;2000\r\n', 'utf8');
await page.setInputFiles('input[aria-label="CSV dosyası seç"]', dupPath);
await page.waitForTimeout(400);
check('Aynı isimli satır isim çakışması nedeniyle atlandı, yeni olan eklendi',
  await page.locator('text=1 varlık eklendi, 1 satır isim çakışması nedeniyle atlandı').count() > 0);

// --- Adı "varlık" ile başlayan bir varlık, başlıksız tek satırlık CSV'de yanlışlıkla başlık sanılmamalı ---
const trickyPath = `${out}/tricky.csv`;
fs.writeFileSync(trickyPath, '﻿Varlık Yönetimi A.Ş.;Hisse;3000,00;3300,00;300,00;10,00\r\n', 'utf8');
await page.setInputFiles('input[aria-label="CSV dosyası seç"]', trickyPath);
await page.waitForTimeout(400);
check('"Varlık" ile başlayan tek veri satırı yanlış başlık sanılmadı, içe aktarıldı',
  await page.locator('text=Varlık Yönetimi A.Ş.').count() > 0);

await browser.close();
console.log(failed ? 'FAGENT_IMPORT_E2E_FAILED' : 'FAGENT_IMPORT_E2E_OK');
process.exit(failed ? 1 : 0);

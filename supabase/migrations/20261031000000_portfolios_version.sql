-- Fagent: portfolios satırına sürüm numarası (iyimser kilit; bulut-senkron-arastirma.md madde 27, Seçenek 2b).
--
-- YALNIZCA DOSYA OLARAK EKLENDİ — hiçbir Supabase projesine uygulanmadı. Üretime uygulamak açık insan
-- onayı gerektirir (AGENTS.md §1, plan adım 5). Önceki migration'a (20261018000000) DOKUNMAZ.
--
-- İstemci (src/cloud.ts, src/surum.ts) "update ... where user_id = ? and version = ?" ile yazar; sürüm
-- eşleşmezse 0 satır etkilenir ve istemci çakışma kopyası alır. Sütun yoksa istemci eski davranışa
-- (düz upsert) güvenle düşer; bu yüzden migration uygulanmadan da uygulama bozulmaz.
-- TODO(dogrulama): tetikleyici ve 0 satır davranışı gerçek projede iki istemciyle sınanmadı (adım 5).
alter table public.portfolios
  add column version bigint not null default 0,
  add constraint portfolios_version_nonneg check (version >= 0);

-- Sürümü yalnızca VERİTABANI belirler: ekleme istemci ne gönderirse göndersin 0 ile başlar, güncelleme eskisi + 1
-- olur (sürümü geriye/ileriye sarmanın yolu yok). Güvenlik tanımlayıcısı DEĞİL; çağıranın yetkisiyle çalışır.
create or replace function public.portfolios_bump_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger portfolios_bump_version
  before update on public.portfolios
  for each row execute function public.portfolios_bump_version();

-- Ekleme: istemcinin gönderdiği sürüm yok sayılır (ilk kayıt her zaman 0).
create or replace function public.portfolios_init_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := 0;
  return new;
end;
$$;

create trigger portfolios_init_version
  before insert on public.portfolios
  for each row execute function public.portfolios_init_version();

-- GERİ ALMA (down) — elle, sırayla çalıştırılır; istemci sütun yoksa düz upsert'e düştüğü için güvenlidir:
--   drop trigger if exists portfolios_init_version on public.portfolios;
--   drop trigger if exists portfolios_bump_version on public.portfolios;
--   drop function if exists public.portfolios_init_version();
--   drop function if exists public.portfolios_bump_version();
--   alter table public.portfolios drop constraint if exists portfolios_version_nonneg;
--   alter table public.portfolios drop column if exists version;

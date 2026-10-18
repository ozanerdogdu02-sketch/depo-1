-- Fagent: hesap başına kullanıcı verisi kaydı + KVKK için kullanıcının kendi hesabını silmesi.
--
-- YALNIZCA DOSYA OLARAK EKLENDİ — hiçbir Supabase projesine uygulanmadı. Üretime uygulamak
-- açık insan onayı gerektirir (AGENTS.md §1, plan adım 5). Tablo adı ve şema
-- fagent-standalone ile aynıdır.
--
-- `data` sütunu: { "fagentBackup": 1, "data": { "<BACKED_UP_KEYS anahtarı>": "<JSON metni>" } }
-- (portföy, ajan hafızası, öğretilen bilgi, vergi oranları, hedef dağılım). Eski standalone
-- satırları çıplak portföy nesnesidir; istemci ikisini de okur (src/cloud.ts).
create table public.portfolios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  -- Boyut sınırı standalone ile aynı; istemci 1.5 MB'ın üstünü zaten göndermez.
  constraint portfolios_data_size check (pg_column_size(data) < 2000000)
);

alter table public.portfolios enable row level security;

-- Savunma derinliği: anonim rol tabloya hiç erişemez (RLS'e ek olarak). anon için politika YOK.
revoke all on table public.portfolios from anon;

-- Her politika yalnızca giriş yapmış kullanıcıya ve yalnızca kendi satırına izin verir.
create policy "portfolios_select_own" on public.portfolios
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "portfolios_insert_own" on public.portfolios
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "portfolios_update_own" on public.portfolios
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "portfolios_delete_own" on public.portfolios
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Parametre ALMAZ ve yalnızca oturum sahibinin hesabını siler; başka bir user_id'yi silmenin
-- yolu yoktur. Kullanıcı verisi satırı yabancı anahtar üzerinden (on delete cascade) birlikte gider.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

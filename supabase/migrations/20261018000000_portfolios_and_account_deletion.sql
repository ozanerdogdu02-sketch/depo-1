-- Fagent: hesap başına portföy kaydı + KVKK için kullanıcının kendi hesabını silmesi.
create table public.portfolios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint portfolios_data_size check (pg_column_size(data) < 2000000)
);

alter table public.portfolios enable row level security;

create policy "portfolios_select_own" on public.portfolios
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "portfolios_insert_own" on public.portfolios
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "portfolios_update_own" on public.portfolios
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "portfolios_delete_own" on public.portfolios
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Yalnızca oturum sahibinin hesabını siler; portföy satırı cascade ile birlikte gider.
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

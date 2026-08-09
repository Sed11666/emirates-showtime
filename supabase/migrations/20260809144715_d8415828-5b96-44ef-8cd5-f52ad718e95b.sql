create table if not exists public.admin_allowlist (
  email text primary key,
  created_at timestamptz not null default now()
);

grant select on public.admin_allowlist to authenticated;
grant all on public.admin_allowlist to service_role;

alter table public.admin_allowlist enable row level security;

drop policy if exists "Admins can view allowlist" on public.admin_allowlist;
create policy "Admins can view allowlist"
on public.admin_allowlist for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

insert into public.admin_allowlist (email) values ('syedebaad609@gmail.com')
on conflict (email) do nothing;

create or replace function public.claim_admin_role()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_verified boolean;
begin
  select lower(u.email), (u.email_confirmed_at is not null)
    into v_email, v_verified
  from auth.users u
  where u.id = auth.uid();

  if v_email is null or not coalesce(v_verified, false) then
    return false;
  end if;

  if not exists (select 1 from public.admin_allowlist a where lower(a.email) = v_email) then
    return false;
  end if;

  insert into public.user_roles (user_id, role)
  values (auth.uid(), 'admin')
  on conflict (user_id, role) do nothing;

  return true;
end;
$$;

revoke all on function public.claim_admin_role() from public, anon;
grant execute on function public.claim_admin_role() to authenticated;
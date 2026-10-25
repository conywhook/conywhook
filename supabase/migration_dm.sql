-- Миграция: личные сообщения между участниками.
-- Выполните в SQL Editor один раз, если схема уже установлена (после migration_chat.sql).

-- ---------- Личные сообщения ----------
create table if not exists public.direct_messages (
  id             bigint generated always as identity primary key,
  sender_uid     bigint not null references public.profiles(uid),
  recipient_uid  bigint not null references public.profiles(uid),
  body           text not null check (char_length(body) between 1 and 1000),
  created_at     timestamptz not null default now(),
  check (sender_uid <> recipient_uid)
);
create index if not exists idx_dm_sender on public.direct_messages(sender_uid, id);
create index if not exists idx_dm_recipient on public.direct_messages(recipient_uid, id);

alter table public.direct_messages enable row level security;
drop policy if exists "dm own" on public.direct_messages;
create policy "dm own" on public.direct_messages for select to authenticated
  using (sender_uid = public.current_uid() or recipient_uid = public.current_uid());

create or replace function public.send_dm(p_to bigint, p_body text) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_me   bigint := public.current_uid();
  v_last timestamptz;
  v_body text := trim(coalesce(p_body, ''));
  v_id   bigint;
begin
  if v_me is null then raise exception 'Сначала войдите в аккаунт.'; end if;
  if public.is_banned() then raise exception 'Аккаунт заблокирован.'; end if;
  if p_to = v_me then raise exception 'Нельзя писать самому себе.'; end if;
  if not exists (select 1 from public.profiles where uid = p_to) then
    raise exception 'Пользователь не найден.';
  end if;
  if char_length(v_body) not between 1 and 1000 then
    raise exception 'Сообщение: от 1 до 1000 символов.';
  end if;
  select created_at into v_last from public.direct_messages
    where sender_uid = v_me order by id desc limit 1;
  if v_last is not null and now() - v_last < interval '2 seconds' then
    raise exception 'Не так быстро: подождите несколько секунд.';
  end if;
  insert into public.direct_messages (sender_uid, recipient_uid, body)
    values (v_me, p_to, v_body) returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.send_dm(bigint, text) from public, anon;
grant execute on function public.send_dm(bigint, text) to authenticated;
grant select on public.direct_messages to authenticated;

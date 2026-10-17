-- Миграция: общий чат, очистка ботом и статистика участников.
-- Выполните в SQL Editor один раз, если схема уже установлена (после migration_avatars.sql).

create table if not exists public.chat_messages (
  id          bigint generated always as identity primary key,
  author_uid  bigint references public.profiles(uid),
  body        text not null check (char_length(body) between 1 and 1000),
  is_bot      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_chat_messages_author on public.chat_messages(author_uid);

alter table public.chat_messages enable row level security;
drop policy if exists "chat readable by members" on public.chat_messages;
create policy "chat readable by members" on public.chat_messages for select to authenticated using (true);

create or replace function public.send_chat_message(p_body text) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_me   bigint := public.current_uid();
  v_last timestamptz;
  v_body text := trim(coalesce(p_body, ''));
  v_id   bigint;
begin
  if v_me is null then raise exception 'Сначала войдите в аккаунт.'; end if;
  if public.is_banned() then raise exception 'Аккаунт заблокирован.'; end if;
  if char_length(v_body) not between 1 and 1000 then
    raise exception 'Сообщение: от 1 до 1000 символов.';
  end if;
  select created_at into v_last from public.chat_messages
    where author_uid = v_me order by id desc limit 1;
  if v_last is not null and now() - v_last < interval '3 seconds' then
    raise exception 'Не так быстро: подождите несколько секунд.';
  end if;
  insert into public.chat_messages (author_uid, body) values (v_me, v_body) returning id into v_id;
  return v_id;
end $$;

create or replace function public.clear_chat() returns void
language plpgsql security definer set search_path = public as $$
declare v_notice bigint;
begin
  if not public.is_staff() then raise exception 'Недостаточно прав.'; end if;
  insert into public.chat_messages (author_uid, body, is_bot)
    values (null, 'ChatBot: chat cleanup started. All messages are being removed.', true)
    returning id into v_notice;
  delete from public.chat_messages where id <> v_notice;
  insert into public.chat_messages (author_uid, body, is_bot)
    values (null, 'ChatBot: chat has been cleared.', true);
end $$;

create or replace function public.site_stats()
returns table (members bigint, last_uid bigint, last_username text, last_joined timestamptz)
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.profiles), p.uid, p.username, p.created_at
  from public.profiles p
  order by p.created_at desc, p.uid desc
  limit 1
$$;

revoke execute on function public.send_chat_message(text) from public, anon;
revoke execute on function public.clear_chat() from public, anon;
revoke execute on function public.site_stats() from public;
grant execute on function public.send_chat_message(text) to authenticated;
grant execute on function public.clear_chat() to authenticated;
grant execute on function public.site_stats() to anon, authenticated;
grant select on public.chat_messages to authenticated;

-- Миграция: тикеты (баги и вопросы по сайту).
-- Выполните в SQL Editor один раз, если схема уже установлена (после migration_bans.sql).

-- ---------- Тикеты (баги и вопросы по сайту) ----------
create table if not exists public.tickets (
  id          bigint generated always as identity primary key,
  author_uid  bigint not null references public.profiles(uid),
  subject     text not null check (char_length(subject) between 3 and 120),
  status      text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.ticket_messages (
  id          bigint generated always as identity primary key,
  ticket_id   bigint not null references public.tickets(id) on delete cascade,
  author_uid  bigint not null references public.profiles(uid),
  body        text not null check (char_length(body) between 1 and 5000),
  created_at  timestamptz not null default now()
);
create index if not exists idx_ticket_messages_ticket on public.ticket_messages(ticket_id);

alter table public.tickets enable row level security;
alter table public.ticket_messages enable row level security;

drop policy if exists "tickets own or staff" on public.tickets;
create policy "tickets own or staff" on public.tickets for select to authenticated
  using (author_uid = public.current_uid() or public.is_staff());

drop policy if exists "ticket messages own or staff" on public.ticket_messages;
create policy "ticket messages own or staff" on public.ticket_messages for select to authenticated
  using (exists (select 1 from public.tickets t
                 where t.id = ticket_id and (t.author_uid = public.current_uid() or public.is_staff())));

create or replace function public.create_ticket(p_subject text, p_body text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_me  bigint := public.current_uid();
  v_tid bigint;
  v_ts  timestamptz := now();
begin
  if v_me is null then raise exception 'Сначала войдите в аккаунт.'; end if;
  if public.is_banned() then raise exception 'Аккаунт заблокирован.'; end if;
  if char_length(trim(p_subject)) not between 3 and 120 then
    raise exception 'Тема: от 3 до 120 символов.';
  end if;
  if char_length(trim(p_body)) not between 1 and 5000 then
    raise exception 'Описание: от 1 до 5000 символов.';
  end if;
  insert into public.tickets (author_uid, subject, created_at, updated_at)
    values (v_me, trim(p_subject), v_ts, v_ts) returning id into v_tid;
  insert into public.ticket_messages (ticket_id, author_uid, body, created_at)
    values (v_tid, v_me, trim(p_body), v_ts);
  return v_tid;
end $$;

create or replace function public.reply_ticket(p_ticket bigint, p_body text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_me     bigint := public.current_uid();
  v_author bigint;
  v_status text;
  v_mid    bigint;
begin
  if v_me is null then raise exception 'Сначала войдите в аккаунт.'; end if;
  if public.is_banned() then raise exception 'Аккаунт заблокирован.'; end if;
  select author_uid, status into v_author, v_status from public.tickets where id = p_ticket;
  if not found then raise exception 'Тикет не найден.'; end if;
  if v_author <> v_me and not public.is_staff() then
    raise exception 'Недостаточно прав.';
  end if;
  if v_status = 'closed' and not public.is_staff() then
    raise exception 'Тикет закрыт.';
  end if;
  if char_length(trim(p_body)) not between 1 and 5000 then
    raise exception 'Сообщение: от 1 до 5000 символов.';
  end if;
  insert into public.ticket_messages (ticket_id, author_uid, body)
    values (p_ticket, v_me, trim(p_body)) returning id into v_mid;
  update public.tickets
    set updated_at = now(),
        status = case when public.is_staff() and status = 'open' then 'in_progress' else status end
    where id = p_ticket;
  return v_mid;
end $$;

create or replace function public.set_ticket_status(p_ticket bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Недостаточно прав.'; end if;
  if p_status not in ('open', 'in_progress', 'closed') then raise exception 'Недопустимый статус.'; end if;
  update public.tickets set status = p_status, updated_at = now() where id = p_ticket;
  if not found then raise exception 'Тикет не найден.'; end if;
end $$;

revoke execute on function public.create_ticket(text, text) from public, anon;
revoke execute on function public.reply_ticket(bigint, text) from public, anon;
revoke execute on function public.set_ticket_status(bigint, text) from public, anon;
grant execute on function public.create_ticket(text, text), public.reply_ticket(bigint, text),
  public.set_ticket_status(bigint, text) to authenticated;
grant select on public.tickets, public.ticket_messages to authenticated;

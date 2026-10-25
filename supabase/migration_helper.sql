-- Миграция: роль «Помощник» (тикеты: видит все, отвечает и меняет статус; без банов и ролей).
-- Выполните в SQL Editor один раз, если схема уже установлена (после migration_tickets.sql).

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('owner', 'admin', 'helper', 'user'));

create or replace function public.is_support() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role in ('owner', 'admin') and not banned)
$$;
revoke execute on function public.is_support() from public, anon;
grant execute on function public.is_support() to authenticated;

create or replace function public.set_role(p_uid bigint, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Только владелец может менять роли.'; end if;
  if p_role not in ('admin', 'helper', 'user') then raise exception 'Недопустимая роль.'; end if;
  if not exists (select 1 from public.profiles where uid = p_uid) then
    raise exception 'Пользователь не найден.';
  end if;
  if (select role from public.profiles where uid = p_uid) = 'owner' then
    raise exception 'Роль владельца нельзя изменить.';
  end if;
  update public.profiles set role = p_role where uid = p_uid;
end $$;

drop policy if exists "tickets own or staff" on public.tickets;
create policy "tickets own or staff" on public.tickets for select to authenticated
  using (author_uid = public.current_uid() or public.is_support());

drop policy if exists "ticket messages own or staff" on public.ticket_messages;
create policy "ticket messages own or staff" on public.ticket_messages for select to authenticated
  using (exists (select 1 from public.tickets t
                 where t.id = ticket_id and (t.author_uid = public.current_uid() or public.is_support())));

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
  if v_author <> v_me and not public.is_support() then
    raise exception 'Недостаточно прав.';
  end if;
  if v_status = 'closed' and not public.is_support() then
    raise exception 'Тикет закрыт.';
  end if;
  if char_length(trim(p_body)) not between 1 and 5000 then
    raise exception 'Сообщение: от 1 до 5000 символов.';
  end if;
  insert into public.ticket_messages (ticket_id, author_uid, body)
    values (p_ticket, v_me, trim(p_body)) returning id into v_mid;
  update public.tickets
    set updated_at = now(),
        status = case when public.is_support() and status = 'open' then 'in_progress' else status end
    where id = p_ticket;
  return v_mid;
end $$;

create or replace function public.set_ticket_status(p_ticket bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_support() then raise exception 'Недостаточно прав.'; end if;
  if p_status not in ('open', 'in_progress', 'closed') then raise exception 'Недопустимый статус.'; end if;
  update public.tickets set status = p_status, updated_at = now() where id = p_ticket;
  if not found then raise exception 'Тикет не найден.'; end if;
end $$;

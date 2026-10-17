-- Миграция: баны пользователей.
-- Выполните в SQL Editor один раз, если схема уже установлена (после migration_staff_only.sql).

alter table public.profiles add column if not exists banned boolean not null default false;

create or replace function public.is_banned() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and banned)
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'admin') and not banned)
$$;

drop function if exists public.my_profile();
create or replace function public.my_profile()
returns table (uid bigint, username text, role text, banned boolean)
language sql stable security definer set search_path = public as $$
  select p.uid, p.username, p.role, p.banned from public.profiles p where p.id = auth.uid()
$$;
revoke execute on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

revoke execute on function public.is_banned() from public, anon;
grant execute on function public.is_banned() to authenticated;

create or replace function public.set_ban(p_uid bigint, p_banned boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_my_role text;
  v_target  public.profiles%rowtype;
begin
  if not public.is_staff() then raise exception 'Недостаточно прав.'; end if;
  select role into v_my_role from public.profiles where id = auth.uid();
  select * into v_target from public.profiles where uid = p_uid;
  if not found then raise exception 'Пользователь не найден.'; end if;
  if v_target.uid = public.current_uid() then raise exception 'Нельзя заблокировать себя.'; end if;
  if v_target.role = 'owner' then raise exception 'Владельца нельзя заблокировать.'; end if;
  if v_target.role = 'admin' and v_my_role <> 'owner' then
    raise exception 'Только владелец может блокировать администраторов.';
  end if;
  update public.profiles set banned = p_banned where uid = p_uid;
  -- Вход в Supabase Auth блокируется через banned_until (так же, как бан в панели Supabase)
  update auth.users
    set banned_until = case when p_banned then 'infinity'::timestamptz else null end
    where id = v_target.id;
end $$;

revoke execute on function public.set_ban(bigint, boolean) from public, anon;
grant execute on function public.set_ban(bigint, boolean) to authenticated;

grant select (uid, username, role, invited_by, created_at, banned) on public.profiles to anon, authenticated;

-- Запрет писать заблокированным (тред и ответ), обновлённые функции:
create or replace function public.create_thread(p_category bigint, p_title text, p_body text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_me  bigint := public.current_uid();
  v_tid bigint;
  v_ts  timestamptz := now();
  v_staff_only boolean;
begin
  if v_me is null then raise exception 'Сначала войдите в аккаунт.'; end if;
  if public.is_banned() then raise exception 'Аккаунт заблокирован.'; end if;
  select staff_only into v_staff_only from public.categories where id = p_category;
  if not found then raise exception 'Раздел не найден.'; end if;
  if v_staff_only and not public.is_staff() then
    raise exception 'В этот раздел могут писать только администраторы.';
  end if;
  if char_length(trim(p_title)) not between 3 and 120 then
    raise exception 'Заголовок: от 3 до 120 символов.';
  end if;
  if char_length(trim(p_body)) not between 1 and 20000 then
    raise exception 'Текст сообщения: от 1 до 20000 символов.';
  end if;
  insert into public.threads (category_id, author_uid, title, created_at, last_post_at)
    values (p_category, v_me, trim(p_title), v_ts, v_ts)
    returning id into v_tid;
  insert into public.posts (thread_id, author_uid, body, created_at)
    values (v_tid, v_me, trim(p_body), v_ts);
  return v_tid;
end $$;

create or replace function public.reply_to_thread(p_thread bigint, p_body text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_me     bigint := public.current_uid();
  v_locked boolean;
  v_staff_only boolean;
  v_pid    bigint;
begin
  if v_me is null then raise exception 'Сначала войдите в аккаунт.'; end if;
  if public.is_banned() then raise exception 'Аккаунт заблокирован.'; end if;
  select t.is_locked, c.staff_only into v_locked, v_staff_only
    from public.threads t join public.categories c on c.id = t.category_id
    where t.id = p_thread;
  if not found then raise exception 'Тред не найден.'; end if;
  if v_staff_only and not public.is_staff() then
    raise exception 'В этот раздел могут писать только администраторы.';
  end if;
  if v_locked and not public.is_staff() then
    raise exception 'Тред закрыт для ответов.';
  end if;
  if char_length(trim(p_body)) not between 1 and 20000 then
    raise exception 'Текст сообщения: от 1 до 20000 символов.';
  end if;
  insert into public.posts (thread_id, author_uid, body, created_at)
    values (p_thread, v_me, trim(p_body), now())
    returning id into v_pid;
  update public.threads set last_post_at = now() where id = p_thread;
  return v_pid;
end $$;

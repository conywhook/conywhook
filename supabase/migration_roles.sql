-- =====================================================================
-- Миграция: роли Coder и Premium + скрытый раздел.
-- Выполните в SQL Editor один раз, если схема уже была установлена.
-- (В свежий schema.sql этот блок уже включён в конец файла.)
-- Скрытый раздел видят и могут писать в нём только: Premium, Coder, Администратор, Владелец.
-- Роли Coder и Premium сами по себе никаких прав модерации не дают.
-- =====================================================================

-- 1. Новые роли
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner', 'admin', 'helper', 'coder', 'premium', 'user'));

-- 2. Флаг скрытого раздела
alter table public.categories add column if not exists vip_only boolean not null default false;

-- 3. Кто имеет доступ к скрытому разделу (заблокированные не имеют)
create or replace function public.is_vip() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role in ('owner', 'admin', 'coder', 'premium') and not banned)
$$;

-- Проверки видимости. security definer нужен, чтобы читать categories/threads мимо RLS
-- (иначе скрытый раздел «пропал бы» из подзапроса и политика пропустила бы его треды).
create or replace function public.can_view_category(p_cat bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (not c.vip_only) or public.is_vip() from public.categories c where c.id = p_cat), false)
$$;

create or replace function public.can_view_thread(p_thread bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.can_view_category(t.category_id) from public.threads t where t.id = p_thread), false)
$$;

revoke execute on function public.is_vip(), public.can_view_category(bigint), public.can_view_thread(bigint) from public;
grant execute on function public.is_vip(), public.can_view_category(bigint), public.can_view_thread(bigint)
  to anon, authenticated;

-- 4. RLS: скрытый раздел, его треды и сообщения читают только vip-роли
drop policy if exists "categories readable" on public.categories;
create policy "categories readable" on public.categories for select
  using (not vip_only or public.is_vip());

drop policy if exists "threads readable" on public.threads;
create policy "threads readable" on public.threads for select
  using (public.can_view_category(category_id));

drop policy if exists "posts readable" on public.posts;
create policy "posts readable" on public.posts for select
  using (public.can_view_thread(thread_id));

-- 5. Запись: в скрытый раздел пишут только vip-роли
create or replace function public.create_thread(p_category bigint, p_title text, p_body text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_me  bigint := public.current_uid();
  v_tid bigint;
  v_ts  timestamptz := now();
  v_staff_only boolean;
  v_vip_only   boolean;
begin
  if v_me is null then raise exception 'Сначала войдите в аккаунт.'; end if;
  if public.is_banned() then raise exception 'Аккаунт заблокирован.'; end if;
  select staff_only, vip_only into v_staff_only, v_vip_only from public.categories where id = p_category;
  if not found then raise exception 'Раздел не найден.'; end if;
  if v_vip_only and not public.is_vip() then raise exception 'Раздел не найден.'; end if;
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
  v_vip_only   boolean;
  v_pid    bigint;
begin
  if v_me is null then raise exception 'Сначала войдите в аккаунт.'; end if;
  if public.is_banned() then raise exception 'Аккаунт заблокирован.'; end if;
  select t.is_locked, c.staff_only, c.vip_only into v_locked, v_staff_only, v_vip_only
    from public.threads t join public.categories c on c.id = t.category_id
    where t.id = p_thread;
  if not found then raise exception 'Тред не найден.'; end if;
  if v_vip_only and not public.is_vip() then raise exception 'Тред не найден.'; end if;
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

-- 6. Роли выдаёт только владелец (в том числе Premium после оформления подписки через тикет)
create or replace function public.set_role(p_uid bigint, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Только владелец может менять роли.'; end if;
  if p_role not in ('admin', 'helper', 'coder', 'premium', 'user') then raise exception 'Недопустимая роль.'; end if;
  if not exists (select 1 from public.profiles where uid = p_uid) then
    raise exception 'Пользователь не найден.';
  end if;
  if (select role from public.profiles where uid = p_uid) = 'owner' then
    raise exception 'Роль владельца нельзя изменить.';
  end if;
  update public.profiles set role = p_role where uid = p_uid;
end $$;

-- 7. Создание раздела с флагом «скрытый»
drop function if exists public.create_category(text, text, int);
create or replace function public.create_category(p_name text, p_description text, p_position int, p_vip_only boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Недостаточно прав.'; end if;
  if char_length(trim(p_name)) not between 1 and 60 then
    raise exception 'Название раздела: от 1 до 60 символов.';
  end if;
  insert into public.categories (name, description, position, vip_only)
    values (trim(p_name), left(coalesce(p_description, ''), 200), coalesce(p_position, 0), coalesce(p_vip_only, false));
end $$;
revoke execute on function public.create_category(text, text, int, boolean) from public, anon;
grant execute on function public.create_category(text, text, int, boolean) to authenticated;

-- 8. Скрытый раздел (создаётся один раз)
insert into public.categories (name, description, position, vip_only)
select 'Скрытый раздел', 'Виден только Premium, Coder, администраторам и владельцу', 4, true
where not exists (select 1 from public.categories where vip_only);

-- Первый тред в нём: создаётся, только если владелец уже есть в базе.
-- Если владельца ещё нет, просто создайте тред в скрытом разделе уже после входа.
do $$
declare v_owner bigint; v_cat bigint; v_tid bigint;
begin
  select uid into v_owner from public.profiles where role = 'owner' order by uid limit 1;
  select id into v_cat from public.categories where vip_only order by id limit 1;
  if v_owner is not null and v_cat is not null
     and not exists (select 1 from public.threads where category_id = v_cat) then
    insert into public.threads (category_id, author_uid, title)
      values (v_cat, v_owner, 'Скрытый тред') returning id into v_tid;
    insert into public.posts (thread_id, author_uid, body)
      values (v_tid, v_owner, 'Этот тред виден только ролям Premium, Coder, Администратор и Владелец.');
  end if;
end $$;

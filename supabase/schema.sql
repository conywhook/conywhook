-- =====================================================================
-- conywhook forum: схема для Supabase (PostgreSQL)
-- Выполните ЦЕЛИКОМ в SQL Editor вашего проекта. Один раз.
-- =====================================================================

-- ---------- 1. Таблицы ----------
create table if not exists public.profiles (
  uid         bigint generated always as identity primary key,
  id          uuid not null unique references auth.users(id) on delete cascade,
  username    text not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  role        text not null default 'user' check (role in ('owner', 'admin', 'user')),
  invited_by  bigint references public.profiles(uid),
  created_at  timestamptz not null default now()
);
create unique index if not exists profiles_username_lower on public.profiles (lower(username));

create table if not exists public.invites (
  code        text primary key,
  created_by  bigint references public.profiles(uid),   -- null для первого (стартового) инвайта
  created_at  timestamptz not null default now(),
  used_by     bigint references public.profiles(uid),
  used_at     timestamptz
);

create table if not exists public.categories (
  id          bigint generated always as identity primary key,
  name        text not null,
  description text not null default '',
  position    int not null default 0
);

create table if not exists public.threads (
  id           bigint generated always as identity primary key,
  category_id  bigint not null references public.categories(id),
  author_uid   bigint not null references public.profiles(uid),
  title        text not null,
  created_at   timestamptz not null default now(),
  last_post_at timestamptz not null default now(),
  is_pinned    boolean not null default false,
  is_locked    boolean not null default false
);
create index if not exists idx_threads_category on public.threads(category_id);

create table if not exists public.posts (
  id          bigint generated always as identity primary key,
  thread_id   bigint not null references public.threads(id),
  author_uid  bigint not null references public.profiles(uid),
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_posts_thread on public.posts(thread_id);

-- Удобное представление: треды с автором, разделом и числом ответов
create or replace view public.thread_list with (security_invoker = true) as
select t.id, t.category_id, c.name as category_name,
       t.author_uid, a.username as author_name,
       t.title, t.created_at, t.last_post_at, t.is_pinned, t.is_locked,
       (select count(*) from public.posts p where p.thread_id = t.id) - 1 as replies
from public.threads t
join public.categories c on c.id = t.category_id
join public.profiles a on a.uid = t.author_uid;

-- ---------- 2. Вспомогательные функции ----------
create or replace function public.current_uid() returns bigint
language sql stable security definer set search_path = public as $$
  select uid from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'admin'))
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
$$;

-- ---------- 3. Регистрация только по инвайту ----------
-- Срабатывает при создании аккаунта. Если инвайт неверный или занят,
-- регистрация отменяется целиком.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_invite text := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite', '')));
  v_name   text := trim(coalesce(new.raw_user_meta_data ->> 'username', ''));
  v_inv    public.invites%rowtype;
  v_uid    bigint;
begin
  if v_name !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'Ник: 3–20 символов, латиница, цифры и _.';
  end if;
  select * into v_inv from public.invites
    where code = v_invite and used_by is null for update;
  if not found then
    raise exception 'Инвайт-код недействителен или уже использован.';
  end if;
  insert into public.profiles (id, username, invited_by)
    values (new.id, v_name, v_inv.created_by)
    returning uid into v_uid;
  update public.invites set used_by = v_uid, used_at = now() where code = v_invite;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Проверка инвайта до регистрации (для понятного сообщения в интерфейсе)
create or replace function public.check_invite(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.invites
                 where code = upper(trim(p_code)) and used_by is null)
$$;

-- ---------- 4. Профиль текущего пользователя ----------
create or replace function public.my_profile()
returns table (uid bigint, username text, role text)
language sql stable security definer set search_path = public as $$
  select p.uid, p.username, p.role from public.profiles p where p.id = auth.uid()
$$;

-- ---------- 5. Форум: создание и ответы ----------
create or replace function public.create_thread(p_category bigint, p_title text, p_body text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_me  bigint := public.current_uid();
  v_tid bigint;
  v_ts  timestamptz := now();
begin
  if v_me is null then raise exception 'Сначала войдите в аккаунт.'; end if;
  if char_length(trim(p_title)) not between 3 and 120 then
    raise exception 'Заголовок: от 3 до 120 символов.';
  end if;
  if char_length(trim(p_body)) not between 1 and 20000 then
    raise exception 'Текст сообщения: от 1 до 20000 символов.';
  end if;
  if not exists (select 1 from public.categories where id = p_category) then
    raise exception 'Раздел не найден.';
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
  v_pid    bigint;
begin
  if v_me is null then raise exception 'Сначала войдите в аккаунт.'; end if;
  select is_locked into v_locked from public.threads where id = p_thread;
  if not found then raise exception 'Тред не найден.'; end if;
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

-- ---------- 6. Модерация (владелец и админы) ----------
create or replace function public.mod_thread(p_thread bigint, p_action text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Недостаточно прав.'; end if;
  if p_action = 'pin' then
    update public.threads set is_pinned = not is_pinned where id = p_thread;
  elsif p_action = 'lock' then
    update public.threads set is_locked = not is_locked where id = p_thread;
  else
    raise exception 'Неизвестное действие.';
  end if;
  if not found then raise exception 'Тред не найден.'; end if;
end $$;

create or replace function public.delete_thread(p_thread bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Недостаточно прав.'; end if;
  if not exists (select 1 from public.threads where id = p_thread) then
    raise exception 'Тред не найден.';
  end if;
  delete from public.posts where thread_id = p_thread;
  delete from public.threads where id = p_thread;
end $$;

create or replace function public.delete_post(p_post bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_thread bigint;
begin
  if not public.is_staff() then raise exception 'Недостаточно прав.'; end if;
  select thread_id into v_thread from public.posts where id = p_post;
  if not found then raise exception 'Сообщение не найдено.'; end if;
  if (select min(id) from public.posts where thread_id = v_thread) = p_post then
    raise exception 'Первое сообщение нельзя удалить отдельно. Удалите весь тред.';
  end if;
  delete from public.posts where id = p_post;
end $$;

-- ---------- 7. Инвайты и роли ----------
create or replace function public.create_invite() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_hex  text := upper(replace(gen_random_uuid()::text, '-', ''));
  v_code text;
begin
  if not public.is_staff() then raise exception 'Недостаточно прав.'; end if;
  v_code := 'CW-' || substr(v_hex, 1, 4) || '-' || substr(v_hex, 5, 4) || '-' || substr(v_hex, 9, 4);
  insert into public.invites (code, created_by) values (v_code, public.current_uid());
  return v_code;
end $$;

-- Только владелец. Владельца нельзя понизить через интерфейс.
create or replace function public.set_role(p_uid bigint, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Только владелец может менять роли.'; end if;
  if p_role not in ('admin', 'user') then raise exception 'Недопустимая роль.'; end if;
  if not exists (select 1 from public.profiles where uid = p_uid) then
    raise exception 'Пользователь не найден.';
  end if;
  if (select role from public.profiles where uid = p_uid) = 'owner' then
    raise exception 'Роль владельца нельзя изменить.';
  end if;
  update public.profiles set role = p_role where uid = p_uid;
end $$;

create or replace function public.create_category(p_name text, p_description text, p_position int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Недостаточно прав.'; end if;
  if char_length(trim(p_name)) not between 1 and 60 then
    raise exception 'Название раздела: от 1 до 60 символов.';
  end if;
  insert into public.categories (name, description, position)
    values (trim(p_name), left(coalesce(p_description, ''), 200), coalesce(p_position, 0));
end $$;

-- ---------- 8. Безопасность: RLS и права ----------
alter table public.profiles   enable row level security;
alter table public.invites    enable row level security;
alter table public.categories enable row level security;
alter table public.threads    enable row level security;
alter table public.posts      enable row level security;

create policy "profiles readable"   on public.profiles   for select using (true);
create policy "invites staff read"  on public.invites    for select to authenticated using (public.is_staff());
create policy "categories readable" on public.categories for select using (true);
create policy "threads readable"    on public.threads    for select using (true);
create policy "posts readable"      on public.posts      for select using (true);

-- Все изменения данных идут только через функции выше. Прямая запись запрещена.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant select on public.categories, public.threads, public.posts to anon, authenticated;
-- пароли и служебные поля (id = auth uuid) наружу не отдаём
grant select (uid, username, role, invited_by, created_at) on public.profiles to anon, authenticated;
grant select on public.invites to authenticated;
grant select on public.thread_list to anon, authenticated;

grant execute on function public.check_invite(text) to anon, authenticated;
grant execute on function public.current_uid(), public.is_staff(), public.is_owner(),
  public.my_profile(), public.create_thread(bigint, text, text),
  public.reply_to_thread(bigint, text), public.mod_thread(bigint, text),
  public.delete_thread(bigint), public.delete_post(bigint), public.create_invite(),
  public.set_role(bigint, text), public.create_category(text, text, int)
  to authenticated;

-- ---------- 9. Стартовые данные (выполнить один раз) ----------
insert into public.categories (name, description, position)
select * from (values
  ('Объявления', 'Новости от команды', 1),
  ('Читы и обновления', 'Обсуждение релизов и апдейтов', 2),
  ('Общее', 'Всё остальное', 3)
) as v(name, description, position)
where not exists (select 1 from public.categories);

-- Стартовый инвайт для владельца. Замените код на свой (формат CW-XXXX-XXXX-XXXX)
-- и используйте только один раз: после регистрации он сгорает.
insert into public.invites (code) values ('CW-OWNR-0000-0001') on conflict do nothing;

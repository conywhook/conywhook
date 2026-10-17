-- Миграция: разделы только для администрации.
-- Выполните в SQL Editor один раз, если схема уже была установлена.

alter table public.categories add column if not exists staff_only boolean not null default false;

update public.categories set staff_only = true where id in (1, 2);

create or replace function public.create_thread(p_category bigint, p_title text, p_body text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_me  bigint := public.current_uid();
  v_tid bigint;
  v_ts  timestamptz := now();
  v_staff_only boolean;
begin
  if v_me is null then raise exception 'Сначала войдите в аккаунт.'; end if;
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

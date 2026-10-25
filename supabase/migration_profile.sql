-- Миграция: профиль (аватар-ссылка и описание).
-- Выполните в SQL Editor один раз, если схема уже установлена (после migration_helper.sql).

-- ---------- Профиль: аватар (ссылка https) и описание ----------
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text not null default '';

alter table public.profiles drop constraint if exists profiles_avatar_url_check;
alter table public.profiles add constraint profiles_avatar_url_check
  check (avatar_url is null or (avatar_url ~ '^https://[^[:space:]]+$' and char_length(avatar_url) <= 500));

alter table public.profiles drop constraint if exists profiles_bio_check;
alter table public.profiles add constraint profiles_bio_check check (char_length(bio) <= 500);

create or replace function public.update_profile(p_avatar text, p_bio text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_avatar text := nullif(trim(coalesce(p_avatar, '')), '');
  v_bio    text := trim(coalesce(p_bio, ''));
begin
  if public.current_uid() is null then raise exception 'Сначала войдите в аккаунт.'; end if;
  if v_avatar is not null and (v_avatar !~ '^https://[^[:space:]]+$' or char_length(v_avatar) > 500) then
    raise exception 'Аватар: нужна ссылка, которая начинается с https://';
  end if;
  if char_length(v_bio) > 500 then
    raise exception 'Описание: не больше 500 символов.';
  end if;
  update public.profiles set avatar_url = v_avatar, bio = v_bio where id = auth.uid();
end $$;

revoke execute on function public.update_profile(text, text) from public, anon;
grant execute on function public.update_profile(text, text) to authenticated;
grant select (avatar_url, bio) on public.profiles to anon, authenticated;

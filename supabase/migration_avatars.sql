-- Миграция: загрузка аватара файлом (бакет avatars, до 2 МБ, картинки).
-- Выполните в SQL Editor один раз, если схема уже установлена (после migration_profile.sql).

-- ---------- Хранилище аватаров (загрузка файла в профиле) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars read" on storage.objects;
create policy "avatars read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists "avatars upload own folder" on storage.objects;
create policy "avatars upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars'
              and (storage.foldername(name))[1] = public.current_uid()::text
              and not public.is_banned());

drop policy if exists "avatars delete own folder" on storage.objects;
create policy "avatars delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = public.current_uid()::text);

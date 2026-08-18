-- Media storage for trial photos and videos. Files are uploaded by the app's
-- sync engine; the public URL is stored on the metric row.

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- MVP policies matching the table RLS stance: the anon key may read and
-- upload media but not delete. Tighten when real auth lands.
create policy media_anon_read on storage.objects
  for select to anon using (bucket_id = 'media');

create policy media_anon_insert on storage.objects
  for insert to anon with check (bucket_id = 'media');

create policy media_anon_update on storage.objects
  for update to anon using (bucket_id = 'media') with check (bucket_id = 'media');

-- ============================================================================
-- ÉLARÉ BEAUTY — storage buckets
-- product-media: public read, admin write.   review-media: public read, each
-- customer writes only inside a folder named after their own user id.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-media', 'product-media', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm']),
  ('review-media',  'review-media',  true, 5242880,  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "product media: public read" on storage.objects for select
  using (bucket_id = 'product-media');
create policy "product media: admin write" on storage.objects for insert
  with check (bucket_id = 'product-media' and public.is_admin());
create policy "product media: admin update" on storage.objects for update
  using (bucket_id = 'product-media' and public.is_admin());
create policy "product media: admin delete" on storage.objects for delete
  using (bucket_id = 'product-media' and public.is_admin());

create policy "review media: public read" on storage.objects for select
  using (bucket_id = 'review-media');
create policy "review media: own folder write" on storage.objects for insert
  with check (bucket_id = 'review-media' and auth.uid() is not null and (storage.foldername(name))[1] = auth.uid()::text);
create policy "review media: own folder delete" on storage.objects for delete
  using (bucket_id = 'review-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

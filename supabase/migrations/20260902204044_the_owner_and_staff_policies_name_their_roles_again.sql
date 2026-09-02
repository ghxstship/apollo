/* The same mistake as the signing policy, and this one explains the symptom.

   The original owner-or-staff policies on storage.objects were created
   `to authenticated`. When the bucket moved I rewrote them without a TO list,
   which defaults to PUBLIC — so an anonymous request now evaluated a policy
   whose USING clause calls public.is_staff(), a function anon has no EXECUTE
   on. Postgres does not skip a policy it cannot evaluate: it raises
   "permission denied for function is_staff" and the whole SELECT fails,
   including the separate, perfectly valid policy that would have let the
   visitor sign an approved frame.

   That is why /gallery went blank for signed-out visitors while a signed-in
   member could still see it, and why restoring the TO list on the signing
   policy alone did not fix it — the failing policy was a different one.

   A role list on a policy is not decoration. It is what keeps a privileged
   check from ever being evaluated by a role that cannot make it. */

drop policy if exists "owner or staff reads episode media" on storage.objects;
drop policy if exists "owner or staff removes episode media" on storage.objects;

create policy "owner or staff reads episode media" on storage.objects
  for select to authenticated
  using (bucket_id = 'episode-media' and (owner = auth.uid() or public.is_staff()));

create policy "owner or staff removes episode media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'episode-media' and (owner = auth.uid() or public.is_staff()));

/* Prove an anonymous reader can evaluate every SELECT policy on the table
   without tripping a privilege it does not hold. */
do $$
declare seen int;
begin
  set local role anon;
  select count(*) into seen from storage.objects where bucket_id = 'episode-media';
  reset role;
  raise notice 'anon evaluated the object policies cleanly (% rows visible)', seen;
end $$;;

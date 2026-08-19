-- These all self-check auth.uid(), but they have no business on the anon surface.
revoke execute on function public.accept_pass_transfer(uuid) from public, anon;
revoke execute on function public.open_direct_thread(uuid) from public, anon;
revoke execute on function public.check_promo(text, uuid) from public, anon;

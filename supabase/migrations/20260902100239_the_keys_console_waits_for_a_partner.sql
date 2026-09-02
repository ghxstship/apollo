/* The keys console waits for a partner (decided 2026-09-02).

   /bridge/keys records API keys and webhooks that nothing reads and nothing
   posts. A register that promises nothing is honest; a console that offers to
   cut a key a partner would expect to work is not. Until a partner needs one
   the console is closed: the nav omits the tab and the route answers 404,
   both reading this one setting, so they cannot disagree. Set it to 1 to
   open it — no deploy. */
alter table public.club_settings disable trigger zz_record_the_change;
insert into public.club_settings (key, value_int, note) values
  ('keys_console_enabled', 0, '1 opens /bridge/keys (API keys and webhooks); 0 hides the tab and 404s the route until a partner needs one')
on conflict (key) do nothing;
alter table public.club_settings enable trigger zz_record_the_change;;

-- Crew threads and direct messages should arrive without a reload.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.thread_members;

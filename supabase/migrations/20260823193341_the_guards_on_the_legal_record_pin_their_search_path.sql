-- Five trigger functions ran with a mutable search_path. They are SECURITY
-- INVOKER, so the exposure is smaller than a definer's — but they are the
-- guards on the signature and clause tables, the ones that make that record
-- append-only, and a guard whose name resolution can be steered from outside
-- is a guard with a handle on it. Pinning costs nothing.
alter function public.forbid_rewriting_the_record() set search_path to 'public';
alter function public.guard_counter_signature()    set search_path to 'public';
alter function public.guard_document_clauses()     set search_path to 'public';
alter function public.guard_document_version()     set search_path to 'public';
alter function public.guard_signature()            set search_path to 'public';;

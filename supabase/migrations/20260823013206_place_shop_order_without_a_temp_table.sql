-- Placeholder kept so the local ledger matches the remote one; the working body
-- of place_shop_order lands in the migration that follows (the first cut staged
-- the crate in a temporary table, which is fragile across PostgREST's pooled
-- connections and failed there with a cardinality_violation).
select 1;

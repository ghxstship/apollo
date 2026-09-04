-- Ninety-five foreign-key columns carry no index. Most are audit stamps nobody
-- joins on; these are the ones a policy, a trigger or a member page walks on
-- every request. Plain CREATE INDEX because a migration runs in one
-- transaction; the tables are small enough that it does not matter yet.
create index if not exists passes_cabin_id_idx              on public.passes (cabin_id) where cabin_id is not null;
create index if not exists passes_vessel_id_idx             on public.passes (vessel_id) where vessel_id is not null;
create index if not exists open_deck_posts_author_id_idx    on public.open_deck_posts (author_id);
create index if not exists open_deck_posts_episode_id_idx   on public.open_deck_posts (episode_id);
create index if not exists open_deck_comments_author_id_idx on public.open_deck_comments (author_id);
create index if not exists open_deck_hails_profile_id_idx   on public.open_deck_hails (profile_id);
create index if not exists open_deck_flags_flagger_id_idx   on public.open_deck_flags (flagger_id);
create index if not exists messages_author_id_idx           on public.messages (author_id);
create index if not exists notifications_episode_id_idx     on public.notifications (episode_id);
create index if not exists invites_inviter_id_idx           on public.invites (inviter_id);
create index if not exists pass_transfers_from_profile_idx  on public.pass_transfers (from_profile);
create index if not exists pass_transfers_to_profile_idx    on public.pass_transfers (to_profile);
create index if not exists waitlist_entries_profile_id_idx  on public.waitlist_entries (profile_id);
create index if not exists table_seats_profile_id_idx       on public.table_seats (profile_id);
create index if not exists table_picks_picker_idx           on public.table_picks (picker);
create index if not exists episode_media_uploaded_by_idx    on public.episode_media (uploaded_by);
create index if not exists promo_codes_episode_id_idx       on public.promo_codes (episode_id);
create index if not exists galley_orders_episode_id_idx     on public.galley_orders (episode_id);
create index if not exists crew_requests_profile_id_idx     on public.crew_requests (profile_id);
create index if not exists radar_picks_picker_rsvp_idx      on public.radar_picks (picker_rsvp);
create index if not exists radar_picks_picked_rsvp_idx      on public.radar_picks (picked_rsvp);
create index if not exists shared_anchors_rsvp_a_idx        on public.shared_anchors (rsvp_a);
create index if not exists shared_anchors_rsvp_b_idx        on public.shared_anchors (rsvp_b);
create index if not exists pod_sessions_rsvp_id_idx         on public.pod_sessions (rsvp_id);
create index if not exists charter_options_profile_id_idx   on public.charter_options (profile_id);
create index if not exists episode_daybeds_profile_id_idx   on public.episode_daybeds (profile_id);
create index if not exists push_subscriptions_profile_id_idx on public.push_subscriptions (profile_id);
create index if not exists push_outbox_profile_id_idx       on public.push_outbox (profile_id);
create index if not exists subscriptions_plan_id_idx        on public.subscriptions (plan_id);
create index if not exists profiles_plan_id_idx             on public.profiles (plan_id);
create index if not exists profiles_home_city_idx           on public.profiles (home_city);
create index if not exists episodes_city_id_idx             on public.episodes (city_id);
create index if not exists crew_assignments_position_slug_idx on public.crew_assignments (position_slug);
create index if not exists member_marks_mark_code_idx       on public.member_marks (mark_code);
create index if not exists reward_redemptions_profile_id_idx on public.reward_redemptions (profile_id);
create index if not exists payment_methods_profile_id_idx   on public.payment_methods (profile_id);;

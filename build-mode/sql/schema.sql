create extension if not exists postgis;

create table if not exists user_profiles (
  id uuid primary key,
  first_name text,
  home_city text,
  timezone text,
  social_energy_level text check (social_energy_level in ('low', 'steady', 'high')),
  preferred_group_size smallint not null default 2,
  max_shared_rituals_per_week numeric(4, 2),
  interests text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_routines (
  id uuid primary key,
  user_id uuid not null references user_profiles (id) on delete cascade,
  type text not null,
  label text,
  days_of_week smallint[] not null default '{}',
  time_window jsonb not null,
  cadence_per_week numeric(4, 2) not null default 1,
  preferred_group_size smallint not null default 2,
  location_coords geography(point, 4326),
  route_polygon jsonb,
  anchor_points jsonb not null default '[]'::jsonb,
  routine_tags text[] not null default '{}',
  activity_history jsonb not null default '[]'::jsonb,
  entropy_score numeric(5, 2) not null default 0,
  entropy_trigger_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_routines_user_id on user_routines (user_id);
create index if not exists idx_user_routines_type on user_routines (type);
create index if not exists idx_user_routines_routine_tags on user_routines using gin (routine_tags);
create index if not exists idx_user_routines_activity_history on user_routines using gin (activity_history);
create index if not exists idx_user_routines_anchor_points on user_routines using gin (anchor_points);
create index if not exists idx_user_routines_location_coords on user_routines using gist (location_coords);

create table if not exists routine_checkins (
  id uuid primary key,
  user_id uuid not null references user_profiles (id) on delete cascade,
  routine_id uuid references user_routines (id) on delete set null,
  occurred_at timestamptz not null,
  source text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_routine_checkins_user_id on routine_checkins (user_id);
create index if not exists idx_routine_checkins_occurred_at on routine_checkins (occurred_at desc);

create table if not exists active_intentions (
  id uuid primary key,
  creator_id uuid not null references user_profiles (id) on delete cascade,
  mode text not null default 'build' check (mode in ('build')),
  type text not null,
  label text,
  start_time timestamptz not null,
  cadence_per_week numeric(4, 2) not null default 1,
  desired_group_size smallint not null default 2,
  duration_minutes integer not null default 45,
  context_tags text[] not null default '{}',
  route_polygon jsonb,
  start_location geography(point, 4326),
  end_location geography(point, 4326),
  local_spot_name text,
  status text not null check (status in ('draft', 'open', 'filled', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_active_intentions_creator_id on active_intentions (creator_id);
create index if not exists idx_active_intentions_start_time on active_intentions (start_time);

create table if not exists ritual_blueprints (
  id uuid primary key,
  intention_id uuid not null references active_intentions (id) on delete cascade,
  ritual_name text not null,
  summary text not null,
  share_copy jsonb not null,
  cadence jsonb not null,
  recommended_group_size jsonb not null,
  first_three_sessions jsonb not null,
  anchor_strategy jsonb not null,
  audience_angles jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ritual_blueprints_intention_id on ritual_blueprints (intention_id);

create table if not exists build_matches (
  id uuid primary key,
  intention_id uuid not null references active_intentions (id) on delete cascade,
  recipient_id uuid not null references user_profiles (id) on delete cascade,
  match_type text not null check (match_type in ('anchor', 'spatiotemporal', 'timing', 'proximity')),
  invitation_text text not null,
  viewer_lens jsonb,
  anchor_relationship text,
  temporal_match_score numeric(5, 2),
  proximity_miles numeric(8, 3),
  frequency_alignment_score numeric(5, 2),
  activity_affinity_score numeric(5, 2),
  anchor_score numeric(5, 2),
  compatibility_score numeric(5, 2),
  compatibility_friction_score numeric(5, 2),
  recommended_for_routine boolean not null default false,
  silent_bridge_eligible boolean not null default false,
  social_energy jsonb not null default '{}'::jsonb,
  explanation jsonb not null default '{}'::jsonb,
  match_sources text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (intention_id, recipient_id)
);

create index if not exists idx_build_matches_intention_id on build_matches (intention_id);
create index if not exists idx_build_matches_recipient_id on build_matches (recipient_id);
create index if not exists idx_build_matches_anchor_score on build_matches (anchor_score desc);

create table if not exists build_notifications (
  id uuid primary key,
  intention_id uuid not null references active_intentions (id) on delete cascade,
  recipient_id uuid not null references user_profiles (id) on delete cascade,
  notification_type text not null check (notification_type in ('silent_bridge', 'routine_reanchor')),
  channel text not null check (channel in ('push', 'sms', 'email')),
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_build_notifications_recipient_id on build_notifications (recipient_id);
create index if not exists idx_build_notifications_scheduled_for on build_notifications (scheduled_for);

-- Candidate query starter for BUILD mode:
-- select r.*, p.first_name, p.social_energy_level, p.preferred_group_size, p.max_shared_rituals_per_week
-- from user_routines r
-- join user_profiles p on p.id = r.user_id
-- where r.user_id <> $1;

-- Nearby anchor starter:
-- select r.*,
--        st_distance(
--          r.location_coords,
--          st_setsrid(st_makepoint($2, $3), 4326)::geography
--        ) / 1609.344 as proximity_miles
-- from user_routines r
-- where r.user_id <> $1
--   and r.location_coords is not null
--   and st_dwithin(
--     r.location_coords,
--     st_setsrid(st_makepoint($2, $3), 4326)::geography,
--     1207.008
--   );

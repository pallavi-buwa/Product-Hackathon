create extension if not exists postgis;

create table if not exists user_routines (
  id uuid primary key,
  user_id uuid not null,
  type text not null,
  days_of_week smallint[] not null default '{}',
  time_window jsonb not null,
  location_coords geography(point, 4326),
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
create index if not exists idx_user_routines_location_coords on user_routines using gist (location_coords);

create table if not exists active_intentions (
  id uuid primary key,
  creator_id uuid not null,
  type text not null,
  start_time timestamptz not null,
  route_polygon jsonb,
  start_location geography(point, 4326),
  end_location geography(point, 4326),
  status text not null check (status in ('open', 'filled')),
  created_at timestamptz not null default now()
);

create table if not exists matches (
  id uuid primary key,
  intention_id uuid not null references active_intentions (id) on delete cascade,
  recipient_id uuid not null,
  match_type text not null check (match_type in ('symmetry', 'proximity')),
  invitation_text text not null,
  temporal_match_score numeric(5, 2),
  proximity_miles numeric(8, 3),
  recommended_for_routine boolean not null default false,
  match_sources text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (intention_id, recipient_id)
);

create index if not exists idx_matches_intention_id on matches (intention_id);
create index if not exists idx_matches_recipient_id on matches (recipient_id);

-- Sample symmetry query starter:
-- select *
-- from user_routines
-- where user_id <> $1
--   and (
--     type = $2
--     or routine_tags @> array[$2]::text[]
--     or exists (
--       select 1
--       from jsonb_array_elements(activity_history) item
--       where item ->> 'type' = $2
--     )
--   );

-- Sample proximity query starter using a single anchor point:
-- select *,
--        st_distance(
--          location_coords,
--          st_setsrid(st_makepoint($3, $4), 4326)::geography
--        ) / 1609.344 as proximity_miles
-- from user_routines
-- where user_id <> $1
--   and location_coords is not null
--   and st_dwithin(
--     location_coords,
--     st_setsrid(st_makepoint($3, $4), 4326)::geography,
--     804.672
--   );

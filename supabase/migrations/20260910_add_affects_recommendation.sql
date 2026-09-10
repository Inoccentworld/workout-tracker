alter table public.workout_raw_records
  add column if not exists affects_recommendation boolean not null default true;

comment on column public.workout_raw_records.affects_recommendation is
  'False for light or optional sessions that count toward volume but must not change the next-menu recommendation.';

-- Run once if the original schema was installed before the admin panel update.

alter table public.answer_keys
  add column if not exists open_count integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'answer_keys_open_count_check'
      and conrelid = 'public.answer_keys'::regclass
  ) then
    alter table public.answer_keys
      add constraint answer_keys_open_count_check
      check (open_count between 0 and 100);
  end if;
end
$$;


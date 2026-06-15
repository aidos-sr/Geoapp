-- GEO 10 Supabase schema
-- Run this file once in Supabase Dashboard -> SQL Editor.

create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('student', 'admin');
create type public.attempt_status as enum ('active', 'completed', 'violated');
create type public.submission_status as enum ('pending', 'graded', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  login text not null check (char_length(login) between 1 and 40),
  class_name text not null default '' check (char_length(class_name) <= 8),
  role public.app_role not null default 'student',
  enrolled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.invites (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  remaining integer not null check (remaining >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table public.topics (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,40}$'),
  position integer not null default 0,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.answer_keys (
  topic_id text primary key check (topic_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  tests jsonb not null default '[]'::jsonb,
  map_answers jsonb not null default '[]'::jsonb,
  open_count integer not null default 0 check (open_count between 0 and 100),
  updated_at timestamptz not null default now()
);

create table public.program_data (
  id boolean primary key default true check (id),
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.app_config (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.attempts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  topic_id text not null references public.topics(id) on delete cascade,
  status public.attempt_status not null,
  reason text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  result jsonb,
  primary key (user_id, topic_id)
);

create table public.progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  topic_id text not null references public.topics(id) on delete cascade,
  task_type text not null check (task_type ~ '^(test|open|map|attempt)(_[0-9]{1,3})?$'),
  score integer not null check (score between -2 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_id, task_type)
);

create table public.open_submissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  topic_id text not null references public.topics(id) on delete cascade,
  question_index integer not null check (question_index between 0 and 99),
  answer text not null check (char_length(answer) <= 2000),
  status public.submission_status not null,
  points integer check (points between 0 and 3),
  submitted_at timestamptz not null default now(),
  graded_at timestamptz,
  primary key (user_id, topic_id, question_index)
);

create table public.feedback (
  user_id uuid not null references public.profiles(id) on delete cascade,
  topic_id text not null references public.topics(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  message text not null default '' check (char_length(message) <= 500),
  payload jsonb not null default '{}'::jsonb check (octet_length(payload::text) <= 4000),
  created_at timestamptz not null default now(),
  primary key (user_id, topic_id)
);

insert into public.answer_keys(topic_id, tests, map_answers)
values
  ('1',  '["B"]', '[]'), ('2',  '["C"]', '[]'), ('3',  '["B"]', '[]'),
  ('4',  '["A"]', '[]'), ('5',  '["C"]', '[]'), ('6',  '["D"]', '[]'),
  ('7',  '["C"]', '[]'), ('8',  '["A"]', '[]'), ('9',  '["B"]', '[]'),
  ('10', '["B"]', '[]'), ('11', '["A"]', '[]'), ('12', '["C"]', '[]'),
  ('13', '["C"]', '[]'), ('14', '["C"]', '[]'), ('15', '["A"]', '[]'),
  ('16', '["A"]', '[]'), ('17', '["B"]', '[]'), ('18', '["C"]', '[]'),
  ('19', '["C"]', '[]'), ('20', '["B"]', '[]'), ('21', '["A"]', '[]'),
  ('22', '["D"]', '[]'), ('23', '["B"]', '[]'), ('24', '["B"]', '[]'),
  ('25', '["B"]', '[]')
on conflict (topic_id) do nothing;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and enrolled
  );
$$;

create or replace function public.is_enrolled()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and enrolled
  );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_enrolled() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_enrolled() to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  invite_code text;
  invite_hash text;
  student_login text;
  student_class text;
begin
  invite_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  student_login := trim(coalesce(new.raw_user_meta_data ->> 'login', split_part(new.email, '@', 1)));
  student_class := trim(coalesce(new.raw_user_meta_data ->> 'class_name', ''));
  if invite_code !~ '^[A-Z0-9-]{6,40}$'
     or char_length(student_login) not between 1 and 40
     or char_length(student_class) not between 1 and 8 then
    raise exception 'invalid-registration-data';
  end if;

  invite_hash := encode(extensions.digest(invite_code, 'sha256'), 'hex');
  update public.invites
     set remaining = remaining - 1, last_used_at = now()
   where code_hash = invite_hash and active and remaining > 0;
  if not found then raise exception 'invalid-or-exhausted-invite'; end if;

  insert into public.profiles(id, email, login, class_name, enrolled)
  values(new.id, coalesce(new.email, ''), student_login, student_class, true);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.start_task_attempt(p_topic_id text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare started timestamptz := now();
begin
  if not public.is_enrolled() then raise exception 'course-enrollment-required'; end if;
  insert into public.attempts(user_id, topic_id, status, started_at)
  values(auth.uid(), p_topic_id, 'active', started);
  return jsonb_build_object('status', 'active', 'startedAt', extract(epoch from started) * 1000);
exception when unique_violation then
  raise exception 'already-attempted';
end;
$$;

create or replace function public.submit_task_attempt(
  p_topic_id text,
  p_tests jsonb default '{}'::jsonb,
  p_opens jsonb default '{}'::jsonb,
  p_map jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  key_row public.answer_keys%rowtype;
  answer_entry record;
  open_entry record;
  expected text;
  score integer;
  test_results jsonb := '[]'::jsonb;
  map_score integer := null;
  correct_count integer := 0;
  total_points integer := 0;
  task_type text;
begin
  if not public.is_enrolled() then raise exception 'course-enrollment-required'; end if;
  select * into key_row from public.answer_keys where topic_id = p_topic_id;
  if not found then raise exception 'answer-key-not-found'; end if;

  perform 1 from public.attempts
   where user_id = auth.uid() and topic_id = p_topic_id and status = 'active'
   for update;
  if not found then raise exception 'attempt-not-active'; end if;

  for answer_entry in
    select (ordinality - 1)::integer as idx, value #>> '{}' as correct
    from jsonb_array_elements(key_row.tests) with ordinality
  loop
    expected := coalesce(p_tests ->> answer_entry.idx::text, '');
    score := case when expected <> '' and expected = answer_entry.correct then 5 else -1 end;
    task_type := case when answer_entry.idx = 0 then 'test' else 'test_' || answer_entry.idx end;
    insert into public.progress(user_id, topic_id, task_type, score)
    values(auth.uid(), p_topic_id, task_type, score)
    on conflict (user_id, topic_id, task_type)
    do update set score = excluded.score, updated_at = now();
    test_results := test_results || to_jsonb(score);
    total_points := total_points + greatest(score, 0);
  end loop;

  for open_entry in select key, value #>> '{}' as answer from jsonb_each(p_opens)
  loop
    if open_entry.key !~ '^[0-9]{1,2}$' then continue; end if;
    if open_entry.key::integer >= key_row.open_count then continue; end if;
    score := case when char_length(trim(open_entry.answer)) >= 10 then -2 else -1 end;
    task_type := case when open_entry.key = '0' then 'open' else 'open_' || open_entry.key end;
    insert into public.progress(user_id, topic_id, task_type, score)
    values(auth.uid(), p_topic_id, task_type, score)
    on conflict (user_id, topic_id, task_type)
    do update set score = excluded.score, updated_at = now();
    insert into public.open_submissions(user_id, topic_id, question_index, answer, status)
    values(
      auth.uid(), p_topic_id, open_entry.key::integer, left(open_entry.answer, 2000),
      case when score = -2 then 'pending'::public.submission_status else 'rejected'::public.submission_status end
    )
    on conflict (user_id, topic_id, question_index)
    do update set answer = excluded.answer, status = excluded.status, submitted_at = now();
  end loop;

  if jsonb_array_length(key_row.map_answers) > 0 then
    select count(*) into correct_count
    from jsonb_array_elements(key_row.map_answers) with ordinality expected(value, ordinality)
    where coalesce(p_map ->> (ordinality - 1)::integer, '') = value #>> '{}';
    map_score := case
      when correct_count = jsonb_array_length(key_row.map_answers) then 4
      when correct_count > 0 then 2 else -1
    end;
    insert into public.progress(user_id, topic_id, task_type, score)
    values(auth.uid(), p_topic_id, 'map', map_score)
    on conflict (user_id, topic_id, task_type)
    do update set score = excluded.score, updated_at = now();
    total_points := total_points + greatest(map_score, 0);
  end if;

  update public.attempts
     set status = 'completed', completed_at = now(),
         result = jsonb_build_object(
           'testResults', test_results, 'mapScore', map_score, 'totalPoints', total_points
         )
   where user_id = auth.uid() and topic_id = p_topic_id and status = 'active';

  return jsonb_build_object(
    'testResults', test_results, 'mapScore', map_score, 'totalPoints', total_points
  );
end;
$$;

create or replace function public.invalidate_task_attempt(p_topic_id text, p_reason text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare key_row public.answer_keys%rowtype; idx integer; task_type text;
begin
  if not public.is_enrolled() then raise exception 'course-enrollment-required'; end if;
  update public.attempts
     set status = 'violated', reason = left(coalesce(p_reason, 'interrupted'), 32), completed_at = now()
   where user_id = auth.uid() and topic_id = p_topic_id and status = 'active';
  if not found then return jsonb_build_object('status', 'missing'); end if;

  select * into key_row from public.answer_keys where topic_id = p_topic_id;
  if found then
    if jsonb_array_length(key_row.tests) > 0 then
      for idx in 0..jsonb_array_length(key_row.tests) - 1 loop
        task_type := case when idx = 0 then 'test' else 'test_' || idx end;
        insert into public.progress(user_id, topic_id, task_type, score)
        values(auth.uid(), p_topic_id, task_type, -1)
        on conflict (user_id, topic_id, task_type) do update set score = -1, updated_at = now();
      end loop;
    end if;
    if jsonb_array_length(key_row.map_answers) > 0 then
      insert into public.progress(user_id, topic_id, task_type, score)
      values(auth.uid(), p_topic_id, 'map', -1)
      on conflict (user_id, topic_id, task_type) do update set score = -1, updated_at = now();
    end if;
  end if;
  insert into public.progress(user_id, topic_id, task_type, score)
  values(auth.uid(), p_topic_id, 'attempt', -1)
  on conflict (user_id, topic_id, task_type) do update set score = -1, updated_at = now();
  return jsonb_build_object('status', 'violated');
end;
$$;

create or replace function public.grade_open_answer(
  p_user_id uuid, p_topic_id text, p_index integer, p_points integer
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare task_type text;
begin
  if not public.is_admin() then raise exception 'administrator-required'; end if;
  if p_index not between 0 and 99 or p_points not between 0 and 3 then
    raise exception 'invalid-grading-data';
  end if;
  task_type := case when p_index = 0 then 'open' else 'open_' || p_index end;
  update public.open_submissions
     set status = 'graded', points = p_points, graded_at = now()
   where user_id = p_user_id and topic_id = p_topic_id and question_index = p_index;
  if not found then raise exception 'submission-not-found'; end if;
  insert into public.progress(user_id, topic_id, task_type, score)
  values(p_user_id, p_topic_id, task_type, p_points)
  on conflict (user_id, topic_id, task_type)
  do update set score = excluded.score, updated_at = now();
  return jsonb_build_object('points', p_points);
end;
$$;

revoke all on function public.start_task_attempt(text) from public;
revoke all on function public.submit_task_attempt(text, jsonb, jsonb, jsonb) from public;
revoke all on function public.invalidate_task_attempt(text, text) from public;
revoke all on function public.grade_open_answer(uuid, text, integer, integer) from public;
grant execute on function public.start_task_attempt(text) to authenticated;
grant execute on function public.submit_task_attempt(text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.invalidate_task_attempt(text, text) to authenticated;
grant execute on function public.grade_open_answer(uuid, text, integer, integer) to authenticated;

alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.topics enable row level security;
alter table public.answer_keys enable row level security;
alter table public.program_data enable row level security;
alter table public.app_config enable row level security;
alter table public.attempts enable row level security;
alter table public.progress enable row level security;
alter table public.open_submissions enable row level security;
alter table public.feedback enable row level security;

revoke all on public.profiles, public.invites, public.topics, public.answer_keys,
  public.program_data, public.app_config, public.attempts, public.progress,
  public.open_submissions, public.feedback from anon, authenticated;
grant select on public.profiles, public.topics, public.answer_keys,
  public.program_data, public.app_config, public.attempts, public.progress,
  public.open_submissions, public.feedback to authenticated;
grant insert, update, delete on public.topics, public.answer_keys,
  public.program_data, public.app_config to authenticated;
grant insert, update on public.feedback to authenticated;

create policy profiles_self_read on public.profiles for select
  to authenticated using (id = auth.uid() or public.is_admin());
create policy topics_enrolled_read on public.topics for select
  to authenticated using (public.is_enrolled());
create policy topics_admin_write on public.topics for all
  to authenticated using (public.is_admin()) with check (public.is_admin());
create policy keys_admin_all on public.answer_keys for all
  to authenticated using (public.is_admin()) with check (public.is_admin());
create policy program_enrolled_read on public.program_data for select
  to authenticated using (public.is_enrolled());
create policy program_admin_write on public.program_data for all
  to authenticated using (public.is_admin()) with check (public.is_admin());
create policy config_admin_all on public.app_config for all
  to authenticated using (public.is_admin()) with check (public.is_admin());
create policy attempts_owner_read on public.attempts for select
  to authenticated using (user_id = auth.uid() or public.is_admin());
create policy progress_owner_read on public.progress for select
  to authenticated using (user_id = auth.uid() or public.is_admin());
create policy submissions_owner_read on public.open_submissions for select
  to authenticated using (user_id = auth.uid() or public.is_admin());
create policy feedback_owner_read on public.feedback for select
  to authenticated using (user_id = auth.uid() or public.is_admin());
create policy feedback_owner_insert on public.feedback for insert
  to authenticated with check (user_id = auth.uid() and public.is_enrolled());
create policy feedback_owner_update on public.feedback for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values(
  'course-images', 'course-images', true, 5242880,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy course_images_public_read on storage.objects for select
  using (bucket_id = 'course-images');
create policy course_images_admin_insert on storage.objects for insert
  to authenticated with check (bucket_id = 'course-images' and public.is_admin());
create policy course_images_admin_update on storage.objects for update
  to authenticated using (bucket_id = 'course-images' and public.is_admin());
create policy course_images_admin_delete on storage.objects for delete
  to authenticated using (bucket_id = 'course-images' and public.is_admin());

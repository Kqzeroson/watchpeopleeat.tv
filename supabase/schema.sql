-- watchpeopleeat.tv — Supabase schema
-- Run this once in your Supabase project's SQL Editor (Project -> SQL Editor -> New query).

-- ============================================================
-- PROFILES  (one row per registered user, linked to auth.users)
-- ============================================================
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  tripcode text,                       -- optional short display tag, e.g. "!Xk29fA"
  is_admin boolean not null default false,
  is_banned boolean not null default false,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles are publicly viewable"
  on profiles for select using (true);

create policy "users can update their own profile"
  on profiles for update using (auth.uid() = id);

-- Auto-create a profile row whenever someone signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', 'anon_' || substr(new.id::text, 1, 8)));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- VIDEOS
-- ============================================================
create table if not exists videos (
  id uuid primary key default gen_random_uuid(),
  uploader_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  description text,
  storage_path text not null,          -- path inside the "videos" storage bucket
  thumbnail_path text,                 -- optional path inside "thumbnails" bucket
  is_removed boolean not null default false,
  is_featured boolean not null default false,  -- current "Eater of the Week" pick
  featured_at timestamptz,                      -- when it was made EOTW, for the winners history
  created_at timestamptz not null default now()
);

alter table videos enable row level security;

create policy "videos are publicly viewable"
  on videos for select using (is_removed = false);

create policy "logged in users can upload videos"
  on videos for insert with check (auth.uid() = uploader_id);

create policy "owners and admins can update videos"
  on videos for update using (
    auth.uid() = uploader_id
    or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

create policy "owners and admins can delete videos"
  on videos for delete using (
    auth.uid() = uploader_id
    or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

-- ============================================================
-- TAGS  +  VIDEO_TAGS (many-to-many)
-- ============================================================
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

alter table tags enable row level security;
create policy "tags are publicly viewable" on tags for select using (true);
create policy "logged in users can create tags" on tags for insert with check (auth.uid() is not null);

create table if not exists video_tags (
  video_id uuid references videos(id) on delete cascade,
  tag_id uuid references tags(id) on delete cascade,
  primary key (video_id, tag_id)
);

alter table video_tags enable row level security;
create policy "video_tags are publicly viewable" on video_tags for select using (true);
create policy "logged in users can tag videos" on video_tags for insert with check (auth.uid() is not null);

-- ============================================================
-- COMMENTS
-- ============================================================
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references videos(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  body text not null,
  is_removed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table comments enable row level security;

create policy "comments are publicly viewable"
  on comments for select using (is_removed = false);

create policy "logged in users can comment"
  on comments for insert with check (auth.uid() = user_id);

create policy "owners and admins can update comments"
  on comments for update using (
    auth.uid() = user_id
    or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

create policy "owners and admins can delete comments"
  on comments for delete using (
    auth.uid() = user_id
    or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

-- ============================================================
-- REACTIONS  (like / dislike, one per user per video)
-- ============================================================
create table if not exists reactions (
  video_id uuid references videos(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  reaction text not null check (reaction in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  primary key (video_id, user_id)
);

alter table reactions enable row level security;

create policy "reactions are publicly viewable" on reactions for select using (true);

create policy "logged in users can react"
  on reactions for insert with check (auth.uid() = user_id);

create policy "users can change their own reaction"
  on reactions for update using (auth.uid() = user_id);

create policy "users can remove their own reaction"
  on reactions for delete using (auth.uid() = user_id);

-- ============================================================
-- LIVESTREAMS
-- No RTMP/live ingest runs on GitHub Pages or Supabase's free tier, so this
-- table stores *announcements*: a user posts a title + an embed URL for a
-- stream they're already running elsewhere (YouTube Live, Twitch, etc.),
-- and the page embeds it. See livestreams.html.
-- ============================================================
create table if not exists livestreams (
  id uuid primary key default gen_random_uuid(),
  host_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  embed_url text not null,             -- an embeddable URL (YouTube "/embed/...", Twitch player URL, etc.)
  is_live boolean not null default true,
  created_at timestamptz not null default now()
);

alter table livestreams enable row level security;

create policy "livestreams are publicly viewable"
  on livestreams for select using (true);

create policy "logged in users can post a livestream"
  on livestreams for insert with check (auth.uid() = host_id);

create policy "hosts and admins can update livestreams"
  on livestreams for update using (
    auth.uid() = host_id
    or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

create policy "hosts and admins can delete livestreams"
  on livestreams for delete using (
    auth.uid() = host_id
    or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

-- ============================================================
-- STORAGE BUCKETS
-- Create these in Dashboard -> Storage -> New bucket (mark both "Public"):
--   videos      (max file size ~500MB, mime type video/*)
--   thumbnails  (mime type image/*)
-- Then storage policies (Storage -> Policies) allowing:
--   - public SELECT on both buckets
--   - INSERT on "videos"/"thumbnails" for authenticated role only
-- ============================================================

-- ============================================================
-- MAKING SOMEONE AN ADMIN
-- Run this manually for each admin account once you know their username:
--   update profiles set is_admin = true where username = 'PUT_USERNAME_HERE';
-- ============================================================

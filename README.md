# watchpeopleeat.tv

Anonymous-vibe video board: upload videos, tag them, comment, like/dislike.
Frontend is plain static HTML/CSS/JS (works on GitHub Pages). Accounts, the
database, and video storage run on a free Supabase project, since GitHub
Pages can't run a server.

## 1. Create the backend (Supabase — free tier)

1. Go to https://supabase.com → New project.
2. Once it's created: **Project Settings → API** → copy the **Project URL**
   and the **anon public** key.
3. Open `js/supabase-client.js` in this repo and paste them in:
   ```js
   const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
   const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";
   ```
4. In Supabase: **SQL Editor → New query**, paste the entire contents of
   `supabase/schema.sql`, and run it. This creates all tables, security
   rules, and the trigger that makes a profile row whenever someone signs up.
5. **Storage → New bucket** → create a bucket named `videos`, mark it
   **Public**. (Optional: also create a `thumbnails` bucket, public, if you
   want custom thumbnails later — the site currently shows a text placeholder
   instead.)
6. **Authentication → Providers**: email/password is on by default, which is
   all this site uses. If you don't want people to have to click a
   confirmation email before their first login, go to **Authentication →
   Settings** and turn off "Confirm email."

That's it for the backend — Supabase handles password hashing, sessions, and
tokens for you, so you don't have to write any of that yourself.

## 2. Make specific accounts admins

There's no separate "admin password" — admin status is just a flag on a
user's row in the `profiles` table. Once you know which accounts should be
admins:

1. Have that person register normally on the site first (so their profile
   row exists).
2. In Supabase: **Table Editor → profiles**, find their row, and either
   toggle `is_admin` to `true` in the UI, or run in the SQL Editor:
   ```sql
   update profiles set is_admin = true where username = 'their_username';
   ```
3. They'll see an "admin" link appear in the top bar next time they log in,
   linking to `admin.html`, where they can ban/unban users and
   remove/restore videos and comments.

## 3. Deploy the frontend to GitHub Pages

1. Push this whole folder to a GitHub repo.
2. Repo → **Settings → Pages** → under "Build and deployment," set Source to
   "Deploy from a branch," pick your default branch and the root folder.
3. GitHub gives you a `https://<username>.github.io/<repo>/` URL. To use
   `watchpeopleeat.tv` instead:
   - Add a `CNAME` file to the repo root containing just `watchpeopleeat.tv`.
   - At your domain registrar, point the domain at GitHub Pages (an `A`
     record to GitHub's IPs, or a `CNAME` record to
     `<username>.github.io`, per GitHub's custom-domain docs).

## What's included

| File | Purpose |
|---|---|
| `index.html` / `js/board.js` | Video catalog, tag filter, sort, search, EOTW banner |
| `explore.html` / `js/explore.js` | Shuffled discovery view of all videos |
| `eotw.html` / `js/eotw-page.js` | Current "Eater of the Week" pick + past winners |
| `livestreams.html` / `js/livestreams.js` | Post/view livestream announcements (see note below) |
| `upload.html` / `js/upload.js` | Upload a video file + title/description/tags |
| `video.html` / `js/video.js` | Video player, tags, like/dislike, comments |
| `account.html` / `js/account.js` | Profile info, your uploads, log out |
| `login.html`, `register.html` | Auth pages (Supabase-backed) |
| `admin.html` / `js/admin.js` | Ban/unban users, remove/restore videos, set EOTW |
| `supabase/schema.sql` | Full DB schema + row-level security policies |
| `js/supabase-client.js` | Where you paste your project URL/key |

### About "Livestreams"

Neither GitHub Pages nor Supabase's free tier can ingest an actual live video
signal (that needs an RTMP server + transcoding, which is its own paid
service). So this page works as an **announcement board**: a logged-in user
pastes a YouTube Live or Twitch URL for a stream they're already running
elsewhere, and the site embeds it via `<iframe>`. If you later want a stream
truly hosted on watchpeopleeat.tv itself, that would mean adding a service
like Mux, Cloudflare Stream, or a Twitch/YouTube-only workflow on top of what's
here.

### About "EOTW" (Eater of the Week)

`videos.is_featured` marks the current pick; only one video can hold it at a
time (setting a new one automatically clears the old one). `videos.featured_at`
records when a video became EOTW, which is what populates the history list on
`eotw.html`. Admins set this from the admin panel — there's no automatic
weekly rotation, so it's a manual "crown someone" action.

## Notes on moderation

Row Level Security is set up so that:
- Anyone can view non-removed videos/comments and reaction counts.
- Only a logged-in, non-banned user can upload, comment, or react.
- Only the original poster **or** an admin account can edit/delete a video
  or comment (soft-delete — `is_removed = true` — so nothing is destroyed,
  just hidden, and admins can restore it from the admin panel).
- Banned users are blocked client-side from uploading/commenting on login;
  for a stricter server-side guarantee, you can extend the RLS `insert`
  policies on `videos`/`comments`/`reactions` to also check
  `is_banned = false` on the poster's profile.

## Costs

Supabase's free tier includes 500MB database storage, 1GB file storage, and
5GB bandwidth/month — fine for getting started. Video is usually the
limiting factor; keep an eye on the Storage usage page and upgrade the plan
if the board takes off.

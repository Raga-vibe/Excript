# Excript

Excript is a personal library for books, movies, and series. Save what you want to read or watch, find it again with search and status filters, and sync your list across devices after signing in.

## Features

- Organize books, movies, and series in separate sections.
- Save an author for each book, a director for each movie, or a creator for each series.
- Mark books as read and movies or series as watched.
- Search titles and people across your collection.
- Filter by everything, still to read or watch, and completed.
- Choose a Forest, Ocean, Sunset, Lavender, or Midnight color theme.
- Add titles manually or find a matching catalog entry online.
- Refresh saved book, movie, and series details.
- Create an account and sync your own library across devices.
- Browse a landing page with an original CSS-built 3D media collage.

## Run Excript

The landing page works with any static web server (for example, `python -m http.server 8000`). The signed-in app and catalog functions need Vercel Functions, so use `vercel dev` to test those locally. There is no front-end build step.

## Your data

Each account has its own private library in Supabase. Excript also keeps a local copy so the list stays usable when the connection is briefly interrupted. Row Level Security policies in `supabase/schema.sql` restrict each account to its own items. A list saved in the older local-only version is imported into the first account that signs in on that browser.

## Enable sign-in and cloud sync

1. Create a Supabase project.
2. In Supabase **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql). It creates the media table, per-user Row Level Security, and realtime updates.
3. In Supabase **Authentication → URL Configuration**, set the Site URL to `https://excript.vercel.app` and add the Excript production and Preview callback URLs to the allowed redirect URLs.
4. In Vercel **Project Settings → Environment Variables**, add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for Preview first. The publishable key (also called the anon key in older projects) is designed for browser use; never use or expose the service-role key.
5. Redeploy the Preview and create an account there. After verifying login and sync, enable the same two variables for Production.

The app fetches those public Supabase settings from `/api/config`. Database access is protected by the SQL policies; do not remove Row Level Security.

## Live catalog data

- Books use Open Library. Linked book details refresh once per day when Excript opens. You can also search for or refresh a title manually.
- Movies and series use TMDB for posters, summaries, release dates, and the next listed episode. Excript sends TMDB requests through a Vercel Function, so users do not need their own TMDB account or key. The shared token stays in Vercel's server-side environment and is never sent to the browser. Linked movie and series details refresh once per day while Excript is open.
- Add `TMDB_API_READ_ACCESS_TOKEN` to the Vercel Preview environment for testing, then Production after you are ready to publish. Use your TMDB API Read Access Token. Never put it in this repository, browser code, or a `VITE_`/`NEXT_PUBLIC_` variable.
- The `/api/tmdb` function only allows the search and detail requests Excript needs, limits title length, rejects cross-origin browser requests, and caches successful responses. Its simple in-memory request cap is per running function instance; it is not a durable public-service rate limit. Add a persistent rate limiter before promoting the app to high traffic.
- This deployment needs Vercel Functions enabled for the `api/` directory. For local API testing, use `vercel dev`; a static file server does not run the functions.
- Excript does not run checks while the page is closed. It keeps your read/watched progress when catalog details refresh.
- The TMDB developer API is for non-commercial use with attribution. Commercial use requires a separate license. The required TMDB logo and attribution notice appear below the app.

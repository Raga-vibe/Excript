# Excript

Excript is a personal library for books, films, and series. Keep the stories you want to read, watch, or revisit together in one quiet, searchable place.

**Use Excript:** [excript.vercel.app](https://excript.vercel.app/) — no account is needed to start.

## Start in guest mode

1. Open Excript and choose **Use Excript** or **Open your library**.
2. Add a book, film, or series by title, or search the live catalog.
3. Search your list, filter by progress, mark items read or watched, and choose a color theme.

Guest mode saves your library in this browser. It stays on this device and is not synced to another browser or device. You can sign in later; Excript will add guest items to your account library without duplicating matching titles.

## What you can do

- Keep books, films, and series in separate sections.
- Save an author, director, or series creator with each title.
- Search by title or person and filter by progress.
- Mark books as read and films or series as watched.
- Find books through Open Library and films or series through Excript’s shared TMDB connection.
- Refresh catalog details and artwork.
- Choose from Forest, Ocean, Sunset, Lavender, and Midnight themes.
- Use the library without an account, or sign in with Supabase to sync it across devices.

## Your library and privacy

- **Guest library:** stored locally in this browser. Clearing browser storage or moving to another device will not carry it over.
- **Account library:** stored in Supabase and synced when you sign in. Row Level Security in [`supabase/schema.sql`](supabase/schema.sql) restricts database access to the signed-in account.
- Signing in merges guest items into the account library. Matching items keep the account’s progress and details.

## Run locally

There is no front-end build step or package installation. To run the site with its API functions, install the [Vercel CLI](https://vercel.com/docs/cli) and run `vercel dev` from the project folder. A static server can display the site and guest library, but API-backed catalog search needs the Vercel Functions in `api/`.

## Optional services

### Live books, films, and series

- Books use the public Open Library API.
- Movies and series use TMDB through the server-side `/api/tmdb` function. Visitors do not need their own TMDB account or API key.
- Set `TMDB_API_READ_ACCESS_TOKEN` in Vercel’s server-side environment variables. Never put it in browser code, this repository, or a client-exposed variable.
- The function restricts the supported requests, validates input, and caches results. Its request cap is in-memory per function instance; add durable rate limiting before high-traffic use.
- TMDB’s developer API is for non-commercial use with attribution. Commercial use requires a separate license. The app includes TMDB’s required attribution.

### Optional account sync with Supabase

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL Editor. It creates the library table, per-user policies, and Realtime setup.
3. Set the Supabase Site URL to `https://excript.vercel.app` and allow the production and Vercel Preview callback URLs in **Authentication → URL Configuration**.
4. Add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` to the Vercel project’s environment variables. Use the public publishable key (or legacy `anon` key), never a `service_role` or secret key.
5. Redeploy after changing environment variables. Test sign-up, sign-in, and syncing in Preview before enabling sync in Production.

The browser reads the public settings from `/api/config`. Keep Row Level Security enabled; the publishable key does not replace database access policies.

## Project files

| Path | Purpose |
| --- | --- |
| `index.html` | Landing page |
| `app.html`, `app.js` | Library interface and local/account storage |
| `login.html`, `login.js`, `auth-client.js` | Optional account access |
| `api/tmdb.js` | Server-side TMDB search and details |
| `api/config.js` | Public Supabase configuration for the browser |
| `supabase/schema.sql` | Per-user library table, security policies, and realtime |

## Contributing

Open a GitHub issue to describe a bug or proposed improvement. For a change, create a branch, keep the change focused, and open a pull request with a short summary and screenshots for visual updates. Do not commit `.env` files, database passwords, or server-side API tokens.

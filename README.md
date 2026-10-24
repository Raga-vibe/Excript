# Excript

Excript is a lightweight personal media tracker for books, movies, and series. Keep a list of what you want to read or watch, then find it again with search and status filters.

## Features

- Organize books, movies, and series in separate sections.
- Save an author for each book, a director for each movie, or a creator for each series.
- Mark books as read and movies or series as watched.
- Search titles and people across your collection.
- Filter by everything, still to read or watch, and completed.
- Choose a Forest, Ocean, Sunset, Lavender, or Midnight color theme.
- Add titles manually or find a matching catalog entry online.
- Refresh saved book, movie, and series details.

## Run Excript

For a basic local preview, run a static web server from the project folder (for example, `python -m http.server 8000`) and open `http://localhost:8000`. This preview supports books through Open Library; it does not run the TMDB server function. To test all catalog features locally, link the project with Vercel, add the environment variable below, and run `vercel dev`. The app has no front-end build step.

## Your data

Your media list and theme choice are saved in this browser on this device. The list is not uploaded to Excript or synced to other devices. Clearing this browser's site data removes the saved list and theme choice.

## Live catalog data

- Books use Open Library. Linked book details refresh once per day when Excript opens. You can also search for or refresh a title manually.
- Movies and series use TMDB for posters, summaries, release dates, and the next listed episode. Excript sends TMDB requests through a small Vercel Function, so users do not need to create their own TMDB account or enter a key. The shared token stays in Vercel's server-side environment and is never sent to the browser. Linked movie and series details refresh once per day while Excript is open.
- To enable the shared movie and series catalog, add a Vercel environment variable named `TMDB_API_READ_ACCESS_TOKEN` with your TMDB API Read Access Token. Add it to the Production and Preview environments you use, then redeploy. Never put the token in this repository, browser code, or a `VITE_`/`NEXT_PUBLIC_` variable.
- The `/api/tmdb` function only allows the search and detail requests Excript needs, limits title length, rejects cross-origin browser requests, and caches successful responses. Its simple in-memory request cap is per running function instance; it is not a durable public-service rate limit. Add a persistent rate limiter before promoting the app to high traffic.
- This deployment also needs Vercel Functions enabled for the `api/` directory. For local API testing, use `vercel dev`; a static file server does not run the function.
- Excript does not run checks while the page is closed. It keeps your read/watched progress when catalog details refresh.
- The TMDB developer API is for non-commercial use with attribution. Commercial use requires a separate license. The required TMDB logo and attribution notice appear below the app.

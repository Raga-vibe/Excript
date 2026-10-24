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

Run a local web server from the project folder (for example, `python -m http.server 8000`) and open `http://localhost:8000`. Catalog requests need a normal web origin, so opening the file directly may prevent requests from working. The app has no build step.

## Your data

Your media list and theme choice are saved in this browser on this device. The list is not uploaded to Excript or synced to other devices. Clearing this browser's site data removes the saved list and theme choice.

## Live catalog data

- Books use Open Library. Linked book details refresh once per day when Excript opens. You can also search for or refresh a title manually.
- Movies and series use TMDB for posters, summaries, release dates, and the next listed episode. After you connect TMDB in a tab, linked movie and series details refresh once per day while Excript is open. The token stays in memory in that tab and is sent directly to TMDB; Excript does not save it.
- Excript does not run checks while the page is closed. It keeps your read/watched progress when catalog details refresh.
- The TMDB developer API is for non-commercial use with attribution. Commercial use requires a separate license. The required TMDB logo and attribution notice appear below the app.

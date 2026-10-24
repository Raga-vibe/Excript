const STORAGE_KEY = "excript-reading-list-v1";
const THEME_STORAGE_KEY = "excript-theme-v1";
const THEMES = ["forest", "ocean", "sunset", "lavender", "midnight"];
const TMDB_PROXY_URL = "/api/tmdb";
const OPEN_LIBRARY_BASE_URL = "https://openlibrary.org";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w342/";
const TMDB_CACHE_MAX_AGE = 179 * 24 * 60 * 60 * 1000;
const AUTO_REFRESH_INTERVAL = 24 * 60 * 60 * 1000;
const ITEM_TYPES = ["book", "movie", "series"];
const TYPE_DETAILS = {
  book: { person: "Author", prompt: "Who wrote it?", completed: "read", active: "To read" },
  movie: { person: "Director", prompt: "Who directed it?", completed: "watched", active: "To watch" },
  series: { person: "Creator", prompt: "Who created it?", completed: "watched", active: "To watch" },
};

const form = document.querySelector("#item-form");
const titleInput = document.querySelector("#item-title");
const typeInput = document.querySelector("#item-type");
const creatorInput = document.querySelector("#item-creator");
const creatorLabel = document.querySelector("#creator-label");
const formMessage = document.querySelector("#form-message");
const itemFilter = document.querySelector("#item-filter");
const itemSearch = document.querySelector("#item-search");
const mediaSections = document.querySelector(".media-sections");
const searchEmpty = document.querySelector("#search-empty");
const searchEmptyCopy = document.querySelector("#search-empty-copy");
const readingStats = document.querySelector("#reading-stats");
const themeButtons = [...document.querySelectorAll("[data-theme-choice]")];
const catalogSearchButton = document.querySelector("#catalog-search-button");
const catalogLookup = document.querySelector("#catalog-lookup");
const catalogStatus = document.querySelector("#catalog-status");
const catalogMatchesList = document.querySelector("#catalog-matches");
const catalogCloseButton = document.querySelector("#catalog-close");
const catalogUpdateStatus = document.querySelector("#catalog-update-status");
const appShell = document.querySelector("#app-shell");
const appLoading = document.querySelector("#app-loading");
const accountEmail = document.querySelector("#account-email");
const syncStatus = document.querySelector("#sync-status");
const signInLink = document.querySelector("#sign-in-link");
const signOutButton = document.querySelector("#sign-out");
const storageNote = document.querySelector("#storage-note");

const sections = {
  book: {
    list: document.querySelector("#books-list"),
    empty: document.querySelector("#books-empty"),
    count: document.querySelector("#books-count"),
    noun: "book",
  },
  movie: {
    list: document.querySelector("#movies-list"),
    empty: document.querySelector("#movies-empty"),
    count: document.querySelector("#movies-count"),
    noun: "movie",
  },
  series: {
    list: document.querySelector("#series-list"),
    empty: document.querySelector("#series-empty"),
    count: document.querySelector("#series-count"),
    noun: "series",
  },
};

let items = [];
let signedInUser = null;
let supabaseClient = null;
let cloudReady = false;
let cloudSyncQueue = Promise.resolve();
let catalogMatches = [];
let catalogLookupContext = null;
let lastOpenLibraryRequestAt = 0;

function loadTheme() {
  try {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.includes(savedTheme) ? savedTheme : "forest";
  } catch {
    return "forest";
  }
}

function applyTheme(theme, save = true) {
  const selectedTheme = THEMES.includes(theme) ? theme : "forest";
  document.documentElement.dataset.theme = selectedTheme;
  for (const button of themeButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.themeChoice === selectedTheme));
  }

  if (save) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, selectedTheme);
    } catch {
      formMessage.textContent = "Theme changed, but this browser could not remember your choice.";
    }
  }
}

function createItemId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function userStorageKey(userId) {
  return `${STORAGE_KEY}:${userId}`;
}

function mergeGuestItems(accountItems, guestItems) {
  const merged = accountItems.map((item) => ({ ...item }));
  const byTitle = new Map();
  const byId = new Map(merged.map((item) => [item.id, item]));
  const keyFor = (item) => `${item.type}:${item.title.trim().toLocaleLowerCase()}`;

  for (const item of merged) {
    byTitle.set(keyFor(item), item);
  }

  for (const item of guestItems) {
    const existing = byId.get(item.id) ?? byTitle.get(keyFor(item));
    if (existing) {
      if (!existing.creator && item.creator) existing.creator = item.creator;
      if (!existing.catalog && item.catalog) existing.catalog = item.catalog;
      continue;
    }

    const guestCopy = { ...item };
    merged.push(guestCopy);
    byId.set(guestCopy.id, guestCopy);
    byTitle.set(keyFor(guestCopy), guestCopy);
  }

  return merged;
}

function loadItems(storageKey = STORAGE_KEY) {
  try {
    const savedItems = localStorage.getItem(storageKey);
    const parsedItems = savedItems ? JSON.parse(savedItems) : [];

    if (!Array.isArray(parsedItems)) return [];

    return parsedItems
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const type = ITEM_TYPES.includes(item.type) ? item.type : "book";

        return {
          id: typeof item.id === "string" ? item.id : createItemId(),
          title: String(item.title ?? "").trim(),
          creator: String(item.creator ?? item.author ?? "").trim(),
          type,
          completed: Boolean(item.completed ?? item.read),
          catalog: normalizeCatalog(item.catalog),
        };
      })
      .filter((item) => item.title);
  } catch {
    return [];
  }
}

function normalizeCatalog(catalog) {
  if (!catalog || typeof catalog !== "object") return null;

  const provider = catalog.provider === "TMDB" ? "TMDB" : catalog.provider === "Open Library" ? "Open Library" : null;
  if (!provider) return null;

  const id = String(catalog.id ?? "");
  const validId = provider === "TMDB" ? /^\d+$/.test(id) : /^\/works\/OL\d+W$/.test(id);
  if (!validId) return null;

  const refreshedAt = String(catalog.refreshedAt ?? "");
  const refreshedTime = Date.parse(refreshedAt);
  const isFresh = Number.isFinite(refreshedTime) && Date.now() - refreshedTime < TMDB_CACHE_MAX_AGE;
  const path = provider === "TMDB"
    ? `https://www.themoviedb.org/${ITEM_TYPES.includes(catalog.mediaType) && catalog.mediaType === "movie" ? "movie" : "tv"}/${id}`
    : `${OPEN_LIBRARY_BASE_URL}${id}`;

  if (provider === "TMDB" && !isFresh) {
    return { provider, id, mediaType: catalog.mediaType, sourceUrl: path };
  }

  return {
    provider,
    id,
    mediaType: catalog.mediaType,
    sourceUrl: path,
    posterUrl: typeof catalog.posterUrl === "string" && (
      catalog.posterUrl.startsWith("https://image.tmdb.org/") ||
      catalog.posterUrl.startsWith("https://covers.openlibrary.org/")
    ) ? catalog.posterUrl : "",
    description: typeof catalog.description === "string" ? catalog.description : "",
    releaseDate: typeof catalog.releaseDate === "string" ? catalog.releaseDate : "",
    nextEpisode: catalog.nextEpisode && typeof catalog.nextEpisode === "object" ? {
      name: String(catalog.nextEpisode.name ?? ""),
      airDate: String(catalog.nextEpisode.airDate ?? ""),
      seasonNumber: Number(catalog.nextEpisode.seasonNumber) || 0,
      episodeNumber: Number(catalog.nextEpisode.episodeNumber) || 0,
    } : null,
    status: typeof catalog.status === "string" ? catalog.status : "",
    refreshedAt: isFresh ? refreshedAt : "",
  };
}

function saveItems() {
  let saved = true;
  try {
    const storageKey = signedInUser ? userStorageKey(signedInUser.id) : STORAGE_KEY;
    localStorage.setItem(storageKey, JSON.stringify(items));
  } catch {
    saved = false;
  }

  if (cloudReady && signedInUser) queueCloudSync();
  return saved;
}

function setSyncStatus(message, state = "") {
  syncStatus.textContent = message;
  syncStatus.dataset.state = state;
}

function cloudRecordToItem(record) {
  const type = ITEM_TYPES.includes(record.type) ? record.type : "book";
  return {
    id: String(record.id),
    title: String(record.title ?? "").trim(),
    creator: String(record.creator ?? "").trim(),
    type,
    completed: Boolean(record.completed),
    catalog: normalizeCatalog(record.catalog),
  };
}

async function syncItemsToCloud(userId) {
  if (!cloudReady || !signedInUser || signedInUser.id !== userId) return;
  const snapshot = items.map((item) => ({ ...item }));
  const rows = snapshot.map((item) => ({
    id: item.id,
    user_id: userId,
    title: item.title,
    creator: item.creator,
    type: item.type,
    completed: item.completed,
    catalog: item.catalog,
    updated_at: new Date().toISOString(),
  }));

  if (rows.length) {
    const { error } = await supabaseClient.from("media_items").upsert(rows, { onConflict: "user_id,id" });
    if (error) throw error;
  }

  const { data: existingRows, error: listError } = await supabaseClient
    .from("media_items")
    .select("id")
    .eq("user_id", userId);
  if (listError) throw listError;

  const currentIds = new Set(snapshot.map((item) => item.id));
  const removedIds = (existingRows ?? []).map((row) => row.id).filter((id) => !currentIds.has(id));
  if (removedIds.length) {
    const { error } = await supabaseClient.from("media_items").delete().eq("user_id", userId).in("id", removedIds);
    if (error) throw error;
  }

  if (signedInUser?.id === userId) setSyncStatus("Synced", "success");
}

function queueCloudSync() {
  if (!cloudReady || !signedInUser) return;
  const userId = signedInUser.id;
  cloudSyncQueue = cloudSyncQueue.catch(() => {}).then(async () => {
    if (!cloudReady || signedInUser?.id !== userId) return;
    setSyncStatus("Syncing…");
    try {
      await syncItemsToCloud(userId);
    } catch {
      setSyncStatus("Saved here · sync paused", "error");
    }
  });
}

function subscribeToCloudChanges(userId) {
  supabaseClient.channel(`media-items:${userId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "media_items",
      filter: `user_id=eq.${userId}`,
    }, (payload) => {
      if (signedInUser?.id !== userId) return;
      if (payload.eventType === "DELETE") {
        items = items.filter((item) => item.id !== String(payload.old.id));
      } else if (payload.new) {
        const updated = cloudRecordToItem(payload.new);
        const index = items.findIndex((item) => item.id === updated.id);
        if (index >= 0) items[index] = updated;
        else items.unshift(updated);
      }

      try {
        localStorage.setItem(userStorageKey(userId), JSON.stringify(items));
      } catch {
        // Cloud data remains available even if this browser cannot cache it.
      }
      setSyncStatus("Updated from your other device", "success");
      renderItems();
    })
    .subscribe();
}

async function initializeApp() {
  const forceGuestMode = new URLSearchParams(location.search).get("mode") === "guest";
  const auth = forceGuestMode ? null : await window.excriptAuthReady;

  if (!auth?.client || !auth.session) {
    items = loadItems();
    accountEmail.textContent = "Guest library";
    setSyncStatus("Saved on this device");
    signInLink.hidden = false;
    signOutButton.hidden = true;
    storageNote.textContent = "Guest list saved on this device.";
  } else {
    supabaseClient = auth.client;
    signedInUser = auth.session.user;
    accountEmail.textContent = signedInUser.email ?? "Your account";
    signInLink.hidden = true;
    signOutButton.hidden = false;
    storageNote.textContent = "Your library is linked to your account.";

    const localItems = loadItems(userStorageKey(signedInUser.id));
    const guestItems = loadItems(STORAGE_KEY);
    let cloudItems = null;
    let error = null;
    try {
      const response = await supabaseClient
        .from("media_items")
        .select("id,title,creator,type,completed,catalog,updated_at")
        .eq("user_id", signedInUser.id)
        .order("updated_at", { ascending: false });
      cloudItems = response.data;
      error = response.error;
    } catch (requestError) {
      error = requestError;
    }

    if (error) {
      items = mergeGuestItems(localItems, guestItems);
      setSyncStatus("Sync paused", "error");
      formMessage.textContent = "Your library is still saved on this device. Check your connection to resume account syncing.";
    } else {
      cloudReady = true;
      const cloudLibrary = (cloudItems ?? []).map(cloudRecordToItem).filter((item) => item.title);
      const accountLibrary = cloudLibrary.length ? cloudLibrary : localItems;
      items = mergeGuestItems(accountLibrary, guestItems);
      const guestLibraryChanged = JSON.stringify(items) !== JSON.stringify(accountLibrary);

      if (!cloudLibrary.length || guestLibraryChanged) {
        if (guestItems.length && guestLibraryChanged) {
          formMessage.textContent = "Your guest list has been added to this account.";
        }
        saveItems();
      } else {
        try { localStorage.setItem(userStorageKey(signedInUser.id), JSON.stringify(items)); } catch {}
        setSyncStatus("Synced", "success");
      }
      subscribeToCloudChanges(signedInUser.id);
    }
  }

  applyTheme(loadTheme(), false);
  updateCreatorPrompt();
  renderItems();
  appLoading.hidden = true;
  appShell.hidden = false;
  void refreshStaleCatalogItems("Open Library");
  void refreshStaleCatalogItems("TMDB");
}

function announceChange(message, saved = true) {
  formMessage.textContent = saved
    ? message
    : `${message} This browser could not save the change locally.`;
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(url.startsWith(TMDB_PROXY_URL)
        ? "Excript's shared TMDB connection was rejected. The site owner may need to update its Vercel setting."
        : "The catalog rejected this request. Try again later.");
    }
    if (response.status === 503) throw new Error("The shared movie and series catalog is not configured on this deployment yet.");
    if (response.status === 429) throw new Error("The catalog is busy. Wait a little, then try again.");
    throw new Error(`The catalog request failed (${response.status}). Try again later.`);
  }
  return response.json();
}

async function requestOpenLibrary(url) {
  const elapsed = Date.now() - lastOpenLibraryRequestAt;
  if (elapsed < 1000) {
    await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
  }
  lastOpenLibraryRequestAt = Date.now();
  return requestJson(url);
}

function tmdbUrl(path, parameters = {}) {
  const query = new URLSearchParams({ path, ...parameters });
  return `${TMDB_PROXY_URL}?${query}`;
}

async function searchOpenLibrary(title, creator) {
  const query = new URLSearchParams({
    title,
    fields: "key,title,author_name,first_publish_year,cover_i,edition_count",
    limit: "6",
  });
  if (creator) query.set("author", creator);

  const data = await requestOpenLibrary(`${OPEN_LIBRARY_BASE_URL}/search.json?${query}`);
  return (data.docs ?? []).filter((book) =>
    typeof book.key === "string" && /^\/works\/OL\d+W$/.test(book.key) && typeof book.title === "string"
  );
}

async function searchTmdb(type, title) {
  const endpoint = type === "movie" ? "movie" : "tv";
  const query = new URLSearchParams({ query: title, include_adult: "false" });
  const data = await requestJson(tmdbUrl(`/search/${endpoint}`, Object.fromEntries(query)));
  return (data.results ?? []).filter((result) => Number.isInteger(result.id));
}

function getMatchTitle(match, type) {
  if (type === "book") return match.title ?? "Untitled book";
  return match.title ?? match.name ?? "Untitled";
}

function getMatchSubtitle(match, type) {
  if (type === "book") {
    const author = match.author_name?.[0] ?? "Author not listed";
    const year = match.first_publish_year ? ` · ${match.first_publish_year}` : "";
    return `${author}${year}`;
  }
  const date = match.release_date ?? match.first_air_date;
  const year = date ? ` · ${date.slice(0, 4)}` : "";
  return `${type === "movie" ? "Movie" : "Series"}${year}`;
}

function createCatalogMatch(match, index, type) {
  const row = document.createElement("li");
  row.className = "catalog-match";

  const imagePath = type === "book"
    ? (Number.isInteger(match.cover_i) ? `https://covers.openlibrary.org/b/id/${match.cover_i}-M.jpg?default=false` : "")
    : (match.poster_path ? `${TMDB_IMAGE_BASE_URL}${String(match.poster_path).replace(/^\//, "")}` : "");

  if (imagePath) {
    const cover = document.createElement("img");
    cover.className = "catalog-match-cover";
    cover.src = imagePath;
    cover.alt = "";
    cover.loading = "lazy";
    cover.addEventListener("error", () => cover.remove(), { once: true });
    row.append(cover);
  }

  const text = document.createElement("div");
  text.className = "catalog-match-info";
  const title = document.createElement("p");
  title.className = "catalog-match-title";
  title.textContent = getMatchTitle(match, type);
  const subtitle = document.createElement("p");
  subtitle.className = "catalog-match-subtitle";
  subtitle.textContent = getMatchSubtitle(match, type);
  text.append(title, subtitle);

  const selectButton = document.createElement("button");
  selectButton.className = "button button-secondary";
  selectButton.type = "button";
  selectButton.dataset.action = "select-catalog-match";
  selectButton.dataset.matchIndex = String(index);
  selectButton.textContent = "Use this match";
  row.append(text, selectButton);
  return row;
}

async function searchCatalog(title, type, creator = "", itemId = null) {
  const cleanTitle = title.trim();
  if (!cleanTitle) {
    announceChange("Enter a title before searching the catalogs.", false);
    titleInput.focus();
    return;
  }

  catalogLookup.hidden = false;
  catalogMatchesList.replaceChildren();
  catalogStatus.textContent = `Searching ${type === "book" ? "Open Library" : "TMDB"}…`;
  catalogLookupContext = { title: cleanTitle, type, creator: creator.trim(), itemId };

  try {
    catalogMatches = type === "book"
      ? await searchOpenLibrary(cleanTitle, creator.trim())
      : await searchTmdb(type, cleanTitle);

    if (!catalogMatches.length) {
      catalogStatus.textContent = `No matches found for “${cleanTitle}”. You can still add it manually.`;
      return;
    }

    catalogMatchesList.replaceChildren(...catalogMatches.map((match, index) => createCatalogMatch(match, index, type)));
    catalogStatus.textContent = `Choose the right match for “${cleanTitle}”. Excript will keep your read/watched status.`;
  } catch (error) {
    catalogMatches = [];
    catalogStatus.textContent = error instanceof Error ? error.message : "Could not search this catalog. Try again.";
  }
}

async function getCatalogDetails(type, match) {
  if (type === "book") {
    const work = await requestOpenLibrary(`${OPEN_LIBRARY_BASE_URL}${match.key}.json`);
    const description = typeof work.description === "string"
      ? work.description
      : String(work.description?.value ?? "");
    const coverId = Number.isInteger(match.cover_i) ? match.cover_i : work.covers?.find(Number.isInteger);
    return {
      provider: "Open Library",
      id: match.key,
      mediaType: "book",
      sourceUrl: `${OPEN_LIBRARY_BASE_URL}${match.key}`,
      title: match.title,
      creator: match.author_name?.[0] ?? "",
      description,
      posterUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg?default=false` : "",
      releaseDate: match.first_publish_year ? String(match.first_publish_year) : "",
      refreshedAt: new Date().toISOString(),
    };
  }

  const isMovie = type === "movie";
  const mediaType = isMovie ? "movie" : "tv";
  const parameters = isMovie ? { append_to_response: "credits" } : {};
  const detail = await requestJson(tmdbUrl(`/${mediaType}/${match.id}`, parameters));
  const director = detail.credits?.crew?.find((person) => person.job === "Director")?.name ?? "";
  const creators = (detail.created_by ?? []).map((person) => person.name).filter(Boolean);
  const next = detail.next_episode_to_air;

  return {
    provider: "TMDB",
    id: String(detail.id),
    mediaType,
    sourceUrl: `https://www.themoviedb.org/${mediaType}/${detail.id}`,
    title: detail.title ?? detail.name ?? getMatchTitle(match, type),
    creator: isMovie ? director : creators.join(", "),
    description: detail.overview ?? "",
    posterUrl: detail.poster_path ? `${TMDB_IMAGE_BASE_URL}${String(detail.poster_path).replace(/^\//, "")}` : "",
    releaseDate: detail.release_date ?? detail.first_air_date ?? "",
    status: detail.status ?? "",
    nextEpisode: next ? {
      name: next.name ?? "",
      airDate: next.air_date ?? "",
      seasonNumber: Number(next.season_number) || 0,
      episodeNumber: Number(next.episode_number) || 0,
    } : null,
    refreshedAt: new Date().toISOString(),
  };
}

async function selectCatalogMatch(index) {
  const context = catalogLookupContext;
  const match = catalogMatches[index];
  if (!context || !match) return;

  catalogStatus.textContent = "Loading the selected details…";
  try {
    const catalog = await getCatalogDetails(context.type, match);
    let item = context.itemId ? items.find((savedItem) => savedItem.id === context.itemId) : null;

    if (item) {
      item.title = catalog.title || item.title;
      item.creator = catalog.creator || item.creator;
      item.catalog = catalog;
    } else {
      item = {
        id: createItemId(),
        title: catalog.title || context.title,
        creator: catalog.creator || context.creator,
        type: context.type,
        completed: false,
        catalog,
      };
      items.unshift(item);
      itemFilter.value = "all";
      form.reset();
      updateCreatorPrompt();
    }

    const saved = saveItems();
    renderItems();
    catalogStatus.textContent = `Saved live details for “${item.title}”.`;
    announceChange(`Connected “${item.title}” to ${catalog.provider}.`, saved);
  } catch (error) {
    catalogStatus.textContent = error instanceof Error ? error.message : "Could not load that match. Try again.";
  }
}

function catalogIsStale(item) {
  const updatedAt = Date.parse(item.catalog?.refreshedAt ?? "");
  return !Number.isFinite(updatedAt) || Date.now() - updatedAt >= AUTO_REFRESH_INTERVAL;
}

async function refreshStaleCatalogItems(provider) {
  const staleItems = items.filter((item) => item.catalog?.provider === provider && catalogIsStale(item));
  if (!staleItems.length) {
    catalogUpdateStatus.textContent = `${provider} details are up to date.`;
    return;
  }

  catalogUpdateStatus.textContent = `Checking ${staleItems.length} linked ${provider} title${staleItems.length === 1 ? "" : "s"}…`;
  let refreshedCount = 0;
  const failedTitles = [];

  for (let index = 0; index < staleItems.length; index += 1) {
    if (index > 0 && provider === "TMDB") await new Promise((resolve) => setTimeout(resolve, 250));
    if (await refreshCatalogItem(staleItems[index], { silent: true })) {
      refreshedCount += 1;
    } else {
      failedTitles.push(staleItems[index].title);
    }
  }

  catalogUpdateStatus.textContent = `Updated ${refreshedCount} of ${staleItems.length} linked ${provider} title${staleItems.length === 1 ? "" : "s"}.`;
  if (failedTitles.length) catalogUpdateStatus.textContent += ` Could not update: ${failedTitles.join(", ")}.`;
}

async function refreshCatalogItem(item, { silent = false } = {}) {
  if (!item.catalog) {
    await searchCatalog(item.title, item.type, item.creator, item.id);
    return false;
  }

  try {
    const catalog = item.catalog.provider === "TMDB"
      ? await getCatalogDetails(item.type, { id: Number(item.catalog.id) })
      : await (async () => {
          const matches = await searchOpenLibrary(item.title, item.creator);
          const match = matches.find((book) => book.key === item.catalog.id);
          if (!match) throw new Error("Open Library no longer returned this match. Choose Find online to link another edition.");
          return getCatalogDetails("book", match);
        })();

    item.catalog = catalog;
    if (!item.creator && catalog.creator) item.creator = catalog.creator;
    const saved = saveItems();
    renderItems();
    if (!silent) announceChange(`Updated catalog details for “${item.title}”.`, saved);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not refresh this title. Try again.";
    if (silent) {
      catalogUpdateStatus.textContent = `Could not update “${item.title}”: ${message}`;
    } else {
      catalogLookup.hidden = false;
      catalogMatchesList.replaceChildren();
      catalogStatus.textContent = message;
    }
    return false;
  }
}

function visibleItemsFor(type) {
  let matchingItems = items.filter((item) => item.type === type);

  if (itemFilter.value === "completed") {
    matchingItems = matchingItems.filter((item) => item.completed);
  } else if (itemFilter.value === "active") {
    matchingItems = matchingItems.filter((item) => !item.completed);
  }

  const query = itemSearch.value.trim().toLowerCase();
  if (!query) return matchingItems;

  return matchingItems.filter((item) =>
    `${item.title} ${item.creator}`.toLowerCase().includes(query)
  );
}

function createItemCard(item) {
  const details = TYPE_DETAILS[item.type];
  const card = document.createElement("li");
  card.className = item.completed ? "media-card is-complete" : "media-card";

  const info = document.createElement("div");
  info.className = "media-info";

  const copy = document.createElement("div");
  copy.className = "media-copy";

  const title = document.createElement("h4");
  title.className = "media-title";
  title.textContent = item.title;

  copy.append(title);

  if (item.creator) {
    const creator = document.createElement("p");
    creator.className = "media-detail";
    creator.textContent = `${details.person}: ${item.creator}`;
    copy.append(creator);
  }

  if (item.catalog?.posterUrl) {
    const poster = document.createElement("img");
    poster.className = "media-poster";
    poster.src = item.catalog.posterUrl;
    poster.alt = `Cover art for ${item.title}`;
    poster.loading = "lazy";
    poster.addEventListener("error", () => poster.remove(), { once: true });
    info.append(poster);
  }

  if (item.catalog) {
    if (item.catalog.releaseDate) {
      const release = document.createElement("p");
      release.className = "catalog-detail";
      const year = item.catalog.releaseDate.slice(0, 4);
      release.textContent = `${item.type === "book" ? "Published" : "Released"} ${year}`;
      copy.append(release);
    }

  }

  info.append(copy);

  const actions = document.createElement("div");
  actions.className = "media-actions";

  const status = document.createElement("span");
  status.className = "status-chip";
  status.textContent = item.completed
    ? (item.type === "book" ? "Read" : "Watched")
    : details.active;

  const toggleButton = document.createElement("button");
  toggleButton.className = "button button-secondary";
  toggleButton.type = "button";
  toggleButton.dataset.action = "toggle";
  toggleButton.dataset.itemId = item.id;
  toggleButton.textContent = item.completed
    ? (item.type === "book" ? "Mark unread" : "Mark unwatched")
    : `Mark ${details.completed}`;
  toggleButton.setAttribute("aria-label", `${toggleButton.textContent}: ${item.title}`);

  const catalogButton = document.createElement("button");
  catalogButton.className = "button button-secondary button-catalog";
  catalogButton.type = "button";
  catalogButton.dataset.action = item.catalog ? "refresh-catalog" : "find-catalog";
  catalogButton.dataset.itemId = item.id;
  catalogButton.textContent = item.catalog ? "Refresh details" : "Find online";
  catalogButton.setAttribute("aria-label", `${catalogButton.textContent} for ${item.title}`);

  const removeButton = document.createElement("button");
  removeButton.className = "button-quiet";
  removeButton.type = "button";
  removeButton.dataset.action = "remove";
  removeButton.dataset.itemId = item.id;
  removeButton.textContent = "Remove";
  removeButton.setAttribute("aria-label", `Remove ${item.title}`);

  actions.append(status, catalogButton, toggleButton, removeButton);
  card.append(info, actions);
  return card;
}

function renderItems() {
  const completedCount = items.filter((item) => item.completed).length;
  const itemWord = items.length === 1 ? "item" : "items";
  readingStats.textContent = `${items.length} ${itemWord} · ${completedCount} completed`;

  const query = itemSearch.value.trim();
  const visibleCount = ITEM_TYPES.reduce((count, type) => count + visibleItemsFor(type).length, 0);
  const noSearchMatches = Boolean(query) && visibleCount === 0;
  mediaSections.hidden = noSearchMatches;
  searchEmpty.hidden = !noSearchMatches;
  if (noSearchMatches) {
    searchEmptyCopy.textContent = `No results for “${query}”. Try a different title or person, or change the status filter.`;
  }

  for (const type of ITEM_TYPES) {
    const section = sections[type];
    const visibleItems = visibleItemsFor(type);
    const totalCount = items.filter((item) => item.type === type).length;
    const noun = section.noun;
    const countWord = noun === "series" ? noun : (totalCount === 1 ? noun : `${noun}s`);

    section.count.textContent = `${totalCount} ${countWord}`;
    section.list.replaceChildren(...visibleItems.map(createItemCard));

    const hasVisibleItems = visibleItems.length > 0;
    section.list.hidden = !hasVisibleItems;
    section.empty.hidden = hasVisibleItems;

    if (!hasVisibleItems && query) {
      section.empty.querySelector(".empty-title").textContent = "No matches in this section.";
      section.empty.querySelector("p:last-child").textContent = "Try another search or change the status filter.";
    } else if (!hasVisibleItems && totalCount > 0) {
      section.empty.querySelector(".empty-title").textContent = "Nothing in this view.";
      section.empty.querySelector("p:last-child").textContent = `Change the filter to see your ${countWord}.`;
    } else if (type === "book") {
      section.empty.querySelector(".empty-title").textContent = "No books yet";
      section.empty.querySelector("p:last-child").textContent = "Find one online or add a title above.";
    } else if (type === "movie") {
      section.empty.querySelector(".empty-title").textContent = "No movies yet";
      section.empty.querySelector("p:last-child").textContent = "Find one online or add a title above.";
    } else {
      section.empty.querySelector(".empty-title").textContent = "No series yet";
      section.empty.querySelector("p:last-child").textContent = "Find one online or add a title above.";
    }
  }
}

function updateCreatorPrompt() {
  const details = TYPE_DETAILS[typeInput.value];
  creatorLabel.textContent = details.person;
  creatorInput.placeholder = details.prompt;
}

typeInput.addEventListener("change", updateCreatorPrompt);

catalogSearchButton.addEventListener("click", () => {
  searchCatalog(titleInput.value, typeInput.value, creatorInput.value);
});

catalogCloseButton.addEventListener("click", () => {
  catalogLookup.hidden = true;
  catalogMatchesList.replaceChildren();
  catalogMatches = [];
  catalogLookupContext = null;
});

catalogLookup.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='select-catalog-match']");
  if (button) selectCatalogMatch(Number(button.dataset.matchIndex));
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const title = titleInput.value.trim();
  const creator = creatorInput.value.trim();
  const type = typeInput.value;

  if (!title) {
    announceChange("Please enter a title.", false);
    return;
  }

  items.unshift({
    id: createItemId(),
    title,
    creator,
    type,
    completed: false,
  });

  itemFilter.value = "all";
  const saved = saveItems();
  form.reset();
  updateCreatorPrompt();
  titleInput.focus();
  renderItems();
  announceChange(`Added “${title}” to ${type === "book" ? "Books" : type === "movie" ? "Movies" : "Series"}.`, saved);
});

for (const section of Object.values(sections)) {
  section.list.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const item = items.find((savedItem) => savedItem.id === button.dataset.itemId);
    if (!item) return;

    if (button.dataset.action === "toggle") {
      item.completed = !item.completed;
      const saved = saveItems();
      renderItems();
      announceChange(`${item.completed ? "Completed" : "Reopened"}: “${item.title}”.`, saved);
    }

    if (button.dataset.action === "remove") {
      items = items.filter((savedItem) => savedItem.id !== item.id);
      const saved = saveItems();
      renderItems();
      announceChange(`Removed “${item.title}” from your list.`, saved);
    }

    if (button.dataset.action === "find-catalog") {
      searchCatalog(item.title, item.type, item.creator, item.id);
    }

    if (button.dataset.action === "refresh-catalog") {
      refreshCatalogItem(item);
    }
  });
}

itemFilter.addEventListener("change", renderItems);
itemSearch.addEventListener("input", renderItems);
for (const button of themeButtons) {
  button.addEventListener("click", () => applyTheme(button.dataset.themeChoice));
}

signOutButton.addEventListener("click", async () => {
  signOutButton.disabled = true;
  await cloudSyncQueue.catch(() => {});
  if (supabaseClient) await supabaseClient.auth.signOut();
  location.replace("/");
});

void initializeApp();

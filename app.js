const STORAGE_KEY = "excript-reading-list-v1";
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
const readingStats = document.querySelector("#reading-stats");

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

let items = loadItems();

function createItemId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadItems() {
  try {
    const savedItems = localStorage.getItem(STORAGE_KEY);
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
        };
      })
      .filter((item) => item.title && item.creator);
  } catch {
    return [];
  }
}

function saveItems() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

function announceChange(message, saved = true) {
  formMessage.textContent = saved
    ? message
    : `${message} It may not stay after you close this page because this browser could not save it.`;
}

function visibleItemsFor(type) {
  const matchingType = items.filter((item) => item.type === type);

  if (itemFilter.value === "completed") {
    return matchingType.filter((item) => item.completed);
  }

  if (itemFilter.value === "active") {
    return matchingType.filter((item) => !item.completed);
  }

  return matchingType;
}

function createItemCard(item) {
  const details = TYPE_DETAILS[item.type];
  const card = document.createElement("li");
  card.className = item.completed ? "media-card is-complete" : "media-card";

  const info = document.createElement("div");
  info.className = "media-info";

  const title = document.createElement("h4");
  title.className = "media-title";
  title.textContent = item.title;

  const creator = document.createElement("p");
  creator.className = "media-detail";
  creator.textContent = `${details.person}: ${item.creator}`;
  info.append(title, creator);

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

  const removeButton = document.createElement("button");
  removeButton.className = "button-quiet";
  removeButton.type = "button";
  removeButton.dataset.action = "remove";
  removeButton.dataset.itemId = item.id;
  removeButton.textContent = "Remove";
  removeButton.setAttribute("aria-label", `Remove ${item.title}`);

  actions.append(status, toggleButton, removeButton);
  card.append(info, actions);
  return card;
}

function renderItems() {
  const completedCount = items.filter((item) => item.completed).length;
  const itemWord = items.length === 1 ? "item" : "items";
  readingStats.textContent = `${items.length} ${itemWord} · ${completedCount} completed`;

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

    if (!hasVisibleItems && totalCount > 0) {
      section.empty.querySelector(".empty-title").textContent = "Nothing in this view.";
      section.empty.querySelector("p:last-child").textContent = `Change the filter to see your ${countWord}.`;
    } else if (type === "book") {
      section.empty.querySelector(".empty-title").textContent = "No books saved yet.";
      section.empty.querySelector("p:last-child").textContent = "Add a book above and it will find a home here.";
    } else if (type === "movie") {
      section.empty.querySelector(".empty-title").textContent = "No movies saved yet.";
      section.empty.querySelector("p:last-child").textContent = "Save a film to watch later.";
    } else {
      section.empty.querySelector(".empty-title").textContent = "No series saved yet.";
      section.empty.querySelector("p:last-child").textContent = "Keep a series here for your next watch.";
    }
  }
}

function updateCreatorPrompt() {
  const details = TYPE_DETAILS[typeInput.value];
  creatorLabel.textContent = details.person;
  creatorInput.placeholder = details.prompt;
}

typeInput.addEventListener("change", updateCreatorPrompt);

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const title = titleInput.value.trim();
  const creator = creatorInput.value.trim();
  const type = typeInput.value;

  if (!title || !creator) {
    announceChange(`Please enter a title and ${TYPE_DETAILS[type].person.toLowerCase()}.`, false);
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
  });
}

itemFilter.addEventListener("change", renderItems);

updateCreatorPrompt();
renderItems();

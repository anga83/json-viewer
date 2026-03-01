const STORAGE_KEYS = {
  jsonInput: "json-viewer:json-input",
  highlight: "json-viewer:highlight",
  activeTab: "json-viewer:active-tab"
};

const SAFE_DOT_KEY = /^\p{L}[\p{L}\p{N}_$]*$/u;

const EXAMPLE_DATA = {
  profil: {
    name: "Ada Lovelace",
    rollen: ["Entwicklerin", "Analystin"],
    usernames: {
      github: "ada-l",
      twitter: "@ada_math",
      mastodon: "@ada@social.example"
    },
    aktiv: true,
    punkte: 1337
  },
  projekte: [
    { titel: "Rechenkern", status: "fertig", tags: ["mathe", "algorithmen"] },
    { titel: "Visualisierung", status: "in Arbeit", tags: ["ui", "json", "baum"] }
  ],
  einstellungen: {
    theme: "hell",
    sprache: "de",
    zeitstempel: "2026-03-01T12:00:00Z"
  }
};

const refs = {
  tabButtons: document.querySelectorAll(".tab-button"),
  tabPanels: document.querySelectorAll(".tab-panel"),
  jsonInput: document.getElementById("jsonInput"),
  parseMessage: document.getElementById("parseMessage"),
  applyBtn: document.getElementById("applyBtn"),
  formatBtn: document.getElementById("formatBtn"),
  minifyBtn: document.getElementById("minifyBtn"),
  loadExampleBtn: document.getElementById("loadExampleBtn"),
  searchInput: document.getElementById("searchInput"),
  clearSearchBtn: document.getElementById("clearSearchBtn"),
  searchCount: document.getElementById("searchCount"),
  expandAllBtn: document.getElementById("expandAllBtn"),
  collapseAllBtn: document.getElementById("collapseAllBtn"),
  highlightToggle: document.getElementById("highlightToggle"),
  treeContainer: document.getElementById("treeContainer"),
  searchResults: document.getElementById("searchResults"),
  selectedPath: document.getElementById("selectedPath"),
  copyPathBtn: document.getElementById("copyPathBtn"),
  jsonStats: document.getElementById("jsonStats")
};

const state = {
  data: null,
  selectedPath: ".",
  collapsedPaths: new Set(),
  searchExpandedPaths: new Set(),
  rowByPath: new Map(),
  nodeByPath: new Map()
};

init();

function init() {
  bindTabs();
  bindControls();
  restoreState();
  showSearchResultsPlaceholder("Suche starten, um Treffer aufzulisten.");
  updateSearchCount(0);
}

function bindTabs() {
  refs.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activateTab(button.dataset.tabTarget);
    });
  });
}

function bindControls() {
  refs.applyBtn.addEventListener("click", () => {
    parseAndRender({ switchToViewer: true, showSuccessMessage: true });
  });

  refs.loadExampleBtn.addEventListener("click", () => {
    refs.jsonInput.value = JSON.stringify(EXAMPLE_DATA, null, 2);
    setParseMessage("Beispiel-JSON wurde geladen.", "success");
    refs.jsonInput.focus();
  });

  refs.formatBtn.addEventListener("click", () => {
    transformInput((data) => JSON.stringify(data, null, 2), "JSON wurde formatiert.");
  });

  refs.minifyBtn.addEventListener("click", () => {
    transformInput((data) => JSON.stringify(data), "JSON wurde minifiziert.");
  });

  refs.searchInput.addEventListener("input", () => {
    applySearch();
  });

  refs.clearSearchBtn.addEventListener("click", () => {
    refs.searchInput.value = "";
    applySearch();
    refs.searchInput.focus();
  });

  refs.expandAllBtn.addEventListener("click", () => {
    expandAllNodes();
  });

  refs.collapseAllBtn.addEventListener("click", () => {
    collapseAllNodes();
  });

  refs.highlightToggle.addEventListener("change", () => {
    applyHighlightPreference();
    localStorage.setItem(STORAGE_KEYS.highlight, refs.highlightToggle.checked ? "1" : "0");
  });

  refs.copyPathBtn.addEventListener("click", () => {
    copySelectedPath();
  });

  refs.jsonInput.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      parseAndRender({ switchToViewer: true, showSuccessMessage: true });
    }
  });

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f" && getActiveTabId() === "viewer-tab") {
      event.preventDefault();
      refs.searchInput.focus();
    }
  });
}

function restoreState() {
  const savedHighlight = localStorage.getItem(STORAGE_KEYS.highlight);
  if (savedHighlight === "0") {
    refs.highlightToggle.checked = false;
  }
  applyHighlightPreference();

  const savedJsonInput = localStorage.getItem(STORAGE_KEYS.jsonInput);
  if (savedJsonInput) {
    refs.jsonInput.value = savedJsonInput;
    parseAndRender({ switchToViewer: false, showSuccessMessage: false, fromRestore: true });
  }

  const savedTabId = localStorage.getItem(STORAGE_KEYS.activeTab);
  if (savedTabId && (savedTabId !== "viewer-tab" || state.data !== null)) {
    activateTab(savedTabId);
  } else {
    activateTab("input-tab");
  }
}

function activateTab(tabId) {
  refs.tabButtons.forEach((button) => {
    const isActive = button.dataset.tabTarget === tabId;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  refs.tabPanels.forEach((panel) => {
    const isActive = panel.id === tabId;
    panel.classList.toggle("active", isActive);
    panel.hidden = !isActive;
  });

  localStorage.setItem(STORAGE_KEYS.activeTab, tabId);
}

function getActiveTabId() {
  const activePanel = Array.from(refs.tabPanels).find((panel) => !panel.hidden);
  return activePanel ? activePanel.id : "input-tab";
}

function transformInput(transformFn, successText) {
  const inputText = refs.jsonInput.value.trim();
  if (!inputText) {
    setParseMessage("Es ist kein JSON zum Verarbeiten vorhanden.", "error");
    return;
  }

  try {
    const data = JSON.parse(inputText);
    refs.jsonInput.value = transformFn(data);
    setParseMessage(successText, "success");
  } catch (error) {
    reportParseError(error, refs.jsonInput.value);
  }
}

function parseAndRender(options = {}) {
  const { switchToViewer = false, showSuccessMessage = true, fromRestore = false } = options;
  const inputText = refs.jsonInput.value.trim();

  if (!inputText) {
    if (!fromRestore) {
      setParseMessage("Bitte zuerst JSON einfügen.", "error");
    }
    return false;
  }

  try {
    const data = JSON.parse(inputText);
    state.data = data;
    state.selectedPath = ".";
    state.collapsedPaths.clear();
    state.searchExpandedPaths.clear();
    refs.searchInput.value = "";

    renderTree();
    updateStats();
    updateSelectedPath(".");
    applySearch();

    localStorage.setItem(STORAGE_KEYS.jsonInput, refs.jsonInput.value);

    if (showSuccessMessage) {
      const stats = computeStats(data);
      setParseMessage(`JSON erfolgreich geladen (${stats.nodeCount} Knoten).`, "success");
    } else {
      setParseMessage("", "");
    }

    if (switchToViewer) {
      activateTab("viewer-tab");
    }

    return true;
  } catch (error) {
    if (!fromRestore) {
      reportParseError(error, refs.jsonInput.value);
    }
    return false;
  }
}

function reportParseError(error, sourceText) {
  const location = extractParseLocation(error, sourceText);
  const message = location
    ? `JSON Fehler in Zeile ${location.line}, Spalte ${location.column}: ${location.message}`
    : `JSON Fehler: ${error.message}`;
  setParseMessage(message, "error");
}

function extractParseLocation(error, sourceText) {
  const positionMatch = /position\s+(\d+)/i.exec(error.message);
  if (!positionMatch) {
    return null;
  }

  const position = Number(positionMatch[1]);
  const before = sourceText.slice(0, position);
  const line = before.split("\n").length;
  const lastBreak = before.lastIndexOf("\n");
  const column = position - lastBreak;

  return {
    line,
    column,
    message: error.message.replace(/\s+at position\s+\d+/i, "")
  };
}

function setParseMessage(message, type) {
  refs.parseMessage.textContent = message;
  refs.parseMessage.classList.remove("error", "success");
  if (type) {
    refs.parseMessage.classList.add(type);
  }
}

function renderTree() {
  refs.treeContainer.innerHTML = "";
  state.rowByPath.clear();
  state.nodeByPath.clear();

  if (state.data === null) {
    refs.treeContainer.innerHTML = '<div class="placeholder">Noch kein JSON geladen.</div>';
    return;
  }

  const rootNode = buildNode({
    value: state.data,
    path: ".",
    label: "root",
    isRoot: true,
    parentIsArray: false
  });

  refs.treeContainer.appendChild(rootNode);
  applyHighlightPreference();
}

function buildNode({ value, path, label, isRoot, parentIsArray }) {
  const isContainer = isObject(value) || Array.isArray(value);
  const node = document.createElement("div");
  node.className = `tree-node${isContainer ? " is-container" : " is-leaf"}`;
  node.dataset.path = path;

  if (isContainer && state.collapsedPaths.has(path)) {
    node.classList.add("collapsed");
  }

  const row = document.createElement("div");
  row.className = "tree-row";
  row.dataset.path = path;

  const preview = describeValue(value);
  row.dataset.summary = preview.summary;
  row.dataset.searchText = [
    path,
    isRoot ? "root" : String(label),
    preview.searchText
  ]
    .join(" ")
    .toLowerCase();

  row.addEventListener("click", () => {
    updateSelectedPath(path);
  });

  const toggle = createToggleElement(isContainer, path);
  row.appendChild(toggle);

  if (isRoot) {
    row.appendChild(makeSpan("token-meta", "root"));
  } else if (parentIsArray) {
    row.appendChild(makeSpan("token-meta", `[${label}]`));
  } else {
    row.appendChild(makeSpan("token-key", String(label)));
  }

  row.appendChild(makeSpan("token-punct", ":"));
  row.appendChild(makeSpan(preview.className, preview.displayText));

  node.appendChild(row);
  state.rowByPath.set(path, row);
  state.nodeByPath.set(path, node);

  if (isContainer) {
    const children = document.createElement("div");
    children.className = "tree-children";

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const childPath = `${path}[${index}]`;
        children.appendChild(
          buildNode({
            value: item,
            path: childPath,
            label: index,
            isRoot: false,
            parentIsArray: true
          })
        );
      });
    } else {
      Object.entries(value).forEach(([key, childValue]) => {
        const childPath = appendPath(path, key);
        children.appendChild(
          buildNode({
            value: childValue,
            path: childPath,
            label: key,
            isRoot: false,
            parentIsArray: false
          })
        );
      });
    }

    node.appendChild(children);
  }

  return node;
}

function createToggleElement(isContainer, path) {
  if (!isContainer) {
    const spacer = document.createElement("span");
    spacer.className = "node-spacer";
    spacer.setAttribute("aria-hidden", "true");
    return spacer;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "node-toggle";
  button.setAttribute("aria-label", "Node aus- oder einklappen");
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleNode(path);
  });
  return button;
}

function toggleNode(path) {
  const node = state.nodeByPath.get(path);
  if (!node) {
    return;
  }

  const shouldCollapse = !node.classList.contains("collapsed");
  node.classList.toggle("collapsed", shouldCollapse);

  if (shouldCollapse) {
    state.collapsedPaths.add(path);
  } else {
    state.collapsedPaths.delete(path);
  }
}

function expandAllNodes() {
  state.nodeByPath.forEach((node, path) => {
    if (!node.classList.contains("is-container")) {
      return;
    }
    node.classList.remove("collapsed");
    state.collapsedPaths.delete(path);
  });
}

function collapseAllNodes() {
  state.nodeByPath.forEach((node, path) => {
    if (!node.classList.contains("is-container") || path === ".") {
      return;
    }
    node.classList.add("collapsed");
    state.collapsedPaths.add(path);
  });
}

function updateSelectedPath(path) {
  if (state.rowByPath.has(state.selectedPath)) {
    state.rowByPath.get(state.selectedPath).classList.remove("selected");
  }

  state.selectedPath = path;
  refs.selectedPath.textContent = path;

  const row = state.rowByPath.get(path);
  if (row) {
    row.classList.add("selected");
  }
}

function applySearch() {
  if (!state.data) {
    showSearchResultsPlaceholder("Noch keine Daten geladen.");
    updateSearchCount(0);
    return;
  }

  restoreSearchExpandedNodes();

  const query = refs.searchInput.value.trim().toLowerCase();
  state.rowByPath.forEach((row) => row.classList.remove("is-match"));

  if (!query) {
    updateSearchCount(0);
    showSearchResultsPlaceholder("Suche starten, um Treffer aufzulisten.");
    return;
  }

  const matches = [];
  state.rowByPath.forEach((row, path) => {
    if ((row.dataset.searchText || "").includes(query)) {
      row.classList.add("is-match");
      matches.push({ path, row });
      expandAncestorsForSearch(row);
    }
  });

  updateSearchCount(matches.length);
  renderSearchResults(matches, query);
}

function restoreSearchExpandedNodes() {
  state.searchExpandedPaths.forEach((path) => {
    const node = state.nodeByPath.get(path);
    if (!node) {
      return;
    }
    if (state.collapsedPaths.has(path)) {
      node.classList.add("collapsed");
    }
  });
  state.searchExpandedPaths.clear();
}

function expandAncestorsForSearch(row) {
  let currentNode = row.closest(".tree-node");
  while (currentNode) {
    const path = currentNode.dataset.path;
    if (currentNode.classList.contains("collapsed")) {
      currentNode.classList.remove("collapsed");
      state.searchExpandedPaths.add(path);
    }

    const parent = currentNode.parentElement;
    currentNode = parent ? parent.closest(".tree-node") : null;
  }
}

function renderSearchResults(matches, query) {
  refs.searchResults.innerHTML = "";

  if (matches.length === 0) {
    showSearchResultsPlaceholder(`Keine Treffer für „${query}“.`);
    return;
  }

  const limit = 300;
  const visibleMatches = matches.slice(0, limit);

  visibleMatches.forEach((match, index) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    const summary = match.row.dataset.summary || "Treffer";
    button.type = "button";
    button.textContent = `${index + 1}. ${match.path}  |  ${summary}`;
    button.addEventListener("click", () => {
      updateSelectedPath(match.path);
      match.row.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    li.appendChild(button);
    refs.searchResults.appendChild(li);
  });

  if (matches.length > visibleMatches.length) {
    const extra = document.createElement("li");
    extra.className = "empty";
    extra.textContent = `Es werden ${visibleMatches.length} von ${matches.length} Treffern gezeigt.`;
    refs.searchResults.appendChild(extra);
  }
}

function showSearchResultsPlaceholder(text) {
  refs.searchResults.innerHTML = "";
  const item = document.createElement("li");
  item.className = "empty";
  item.textContent = text;
  refs.searchResults.appendChild(item);
}

function updateSearchCount(count) {
  refs.searchCount.textContent = `${count} ${count === 1 ? "Treffer" : "Treffer"}`;
}

function applyHighlightPreference() {
  refs.treeContainer.classList.toggle("syntax-off", !refs.highlightToggle.checked);
  refs.treeContainer.classList.toggle("syntax-on", refs.highlightToggle.checked);
}

async function copySelectedPath() {
  const path = state.selectedPath || ".";
  const previousText = refs.copyPathBtn.textContent;

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(path);
    } else {
      fallbackCopy(path);
    }
    refs.copyPathBtn.textContent = "Kopiert";
  } catch (error) {
    refs.copyPathBtn.textContent = "Fehler beim Kopieren";
  }

  window.setTimeout(() => {
    refs.copyPathBtn.textContent = previousText;
  }, 1200);
}

function fallbackCopy(text) {
  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "");
  helper.style.position = "absolute";
  helper.style.left = "-9999px";
  document.body.appendChild(helper);
  helper.select();
  document.execCommand("copy");
  document.body.removeChild(helper);
}

function updateStats() {
  if (state.data === null) {
    refs.jsonStats.textContent = "Keine Daten geladen";
    return;
  }
  const stats = computeStats(state.data);
  refs.jsonStats.textContent = `Knoten: ${stats.nodeCount} · Schlüssel: ${stats.keyCount} · Tiefe: ${stats.maxDepth}`;
}

function computeStats(value) {
  let nodeCount = 0;
  let keyCount = 0;
  let maxDepth = 0;

  function walk(current, depth) {
    nodeCount += 1;
    maxDepth = Math.max(maxDepth, depth);

    if (Array.isArray(current)) {
      current.forEach((item) => walk(item, depth + 1));
      return;
    }

    if (isObject(current)) {
      Object.entries(current).forEach(([, child]) => {
        keyCount += 1;
        walk(child, depth + 1);
      });
    }
  }

  walk(value, 0);
  return { nodeCount, keyCount, maxDepth };
}

function describeValue(value) {
  if (Array.isArray(value)) {
    const length = value.length;
    return {
      className: "token-meta",
      displayText: `[${length} ${length === 1 ? "Eintrag" : "Einträge"}]`,
      summary: `Array mit ${length} ${length === 1 ? "Eintrag" : "Einträgen"}`,
      searchText: `array einträge ${length}`
    };
  }

  if (isObject(value)) {
    const keys = Object.keys(value);
    const keyPreview = keys.slice(0, 10).join(" ");
    return {
      className: "token-meta",
      displayText: `{${keys.length} ${keys.length === 1 ? "Eigenschaft" : "Eigenschaften"}}`,
      summary: `Objekt mit ${keys.length} ${keys.length === 1 ? "Eigenschaft" : "Eigenschaften"}`,
      searchText: `objekt eigenschaften ${keys.length} ${keyPreview}`
    };
  }

  if (typeof value === "string") {
    const normalized = value.replace(/\s+/g, " ").trim();
    const shortened = normalized.length > 90 ? `${normalized.slice(0, 87)}...` : normalized;
    return {
      className: "token-string",
      displayText: `"${shortened}"`,
      summary: `String: "${shortened}"`,
      searchText: `string ${normalized}`
    };
  }

  if (typeof value === "number") {
    return {
      className: "token-number",
      displayText: String(value),
      summary: `Number: ${value}`,
      searchText: `number ${value}`
    };
  }

  if (typeof value === "boolean") {
    return {
      className: "token-boolean",
      displayText: String(value),
      summary: `Boolean: ${value}`,
      searchText: `boolean ${value}`
    };
  }

  if (value === null) {
    return {
      className: "token-null",
      displayText: "null",
      summary: "null",
      searchText: "null"
    };
  }

  return {
    className: "node-type",
    displayText: String(value),
    summary: String(value),
    searchText: String(value)
  };
}

function appendPath(basePath, key) {
  if (SAFE_DOT_KEY.test(key)) {
    return basePath === "." ? `.${key}` : `${basePath}.${key}`;
  }
  const escapedKey = key.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `${basePath}["${escapedKey}"]`;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function makeSpan(className, text) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

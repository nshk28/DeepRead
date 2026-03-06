// ── TextLens · Storage Helpers ──────────────────────────────────────────────

const DEFAULTS = {
  settings: {
    provider: 'groq',
    apiKey: '',
    notionToken: '',
    notionDatabaseId: '',
    defaultColor: 'yellow',
    enabled: true,
  },
  highlights: {},  // keyed by URL
};

/** Get settings from chrome.storage.local */
async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULTS.settings, ...settings };
}

/** Save (merge) settings */
async function saveSettings(partial) {
  const current = await getSettings();
  const merged = { ...current, ...partial };
  await chrome.storage.local.set({ settings: merged });
  return merged;
}

/** Get all highlights for a given URL */
async function getHighlights(url) {
  const { highlights = {} } = await chrome.storage.local.get('highlights');
  return highlights[url] || [];
}

/** Save a new highlight for a URL */
async function addHighlight(url, highlight) {
  const { highlights = {} } = await chrome.storage.local.get('highlights');
  if (!highlights[url]) highlights[url] = [];
  highlights[url].push({
    id: crypto.randomUUID(),
    text: highlight.text,
    color: highlight.color || 'yellow',
    // For relocating on revisit:
    anchorText: highlight.anchorText || '',       // surrounding context
    anchorSelector: highlight.anchorSelector || '', // CSS selector of parent
    anchorOffset: highlight.anchorOffset || 0,
    createdAt: new Date().toISOString(),
  });
  await chrome.storage.local.set({ highlights });
  return highlights[url];
}

/** Remove a highlight by id for a URL */
async function removeHighlight(url, highlightId) {
  const { highlights = {} } = await chrome.storage.local.get('highlights');
  if (highlights[url]) {
    highlights[url] = highlights[url].filter(h => h.id !== highlightId);
    if (highlights[url].length === 0) delete highlights[url];
    await chrome.storage.local.set({ highlights });
  }
}

/** Get all highlights across all URLs */
async function getAllHighlights() {
  const { highlights = {} } = await chrome.storage.local.get('highlights');
  return highlights;
}

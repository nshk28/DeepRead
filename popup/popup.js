// ── TextLens · Popup Script ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const toggleEnabled = document.getElementById('toggle-enabled');
  const pageCount = document.getElementById('page-count');
  const totalCount = document.getElementById('total-count');
  const apiLabel = document.getElementById('api-label');
  const notionLabel = document.getElementById('notion-label');
  const btnSettings = document.getElementById('btn-settings');
  const btnClear = document.getElementById('btn-clear');

  // ── Load current state
  const { settings = {} } = await chrome.storage.local.get('settings');
  const { highlights = {} } = await chrome.storage.local.get('highlights');

  // Toggle
  toggleEnabled.checked = settings.enabled !== false;
  toggleEnabled.addEventListener('change', async () => {
    const { settings: current = {} } = await chrome.storage.local.get('settings');
    current.enabled = toggleEnabled.checked;
    await chrome.storage.local.set({ settings: current });
  });

  // Stats
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentUrl = tab?.url || '';
  const pageHighlights = highlights[currentUrl] || [];
  const totalHighlights = Object.values(highlights).reduce((sum, arr) => sum + arr.length, 0);

  pageCount.textContent = pageHighlights.length;
  totalCount.textContent = totalHighlights;

  // API status
  if (settings.apiKey) {
    const provider = settings.provider === 'openai' ? 'OpenAI' : 'Groq';
    apiLabel.textContent = `${provider} API key configured ✓`;
    apiLabel.classList.add('active');
  }

  if (settings.notionToken && settings.notionDatabaseId) {
    notionLabel.textContent = 'Notion connected ✓';
    notionLabel.classList.add('active');
  }

  // Settings button
  btnSettings.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Clear highlights for current page
  btnClear.addEventListener('click', async () => {
    if (!pageHighlights.length) return;
    if (!confirm(`Remove all ${pageHighlights.length} highlights from this page?`)) return;

    const { highlights: current = {} } = await chrome.storage.local.get('highlights');
    delete current[currentUrl];
    await chrome.storage.local.set({ highlights: current });

    pageCount.textContent = '0';

    // Reload the tab to clear visual highlights
    if (tab?.id) chrome.tabs.reload(tab.id);
    window.close();
  });
});

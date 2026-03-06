// ── TextLens · Options Script ────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const providerSelect = document.getElementById('provider');
  const apiKeyInput = document.getElementById('api-key');
  const toggleKeyBtn = document.getElementById('toggle-key');
  const keyHint = document.getElementById('key-hint');
  const notionTokenInput = document.getElementById('notion-token');
  const notionDbInput = document.getElementById('notion-db');
  const colorButtons = document.querySelectorAll('.color-option');
  const btnSave = document.getElementById('btn-save');
  const saveStatus = document.getElementById('save-status');
  const btnExport = document.getElementById('btn-export');
  const btnClearAll = document.getElementById('btn-clear-all');
  const dataStats = document.getElementById('data-stats');

  let selectedColor = 'yellow';

  // ── Load current settings
  const { settings = {} } = await chrome.storage.local.get('settings');
  const { highlights = {} } = await chrome.storage.local.get('highlights');

  providerSelect.value = settings.provider || 'groq';
  apiKeyInput.value = settings.apiKey || '';
  notionTokenInput.value = settings.notionToken || '';
  notionDbInput.value = settings.notionDatabaseId || '';
  selectedColor = settings.defaultColor || 'yellow';

  updateProviderHint();
  updateColorSelection();
  updateDataStats();

  // ── Provider change
  providerSelect.addEventListener('change', updateProviderHint);

  function updateProviderHint() {
    if (providerSelect.value === 'groq') {
      keyHint.innerHTML = 'Get a free Groq key at <a href="https://console.groq.com/keys" target="_blank">console.groq.com/keys</a>';
    } else {
      keyHint.innerHTML = 'Get your OpenAI key at <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com/api-keys</a>';
    }
  }

  // ── Toggle key visibility
  toggleKeyBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    toggleKeyBtn.textContent = isPassword ? '🙈' : '👁️';
  });

  // ── Color selection
  colorButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      selectedColor = btn.dataset.color;
      updateColorSelection();
    });
  });

  function updateColorSelection() {
    colorButtons.forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.color === selectedColor);
    });
  }

  // ── Save settings
  btnSave.addEventListener('click', async () => {
    const newSettings = {
      provider: providerSelect.value,
      apiKey: apiKeyInput.value.trim(),
      notionToken: notionTokenInput.value.trim(),
      notionDatabaseId: notionDbInput.value.trim(),
      defaultColor: selectedColor,
      enabled: settings.enabled !== false,
    };

    await chrome.storage.local.set({ settings: newSettings });

    saveStatus.textContent = '✓ Saved!';
    setTimeout(() => { saveStatus.textContent = ''; }, 2000);
  });

  // ── Data stats
  function updateDataStats() {
    const urlCount = Object.keys(highlights).length;
    const totalCount = Object.values(highlights).reduce((sum, arr) => sum + arr.length, 0);
    dataStats.textContent = `${totalCount} highlights across ${urlCount} pages`;
  }

  // ── Export highlights
  btnExport.addEventListener('click', () => {
    const exportData = {
      exportedAt: new Date().toISOString(),
      highlights,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `textlens-highlights-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // ── Clear all data
  btnClearAll.addEventListener('click', async () => {
    const totalCount = Object.values(highlights).reduce((sum, arr) => sum + arr.length, 0);
    if (!confirm(`This will delete all ${totalCount} highlights. This cannot be undone. Continue?`)) return;

    await chrome.storage.local.set({ highlights: {} });
    updateDataStats();
  });
});

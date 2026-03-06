// ── TextLens · Result Popup Script ────────────────────────────────────────────
// Reads the pending result from chrome.storage.session, shows it, and handles
// copy / close actions.
// ─────────────────────────────────────────────────────────────────────────────

(() => {
  'use strict';

  const actionLabels = {
    explain: '💡 Explanation',
    summarize: '📋 Summary',
    discuss: '💬 Discussion',
    note: '📝 Note',
  };

  const badgeEl = document.getElementById('action-badge');
  const excerptEl = document.getElementById('result-excerpt');
  const loadingEl = document.getElementById('result-loading');
  const contentEl = document.getElementById('result-content');
  const btnCopy = document.getElementById('btn-copy');
  const btnClose = document.getElementById('btn-close');

  let rawContent = '';

  // ── Load pending result ───────────────────────────────────────────────────

  async function loadResult() {
    const { pendingResult } = await chrome.storage.session.get('pendingResult');

    if (!pendingResult) {
      // Result not ready yet — poll
      setTimeout(loadResult, 300);
      return;
    }

    const { action, text, result, error } = pendingResult;

    // Update header
    badgeEl.textContent = actionLabels[action] || action;

    // Update excerpt
    excerptEl.textContent = text
      ? (text.length > 120 ? `"${text.substring(0, 120)}…"` : `"${text}"`)
      : '—';

    // Show result
    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';

    if (error) {
      contentEl.innerHTML = `<div class="result-error">⚠️ ${escapeHtml(error)}</div>`;
      rawContent = error;
    } else if (result) {
      contentEl.innerHTML = formatContent(result);
      rawContent = result;
    } else {
      contentEl.innerHTML = '<div class="result-error">No response received.</div>';
      rawContent = '';
    }

    // Clear the pending result
    await chrome.storage.session.remove('pendingResult');
  }

  // ── Formatting ────────────────────────────────────────────────────────────

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatContent(text) {
    if (!text) return '';
    return escapeHtml(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  btnCopy.addEventListener('click', async () => {
    if (!rawContent) return;
    try {
      await navigator.clipboard.writeText(rawContent);
      showToast('Copied!');
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = rawContent;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast('Copied!');
    }
  });

  btnClose.addEventListener('click', () => window.close());

  function showToast(msg) {
    const existing = document.querySelector('.copied-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'copied-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  loadResult();
})();

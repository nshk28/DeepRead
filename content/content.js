// ── Sensei · Content Script ───────────────────────────────────────────────
// Injected on every page. Handles:
// 1. Text selection tracking (for context menu highlights)
// 2. Highlight application + persistence
// 3. Highlight deletion
// (Inline popup has been removed in favor of consistent context menu)
// ────────────────────────────────────────────────────────────────────────────

(() => {
  'use strict';

  // ═══ STATE & TRACKING ═════════════════════════════════════════════════════

  let lastRange = null;
  let lastSelectionInfo = null;

  // Track the most recent text selection so the background service worker
  // can request applying a highlight when the user clicks the context menu
  document.addEventListener('mouseup', () => {
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();

      if (text && text.length > 1) {
        lastRange = selection.getRangeAt(0).cloneRange();
        lastSelectionInfo = { text };
      }
    }, 10);
  });

  // ═══ MESSAGE LISTENER (From Background) ══════════════════════════════════

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'APPLY_HIGHLIGHT_FROM_MENU') {
      const { color } = msg;

      // Ensure we still have a valid selection and it matches the expected text
      const currentSelection = window.getSelection();
      const currentText = currentSelection?.toString().trim();

      if (lastRange && lastSelectionInfo && (!currentText || currentText === lastSelectionInfo.text)) {
        applyHighlight(color);
      } else {
        console.warn('Sensei: Selection lost, cannot apply highlight');
      }
      sendResponse({ success: true });
    }
  });

  // ═══ HIGHLIGHT ENGINE ══════════════════════════════════════════════════════

  function applyHighlight(color) {
    if (!lastRange || !lastSelectionInfo) return;

    const highlightId = crypto.randomUUID();

    try {
      wrapRangeWithMark(lastRange, color, highlightId);
    } catch (err) {
      console.warn('Sensei: Could not wrap selection, using fallback', err);
      wrapRangeFallback(lastRange, color, highlightId);
    }

    // Save to storage
    const anchorNode = lastRange.startContainer.parentElement;
    const anchorSelector = getSelector(anchorNode);

    chrome.runtime.sendMessage({
      type: 'SAVE_HIGHLIGHT',
      url: window.location.href,
      highlight: {
        text: lastSelectionInfo.text,
        color,
        anchorText: anchorNode?.textContent?.substring(0, 200) || '',
        anchorSelector,
        anchorOffset: lastRange.startOffset,
      }
    });

    window.getSelection()?.removeAllRanges();
    lastRange = null;
    lastSelectionInfo = null;
  }

  /** Wrap a selection range in <mark> elements */
  function wrapRangeWithMark(range, color, highlightId) {
    // Collect all text nodes in the range
    const textNodes = [];
    const walker = document.createTreeWalker(
      range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentElement
        : range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const nodeRange = document.createRange();
          nodeRange.selectNodeContents(node);
          if (range.compareBoundaryPoints(Range.END_TO_START, nodeRange) === -1 &&
              range.compareBoundaryPoints(Range.START_TO_END, nodeRange) === 1) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
        },
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    textNodes.forEach((textNode) => {
      let wrapNode = textNode;

      if (textNode === range.startContainer && range.startOffset > 0) {
        wrapNode = textNode.splitText(range.startOffset);
      }

      if (textNode === range.endContainer || wrapNode === range.endContainer) {
        const endOffset = wrapNode === range.endContainer
          ? range.endOffset
          : range.endOffset - (textNode.length || 0);
        if (endOffset > 0 && endOffset < wrapNode.length) {
          wrapNode.splitText(endOffset);
        }
      }

      const mark = document.createElement('mark');
      mark.setAttribute('data-textlens', highlightId);
      mark.setAttribute('data-color', color);
      wrapNode.parentNode.insertBefore(mark, wrapNode);
      mark.appendChild(wrapNode);

      // Click to remove
      mark.addEventListener('click', (e) => {
        if (e.target.closest('mark[data-textlens]')) {
          handleHighlightClick(e);
        }
      });
    });
  }

  /** Fallback: simpler wrapping for edge cases */
  function wrapRangeFallback(range, color, highlightId) {
    const mark = document.createElement('mark');
    mark.setAttribute('data-textlens', highlightId);
    mark.setAttribute('data-color', color);
    try {
      range.surroundContents(mark);
      mark.addEventListener('click', handleHighlightClick);
    } catch (e) {
      console.error('TextLens: Fallback wrapping also failed', e);
    }
  }

  function handleHighlightClick(e) {
    const mark = e.target.closest('mark[data-textlens]');
    if (!mark) return;

    const id = mark.getAttribute('data-textlens');
    // Find all marks with same id (multi-node highlights)
    const allMarks = document.querySelectorAll(`mark[data-textlens="${id}"]`);
    const text = Array.from(allMarks).map(m => m.textContent).join('');

    if (confirm(`Remove highlight: "${text.substring(0, 50)}${text.length > 50 ? '…' : ''}"?`)) {
      allMarks.forEach(m => {
        const parent = m.parentNode;
        while (m.firstChild) parent.insertBefore(m.firstChild, m);
        m.remove();
        parent.normalize();
      });

      chrome.runtime.sendMessage({
        type: 'REMOVE_HIGHLIGHT',
        url: window.location.href,
        text: text,
      });
    }
  }

  // ═══ RESTORE HIGHLIGHTS ON PAGE LOAD ══════════════════════════════════════

  async function restoreHighlights() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_HIGHLIGHTS',
        url: window.location.href,
      });

      if (!response?.highlights?.length) return;

      response.highlights.forEach(h => {
        restoreSingleHighlight(h);
      });
    } catch (err) {
      // Extension context may be invalidated
    }
  }

  function restoreSingleHighlight(highlight) {
    // Strategy: find the text on the page using TreeWalker
    const body = document.body;
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const searchText = highlight.text.trim();
    if (!searchText) return;

    let node;
    while ((node = walker.nextNode())) {
      const idx = node.textContent.indexOf(searchText);
      if (idx === -1) continue;

      // Don't re-highlight already highlighted text
      if (node.parentElement?.closest('mark[data-textlens]')) continue;

      try {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + searchText.length);

        const highlightId = highlight.id || crypto.randomUUID();
        wrapRangeWithMark(range, highlight.color, highlightId);
        return; // Found and highlighted
      } catch (e) {
        // Continue searching
      }
    }
  }

  // ═══ UTILS ═════════════════════════════════════════════════════════════════

  /** Generate a CSS selector for an element */
  function getSelector(el) {
    if (!el || el === document.body) return 'body';
    if (el.id) return `#${el.id}`;

    const parts = [];
    let current = el;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        parts.unshift(`#${current.id}`);
        break;
      }
      const siblings = current.parentElement
        ? Array.from(current.parentElement.children).filter(c => c.tagName === current.tagName)
        : [];
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${idx})`;
      }
      parts.unshift(selector);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  // ═══ INIT ══════════════════════════════════════════════════════════════════

  function init() {
    // Restore highlights when page loads
    if (document.body) {
      setTimeout(restoreHighlights, 500);
    } else {
      // Body doesn't exist yet — wait for it
      const observer = new MutationObserver(() => {
        if (document.body) {
          observer.disconnect();
          setTimeout(restoreHighlights, 500);
        }
      });
      observer.observe(document.documentElement, { childList: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

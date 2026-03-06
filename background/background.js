// ── DeepRead · Background Service Worker ─────────────────────────────────────
// Handles:
// 1. Highlight storage (save/get/remove)
// 2. AI API calls (Groq / OpenAI)
// 3. Notion API calls (Add Note)
// 4. Context menu for PDFs and restricted pages
// ────────────────────────────────────────────────────────────────────────────

const DEFAULTS = {
  provider: 'groq',
  apiKey: '',
  notionToken: '',
  notionDatabaseId: '',
  defaultColor: 'yellow',
  enabled: true,
};

// ═══ CONTEXT MENU SETUP ═════════════════════════════════════════════════════

chrome.runtime.onInstalled.addListener(() => {
  // Parent menu
  chrome.contextMenus.create({
    id: 'textlens-parent',
    title: '🔍 DeepRead',
    contexts: ['selection'],
  });

  // AI actions
  chrome.contextMenus.create({
    id: 'textlens-explain',
    parentId: 'textlens-parent',
    title: '💡 Explain',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'textlens-summarize',
    parentId: 'textlens-parent',
    title: '📋 Summarize',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'textlens-discuss',
    parentId: 'textlens-parent',
    title: '💬 Discuss',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'textlens-separator-1',
    parentId: 'textlens-parent',
    type: 'separator',
    contexts: ['selection'],
  });

  // Highlight actions
  chrome.contextMenus.create({
    id: 'textlens-highlight-parent',
    parentId: 'textlens-parent',
    title: '🖊️ Highlight',
    contexts: ['selection'],
  });

  const colors = [
    { id: 'yellow', title: '🟡 Yellow' },
    { id: 'green', title: '🟢 Green' },
    { id: 'pink', title: '🩷 Pink' },
    { id: 'blue', title: '🔵 Blue' },
    { id: 'orange', title: '🟠 Orange' },
  ];

  colors.forEach(color => {
    chrome.contextMenus.create({
      id: `textlens-hl-${color.id}`,
      parentId: 'textlens-highlight-parent',
      title: color.title,
      contexts: ['selection'],
    });
  });

  chrome.contextMenus.create({
    id: 'textlens-separator-2',
    parentId: 'textlens-parent',
    type: 'separator',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'textlens-note',
    parentId: 'textlens-parent',
    title: '📝 Add Note to Notion',
    contexts: ['selection'],
  });
});

// ═══ CONTEXT MENU HANDLER ═══════════════════════════════════════════════════

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const text = info.selectionText?.trim();
  if (!text) return;

  const actionMap = {
    'textlens-explain': 'explain',
    'textlens-summarize': 'summarize',
    'textlens-discuss': 'discuss',
    'textlens-note': 'note',
  };

  if (info.menuItemId.startsWith('textlens-hl-')) {
    // Handle highlight action
    const color = info.menuItemId.replace('textlens-hl-', '');
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'APPLY_HIGHLIGHT_FROM_MENU',
        color,
      });
    } catch (err) {
      console.warn('TextLens: Could not send highlight message to tab', err);
    }
    return;
  }

  const action = actionMap[info.menuItemId];
  if (!action) return;

  const pageTitle = tab?.title || 'Unknown Page';
  const pageUrl = tab?.url || '';

  if (action === 'note') {
    // Handle note directly, show result
    const noteResult = await addNoteToNotion(text, pageTitle, pageUrl);
    await chrome.storage.session.set({
      pendingResult: {
        action,
        text,
        result: noteResult.success ? '✅ Note saved to Notion!' : null,
        error: noteResult.error || null,
      },
    });
  } else {
    // Store a "loading" placeholder so the popup can show a spinner
    await chrome.storage.session.set({
      pendingResult: null,
    });

    // Open the result window immediately
    const resultWindow = await chrome.windows.create({
      url: chrome.runtime.getURL('result/result.html'),
      type: 'popup',
      width: 420,
      height: 520,
      focused: true,
    });

    // Now perform the AI call
    const aiResult = await callAI(action, text, pageTitle, pageUrl);

    // Store the result for the popup to read
    await chrome.storage.session.set({
      pendingResult: {
        action,
        text,
        result: aiResult.result || null,
        error: aiResult.error || null,
      },
    });

    return; // early return — we already opened the window
  }

  // Open result window for note result
  await chrome.windows.create({
    url: chrome.runtime.getURL('result/result.html'),
    type: 'popup',
    width: 420,
    height: 340,
    focused: true,
  });
});

// ═══ SETTINGS ══════════════════════════════════════════════════════════════

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULTS, ...settings };
}

// ═══ HIGHLIGHTS STORAGE ═════════════════════════════════════════════════════

async function getHighlights(url) {
  const { highlights = {} } = await chrome.storage.local.get('highlights');
  return highlights[url] || [];
}

async function saveHighlight(url, highlight) {
  const { highlights = {} } = await chrome.storage.local.get('highlights');
  if (!highlights[url]) highlights[url] = [];
  highlights[url].push({
    id: crypto.randomUUID(),
    text: highlight.text,
    color: highlight.color || 'yellow',
    anchorText: highlight.anchorText || '',
    anchorSelector: highlight.anchorSelector || '',
    anchorOffset: highlight.anchorOffset || 0,
    createdAt: new Date().toISOString(),
  });
  await chrome.storage.local.set({ highlights });
  return highlights[url];
}

async function removeHighlight(url, text) {
  const { highlights = {} } = await chrome.storage.local.get('highlights');
  if (highlights[url]) {
    highlights[url] = highlights[url].filter(h => h.text !== text);
    if (highlights[url].length === 0) delete highlights[url];
    await chrome.storage.local.set({ highlights });
  }
}

// ═══ AI API CALLS ═══════════════════════════════════════════════════════════

const SYSTEM_PROMPTS = {
  explain: `You are a helpful reading assistant. The user has selected text from a webpage and wants a clear, concise explanation. Explain the selected text in simple terms. Keep your response brief (2-4 paragraphs max). Use **bold** for key terms.`,
  summarize: `You are a helpful reading assistant. The user has selected text from a webpage. Provide a concise summary capturing the key points. Use bullet points if helpful. Keep it brief.`,
  discuss: `You are a thoughtful reading companion. The user has selected text from a webpage and wants to discuss it. Provide interesting insights, context, or different perspectives on the selected text. Be engaging and thought-provoking. Keep it concise.`,
};

async function callAI(action, text, pageTitle, pageUrl) {
  const settings = await getSettings();

  if (!settings.apiKey) {
    return { error: 'No API key configured. Click the DeepRead icon → Settings to add your API key.' };
  }

  const systemPrompt = SYSTEM_PROMPTS[action] || SYSTEM_PROMPTS.explain;
  const userMessage = `Page: "${pageTitle}"\nURL: ${pageUrl}\n\nSelected text:\n"${text}"`;

  try {
    if (settings.provider === 'groq') {
      return await callGroq(settings.apiKey, systemPrompt, userMessage);
    } else if (settings.provider === 'openai') {
      return await callOpenAI(settings.apiKey, systemPrompt, userMessage);
    } else {
      return { error: `Unknown provider: ${settings.provider}` };
    }
  } catch (err) {
    return { error: err.message || 'API call failed' };
  }
}

async function callGroq(apiKey, systemPrompt, userMessage) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Groq API error (${res.status}): ${errBody.substring(0, 200)}`);
  }

  const data = await res.json();
  return { result: data.choices?.[0]?.message?.content || 'No response' };
}

async function callOpenAI(apiKey, systemPrompt, userMessage) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${errBody.substring(0, 200)}`);
  }

  const data = await res.json();
  return { result: data.choices?.[0]?.message?.content || 'No response' };
}

// ═══ NOTION API ═════════════════════════════════════════════════════════════

async function addNoteToNotion(text, pageTitle, pageUrl) {
  const settings = await getSettings();

  if (!settings.notionToken || !settings.notionDatabaseId) {
    return { error: 'Notion not configured. Click DeepRead icon → Settings to add your Notion token and database ID.' };
  }

  try {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { database_id: settings.notionDatabaseId },
        properties: {
          'Name': {
            title: [{ text: { content: text.substring(0, 100) } }],
          },
          'Source': {
            url: pageUrl,
          },
        },
        children: [
          {
            object: 'block',
            type: 'quote',
            quote: {
              rich_text: [{ type: 'text', text: { content: text } }],
            },
          },
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                { type: 'text', text: { content: `From: ` } },
                {
                  type: 'text',
                  text: { content: pageTitle, link: { url: pageUrl } },
                  annotations: { bold: true },
                },
              ],
            },
          },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Notion API error (${res.status}): ${errBody.substring(0, 200)}`);
    }

    return { success: true };
  } catch (err) {
    return { error: err.message || 'Failed to save to Notion' };
  }
}

// ═══ MESSAGE HANDLER ════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'SAVE_HIGHLIGHT':
        await saveHighlight(msg.url, msg.highlight);
        sendResponse({ success: true });
        break;

      case 'GET_HIGHLIGHTS':
        const highlights = await getHighlights(msg.url);
        sendResponse({ highlights });
        break;

      case 'REMOVE_HIGHLIGHT':
        await removeHighlight(msg.url, msg.text);
        sendResponse({ success: true });
        break;

      case 'AI_ACTION':
        const aiResult = await callAI(msg.action, msg.text, msg.pageTitle, msg.pageUrl);
        sendResponse(aiResult);
        break;

      case 'ADD_NOTE':
        const noteResult = await addNoteToNotion(msg.text, msg.pageTitle, msg.pageUrl);
        sendResponse(noteResult);
        break;

      case 'GET_SETTINGS':
        const settings = await getSettings();
        sendResponse({ settings });
        break;

      case 'SAVE_SETTINGS':
        const { settings: currentSettings } = await chrome.storage.local.get('settings');
        const merged = { ...DEFAULTS, ...currentSettings, ...msg.settings };
        await chrome.storage.local.set({ settings: merged });
        sendResponse({ settings: merged });
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  })();

  return true; // Keep channel open for async response
});

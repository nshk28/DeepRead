# DeepRead 🔍 

> **Your AI-powered reading companion**

DeepRead is a Chrome Extension that helps you understand, summarize, and highlight text on any webpage or PDF. Select text, right-click, and let AI do the work.

## ✨ Features

- 🖊️ **Highlighting:** Highlight text in 5 different colors. Highlights are saved locally and persist even if you refresh or revisit the page.
- 💡 **Explain:** Get a clear, simple explanation for complex jargon or confusing paragraphs.
- 📋 **Summarize:** Quickly get the key points of long text blocks.
- 💬 **Discuss:** Get interesting insights and different perspectives on what you're reading.
- 📝 **Notion Integration:** Save snippets and notes directly to a Notion database with one click.
- 🌐 **Works Everywhere:** Supports normal web pages, CSP-strict sites (like GitHub), Chrome system pages, and even PDFs opened in Chrome!
- 🔑 **Bring Your Own Key (BYOK):** Full control over your AI. Use Groq (blazing fast Llama 3) or OpenAI.

## 🚀 Installation (Load Unpacked)

Since this extension is in active development, you'll need to install it manually using Chrome's Developer Mode.

1. Download or clone this repository to your computer.
2. Open Google Chrome and go to `chrome://extensions/`.
3. Turn on **Developer mode** (toggle switch in the top right corner).
4. Click the **Load unpacked** button (top left).
5. Select the `textlens` / `sensei` / `deepread` folder that contains the `manifest.json` file.
6. Pin the 🔍 "DeepRead" icon to your toolbar for easy access!

## ⚙️ Configuration

Before using the AI features, you need to configure your API keys.

1. Click the DeepRead 🔍 icon in your Chrome toolbar.
2. Click **⚙️ Settings**.
3. **AI Setup:**
   - Choose your provider (Groq is recommended for speed; OpenAI is also supported).
   - Enter your API Key. (You can get a free Groq key at [console.groq.com](https://console.groq.com/keys)).
4. **Notion Setup (Optional):**
   - Create an internal integration at [notion.so/my-integrations](https://www.notion.so/my-integrations) to get your token.
   - Enter your Notion Database ID (found in your database URL).
5. Click **Save Settings**.

## 📖 How to Use

Everything in DeepRead is controlled through the **right-click context menu**.

1. Highlight any text on a webpage or PDF.
2. **Right-click** on the selected text.
3. Hover over **🔍 DeepRead**.
4. Choose an action:
   - **Explain / Summarize / Discuss**: A small result window will open showing the AI's response.
   - **Add Note to Notion**: Quietly saves the text and the page source to your Notion database.
   - **Highlight**: Highlights the text in your chosen color on the page.

To manage your highlights or clear them from a page, click the extension icon in your toolbar.

## 📦 How to Publish to the Chrome Web Store

If you want to share DeepRead with the world officially:

1. **Zip the extension:** Select all the files *inside* this folder (make sure `manifest.json` is at the root) and compress them into a `.zip` file.
2. **Register as a Developer:** Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/) and pay the one-time $5 registration fee.
3. **Upload & Fill Info:** Click **+ New Item**, upload your `.zip` file.
4. Add your store assets (Store icon, screenshots, description).
5. **Privacy Practices:** Ensure you disclose that the extension sends text to remote APIs (Groq/OpenAI/Notion) based on user action, but does not collect data to your own servers.
6. **Submit for Review!**

## 🛠️ Tech Stack
- Vanilla JavaScript (ES6+), HTML, CSS
- Manifest V3
- Chrome Storage API
- Chrome Context Menus API

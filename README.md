# Antigravity Session & Issue Tracker (VS Code Extension)

[Tiếng Việt](README.vn.md) | **English**

[![Visual Studio Code](https://img.shields.io/badge/VS%20Code-Extension-blue.svg)](https://marketplace.visualstudio.com)
[![GitHub Release](https://img.shields.io/github/v/release/mquand/Antigravity-Session-Issue-Tracker?color=brightgreen)](https://github.com/mquand/Antigravity-Session-Issue-Tracker/releases)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows-brightgreen.svg)]()
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

> Intuitive, lightweight, real-time VS Code extension to track, manage, categorize, and switch between **Google Antigravity** sessions directly inside VS Code & Antigravity IDE. Supports both **Issue/Ticket-based workflows (`#xxxx`)** and **Daily Free-form Chat**.

<p align="center">
  <img src="resources/preview.png" alt="Antigravity Session Deck Preview" width="460" />
</p>

---

## 💡 Problems Solved

When using Google Antigravity or Antigravity IDE intensely:
- Running multiple agent tasks concurrently makes it difficult to see which task is **Running**, **Done**, or **Waiting for Approval / Question (`need accept`/`question`)**.
- Conversation history gets buried under many parallel projects.
- Manually searching conversation IDs or terminal sessions wastes developer time.

**Antigravity Session Manager** inspects your local Antigravity runtime database (`conversation_summaries.db`) and transcript logs in `~/.gemini/antigravity/` to build a 1-click visual dashboard directly on your VS Code sidebar and status bar.

---

## ✨ Key Features

### 1. Accurate Real-time Runtime Monitoring
- 🔵 **RUNNING**: Tracks real-time active state via `CASCADE_RUN_STATUS_RUNNING`, `not_fully_idle = 1`, and `presence/<id>.lock`. Only marks as running when Antigravity is genuinely thinking, generating code, or executing tools.
- 🟡 **NEED ACCEPT / QUESTION**: Immediately detects when Antigravity stops to ask for user input (`ask_question`) or awaits file edit / tool execution approval.
- 🟢 **DONE**: Finished sessions with humanized relative timestamps (`just now`, `5 mins ago`...).
- 🔴 **FAILED**: Tracks aborted or errored sessions.

### 2. Full Compatibility with Antigravity & Gemini CLI
- **Blazing Fast**: Directly reads the centralized SQLite database with intelligent `mtimeMs` caching.
- Compatible with all Antigravity runtimes: Antigravity IDE, Google Antigravity VS Code Extension, and the `agy` CLI.

### 3. Dual Workflow Support
- **Free-form Chat**: Automatically extracts the initial query as the conversation title—no clutter or ugly defaults.
- **Issue / Ticket Tracking**: Automatically detects `#<number>` tickets (e.g. `#100`, `#7152`, `#5433`, `#7001`) and attaches prominent **Blue Issue Badges**.

### 4. Dual-Point Quick Notifications
- **Activity Bar (Sidebar)**: Dedicated Antigravity icon with dynamic badge count showing active tasks.
- **Status Bar (Bottom)**: 1-click glanceable summary (`✨ Antigravity: 1 Running` or `✨ Antigravity: Idle`).

### 5. 1-Click Instant Session Jump
Click any session card to immediately trigger `antigravity.openConversation` and open the exact chat session in Antigravity IDE / VS Code.

### 6. Rich Technical Metrics
- 🕒 **Relative Timestamps**: `just now`, `3 mins ago`, `2 hours ago`...
- 🌿 **Git Branch & Repo Detection**: Automatically detects active git branch and subprojects in the workspace.
- ✨ **AI Model Tag**: `Gemini 3.8 Flash`, `Gemini 3.8 Pro`...
- 🗄️ **Tokens In / Out**: Clear token usage metrics (`in: 540K • out: 60K`).
- 💬 **Interaction Turns**: Accurate count of user-assistant exchange turns.
- 🆔 **Short Session ID**: 8-character prefix for quick reference.

### 7. Quick Action Bar: New Conversation & Refresh
- ➕ **New Conversation (+)**: Launch a brand-new Antigravity chat session in 1 click.
- 🔄 **Refresh**: Immediately rescan all sessions.
- ⚙️ **Settings**: 1-click access to extension preferences.

### 8. Safe Session Deletion
- Hover over any card to reveal the **Delete (Trash)** button.
- Cleanly purges records from `conversation_summaries.db`, `brain/<id>` logs, and lock files after confirmation.

### 9. Git Worktrees & Branch Filtering
- Automatically discovers Git worktrees across your workspace.
- Dropdown menu allows 1-click filtering by specific branch / worktree (`⑂ worktree: <branch>`).

### 10. Auto-Updater via GitHub Releases
- Automatically notifies you when a new release is available on GitHub and allows 1-click update.

---

## ⚙️ Configuration (Settings)

Configure via `Settings` (`Cmd + ,` on macOS or `Ctrl + ,` on Windows/Linux) ➔ search for `Antigravity Session Manager`:

| Setting | Default | Description |
| :--- | :--- | :--- |
| `antigravitySessionManager.storagePath` | `~/.gemini/antigravity` | Path to Antigravity sessions directory |
| `antigravitySessionManager.autoRefreshInterval` | `10` | Auto-refresh scan interval in seconds |
| `antigravitySessionManager.language` | `auto` | Interface language (`auto` / `vi` / `en`) |
| `antigravitySessionManager.showInExplorer` | `true` | Show sessions in the Explorer view (File Tree) |
| `antigravitySessionManager.showInSourceControl`| `true` | Show sessions in Source Control view (Git) |
| `antigravitySessionManager.workspaceRoot` | `""` | Root folder path containing your project repositories |
| `antigravitySessionManager.defaultRepo` | `""` | Fallback repository name when project cannot be detected |

---

## 🛠️ Installation

### Option 1: Install from VSIX (Recommended)
1. Download the latest `.vsix` from [GitHub Releases](https://github.com/mquand/Antigravity-Session-Issue-Tracker/releases).
2. In VS Code / Antigravity IDE, press `Cmd + Shift + P` (macOS) or `Ctrl + Shift + P` (Windows/Linux).
3. Type `Extensions: Install from VSIX...` and select the downloaded file.
4. Reload the window (`Developer: Reload Window`).

### Option 2: Install via CLI
```bash
code --install-extension antigravity-session-deck-0.3.0.vsix
```

---

## 💻 Development Guide

```bash
# 1. Clone repository
git clone https://github.com/mquand/Antigravity-Session-Issue-Tracker.git
cd Antigravity-Session-Issue-Tracker

# 2. Install dependencies
npm install

# 3. Compile TypeScript
npm run compile

# 4. Watch mode
npm run watch

# 5. Package VSIX
npx @vscode/vsce package
```

Press `F5` in VS Code to launch the Extension Development Host window for debugging!

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

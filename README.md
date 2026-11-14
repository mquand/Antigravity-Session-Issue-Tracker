# Antigravity Session & Issue Tracker (VS Code Extension)

[Tiếng Việt](README.vn.md) | **English**

[![Visual Studio Code](https://img.shields.io/badge/VS%20Code-Extension-blue.svg)](https://marketplace.visualstudio.com)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows-brightgreen.svg)]()
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

> Intuitive, lightweight, real-time VS Code extension to track, manage, categorize, and switch between **Google Antigravity** sessions. Supports both **Issue/Ticket-based workflows (`#xxxx`)** and **Daily Free-form Chat**.

<p align="center">
  <img src="resources/preview.png" alt="Antigravity Session Deck Preview" width="460" />
</p>

---

## 💡 Problems Solved

When using Google Antigravity or AI agent workflows heavily:
- Running multiple tasks simultaneously makes it difficult to see which task is **Running**, **Done**, or **Waiting for Approval/Input (`need accept`)**.
- Chat history gets buried over time, making it hard to recover context.
- Finding conversation IDs manually is tedious.

**Antigravity Session Manager** inspects your local Antigravity runtime database (`conversation_summaries.db`) and transcript logs in `~/.gemini/antigravity/` to build a 1-click visual dashboard directly on your VS Code sidebar and status bar.

---

## ✨ Key Features

- 🔵 **Real-time Runtime Monitoring**: Tracks `Running`, `Need Accept / Question`, and `Done` states accurately.
- ⚡ **Instant Session Jump**: Click any session card to immediately open that conversation in Antigravity.
- ➕ **Start New Conversation**: 1-click button to start a fresh Antigravity session.
- 📊 **Detailed Metrics**: Model name (`Gemini 3.8 Flash`, `Gemini 3.8 Pro`), Input/Output tokens, turn counts, relative timestamps.
- 🏷️ **Smart Issue Badges**: Automatically detects `#<number>` issue tickets and tags them with clean badges.
- 🌿 **Git Worktrees & Branch Detection**: Detects subprojects, git branches, and worktree environments.
- 🗑️ **Safe Delete**: Cleanly removes session files and database records.

---

## 🛠️ Installation

1. Package or download the `.vsix` file.
2. In VS Code / Antigravity IDE, press `Cmd + Shift + P` (macOS) or `Ctrl + Shift + P` (Windows/Linux).
3. Select `Extensions: Install from VSIX...` and choose the `.vsix` file.

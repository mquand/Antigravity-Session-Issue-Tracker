import * as vscode from 'vscode';
import * as fs from 'fs';
import { IssuesViewProvider } from './issuesViewProvider';
import { ExtensionUpdater } from './updater';
import { SessionScanner } from './scanner';

export function activate(context: vscode.ExtensionContext) {
  const provider = new IssuesViewProvider(context.extensionUri, context);

  // Đăng ký cho tất cả các view container: Activity Bar, Explorer, Source Control
  const viewTypes = [
    IssuesViewProvider.viewType,
    IssuesViewProvider.explorerViewType,
    IssuesViewProvider.scmViewType
  ];

  for (const vt of viewTypes) {
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(vt, provider, {
        webviewOptions: { retainContextWhenHidden: true }
      })
    );
  }

  // Cập nhật context keys khi cài đặt thay đổi
  const updateContexts = () => {
    const config = vscode.workspace.getConfiguration('antigravitySessionManager');
    const showExplorer = config.get<boolean>('showInExplorer', true);
    const showScm = config.get<boolean>('showInSourceControl', true);
    vscode.commands.executeCommand('setContext', 'antigravitySessionManager.showInExplorer', showExplorer);
    vscode.commands.executeCommand('setContext', 'antigravitySessionManager.showInSourceControl', showScm);
  };
  updateContexts();

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravitySessionManager.focusView', () => {
      vscode.commands.executeCommand('antigravitySessionManager.issuesView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravitySessionManager.openTab', (tab: string) => {
      vscode.commands.executeCommand('antigravitySessionManager.issuesView.focus');
      const targetTab = tab === 'active' ? 'today' : tab;
      provider.switchTab(targetTab);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravitySessionManager.newSession', async () => {
      try {
        await vscode.commands.executeCommand('antigravity.startNewConversation');
      } catch {
        try {
          await vscode.commands.executeCommand('antigravity.panel.focus');
        } catch {}
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravitySessionManager.statusMenu', async () => {
      const items = [
        {
          label: '$(add) Cuộc trò chuyện mới',
          description: 'Mở phiên làm việc Antigravity mới',
          action: 'newSession'
        },
        {
          label: '$(calendar) Hôm nay',
          description: 'Xem toàn bộ task phát sinh hôm nay (gồm đang chạy, chờ duyệt và hoàn thành)',
          tab: 'today'
        },
        {
          label: '$(list-unordered) Tất cả các ngày',
          description: 'Xem toàn bộ lịch sử các sessions',
          tab: 'all'
        },
        {
          label: '$(folder-opened) Chọn thư mục lưu trữ Antigravity (~/.gemini/antigravity)...',
          description: 'Duyệt và chọn thư mục lưu trữ thay vì gõ đường dẫn',
          action: 'browseStorage'
        },
        {
          label: '$(root-folder) Chọn thư mục gốc Workspace (Projects Root)...',
          description: 'Duyệt và chọn thư mục chứa các dự án',
          action: 'browseWorkspace'
        },
        {
          label: '$(gear) Cài đặt cấu hình',
          description: 'Mở thiết lập Antigravity Session Manager',
          action: 'settings'
        }
      ];

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Chuyển nhanh tab hoặc thao tác Antigravity'
      });

      if (!selected) return;

      if (selected.action === 'newSession') {
        vscode.commands.executeCommand('antigravitySessionManager.newSession');
      } else if (selected.action === 'settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'antigravitySessionManager');
      } else if (selected.action === 'browseStorage') {
        vscode.commands.executeCommand('antigravitySessionManager.browseStoragePath');
      } else if (selected.action === 'browseWorkspace') {
        vscode.commands.executeCommand('antigravitySessionManager.browseWorkspaceRoot');
      } else if (selected.tab) {
        vscode.commands.executeCommand('antigravitySessionManager.issuesView.focus');
        provider.switchTab(selected.tab);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravitySessionManager.browseStoragePath', async () => {
      const config = vscode.workspace.getConfiguration('antigravitySessionManager');
      const currentPath = config.get<string>('storagePath') || '~/.gemini/antigravity';
      const resolved = SessionScanner.resolveHomePath(currentPath);
      const defaultUri = fs.existsSync(resolved) ? vscode.Uri.file(resolved) : undefined;

      const selected = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Chọn thư mục lưu trữ (Select Storage Folder)',
        title: 'Chọn thư mục chứa lịch sử hội thoại Antigravity (~/.gemini/antigravity)',
        defaultUri
      });

      if (selected && selected[0]) {
        await config.update('storagePath', selected[0].fsPath, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`Đã cập nhật thư mục lưu trữ Antigravity: ${selected[0].fsPath}`);
        provider.setupRealtimeWatchers();
        provider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravitySessionManager.browseWorkspaceRoot', async () => {
      const config = vscode.workspace.getConfiguration('antigravitySessionManager');
      const currentPath = config.get<string>('workspaceRoot');
      const resolved = currentPath ? SessionScanner.resolveHomePath(currentPath) : undefined;
      const defaultUri = (resolved && fs.existsSync(resolved))
        ? vscode.Uri.file(resolved)
        : (vscode.workspace.workspaceFolders?.[0]?.uri);

      const selected = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Chọn thư mục gốc (Select Workspace Root)',
        title: 'Chọn thư mục chứa các repo dự án của bạn',
        defaultUri
      });

      if (selected && selected[0]) {
        await config.update('workspaceRoot', selected[0].fsPath, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`Đã cập nhật thư mục gốc dự án: ${selected[0].fsPath}`);
        provider.setupRealtimeWatchers();
        provider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravitySessionManager.toggleExplorerView', async () => {
      const config = vscode.workspace.getConfiguration('antigravitySessionManager');
      const current = config.get<boolean>('showInExplorer', true);
      const next = !current;
      await config.update('showInExplorer', next, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        next
          ? 'Đã bật hiển thị Antigravity Sessions trong thanh Explorer (File Tree).'
          : 'Đã tắt hiển thị Antigravity Sessions khỏi thanh Explorer.'
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravitySessionManager.toggleSourceControlView', async () => {
      const config = vscode.workspace.getConfiguration('antigravitySessionManager');
      const current = config.get<boolean>('showInSourceControl', true);
      const next = !current;
      await config.update('showInSourceControl', next, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        next
          ? 'Đã bật hiển thị Antigravity Sessions trong thanh Source Control (Git).'
          : 'Đã tắt hiển thị Antigravity Sessions khỏi thanh Source Control.'
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravitySessionManager.refresh', () => {
      provider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravitySessionManager.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'antigravitySessionManager');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravitySessionManager.checkForUpdates', () => {
      ExtensionUpdater.checkForUpdates(context, true);
    })
  );

  // Lắng nghe cấu hình thay đổi để cập nhật tự động
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (
        e.affectsConfiguration('antigravitySessionManager.showInExplorer') ||
        e.affectsConfiguration('antigravitySessionManager.showInSourceControl')
      ) {
        updateContexts();
      }
      if (e.affectsConfiguration('antigravitySessionManager')) {
        provider.refresh();
      }
    })
  );

  // Tự động làm mới khi focus vào cửa sổ
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState(e => {
      if (e.focused) {
        provider.refresh();
      }
    })
  );

  // Tự động kiểm tra bản cập nhật mới trên GitHub sau 3.5 giây
  setTimeout(() => {
    ExtensionUpdater.checkForUpdates(context, false);
  }, 3500);
}

export function deactivate() {}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const fs = require("fs");
const issuesViewProvider_1 = require("./issuesViewProvider");
const updater_1 = require("./updater");
const scanner_1 = require("./scanner");
function activate(context) {
    const provider = new issuesViewProvider_1.IssuesViewProvider(context.extensionUri, context);
    // Đăng ký cho tất cả các view container: Activity Bar, Explorer, Source Control
    const viewTypes = [
        issuesViewProvider_1.IssuesViewProvider.viewType,
        issuesViewProvider_1.IssuesViewProvider.explorerViewType,
        issuesViewProvider_1.IssuesViewProvider.scmViewType
    ];
    for (const vt of viewTypes) {
        context.subscriptions.push(vscode.window.registerWebviewViewProvider(vt, provider, {
            webviewOptions: { retainContextWhenHidden: true }
        }));
    }
    // Cập nhật context keys khi cài đặt thay đổi
    const updateContexts = () => {
        const config = vscode.workspace.getConfiguration('antigravitySessionManager');
        const showExplorer = config.get('showInExplorer', true);
        const showScm = config.get('showInSourceControl', true);
        vscode.commands.executeCommand('setContext', 'antigravitySessionManager.showInExplorer', showExplorer);
        vscode.commands.executeCommand('setContext', 'antigravitySessionManager.showInSourceControl', showScm);
    };
    updateContexts();
    context.subscriptions.push(vscode.commands.registerCommand('antigravitySessionManager.focusView', () => {
        vscode.commands.executeCommand('antigravitySessionManager.issuesView.focus');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('antigravitySessionManager.openTab', (tab) => {
        vscode.commands.executeCommand('antigravitySessionManager.issuesView.focus');
        const targetTab = tab === 'active' ? 'today' : tab;
        provider.switchTab(targetTab);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('antigravitySessionManager.newSession', async () => {
        try {
            await vscode.commands.executeCommand('workbench.view.extension.antigravity-sidebar');
        }
        catch { }
        try {
            await vscode.commands.executeCommand('antigravity.panel.focus');
        }
        catch { }
        try {
            await vscode.commands.executeCommand('antigravity.startNewConversation');
        }
        catch { }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('antigravitySessionManager.statusMenu', async () => {
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
        if (!selected)
            return;
        if (selected.action === 'newSession') {
            vscode.commands.executeCommand('antigravitySessionManager.newSession');
        }
        else if (selected.action === 'settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'antigravitySessionManager');
        }
        else if (selected.action === 'browseStorage') {
            vscode.commands.executeCommand('antigravitySessionManager.browseStoragePath');
        }
        else if (selected.action === 'browseWorkspace') {
            vscode.commands.executeCommand('antigravitySessionManager.browseWorkspaceRoot');
        }
        else if (selected.tab) {
            vscode.commands.executeCommand('antigravitySessionManager.issuesView.focus');
            provider.switchTab(selected.tab);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('antigravitySessionManager.browseStoragePath', async () => {
        const config = vscode.workspace.getConfiguration('antigravitySessionManager');
        const currentPath = config.get('storagePath') || '~/.gemini/antigravity';
        const resolved = scanner_1.SessionScanner.resolveHomePath(currentPath);
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
    }));
    context.subscriptions.push(vscode.commands.registerCommand('antigravitySessionManager.browseWorkspaceRoot', async () => {
        const config = vscode.workspace.getConfiguration('antigravitySessionManager');
        const currentPath = config.get('workspaceRoot');
        const resolved = currentPath ? scanner_1.SessionScanner.resolveHomePath(currentPath) : undefined;
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
    }));
    context.subscriptions.push(vscode.commands.registerCommand('antigravitySessionManager.toggleExplorerView', async () => {
        const config = vscode.workspace.getConfiguration('antigravitySessionManager');
        const current = config.get('showInExplorer', true);
        const next = !current;
        await config.update('showInExplorer', next, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(next
            ? 'Đã bật hiển thị Antigravity Sessions trong thanh Explorer (File Tree).'
            : 'Đã tắt hiển thị Antigravity Sessions khỏi thanh Explorer.');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('antigravitySessionManager.toggleSourceControlView', async () => {
        const config = vscode.workspace.getConfiguration('antigravitySessionManager');
        const current = config.get('showInSourceControl', true);
        const next = !current;
        await config.update('showInSourceControl', next, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(next
            ? 'Đã bật hiển thị Antigravity Sessions trong thanh Source Control (Git).'
            : 'Đã tắt hiển thị Antigravity Sessions khỏi thanh Source Control.');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('antigravitySessionManager.refresh', () => {
        provider.refresh();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('antigravitySessionManager.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'antigravitySessionManager');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('antigravitySessionManager.checkForUpdates', () => {
        updater_1.ExtensionUpdater.checkForUpdates(context, true);
    }));
    // Lắng nghe cấu hình thay đổi để cập nhật tự động
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('antigravitySessionManager.showInExplorer') ||
            e.affectsConfiguration('antigravitySessionManager.showInSourceControl')) {
            updateContexts();
        }
        if (e.affectsConfiguration('antigravitySessionManager')) {
            provider.refresh();
        }
    }));
    // Tự động làm mới khi focus vào cửa sổ
    context.subscriptions.push(vscode.window.onDidChangeWindowState(e => {
        if (e.focused) {
            provider.refresh();
        }
    }));
    // Tự động kiểm tra bản cập nhật mới trên GitHub sau 3.5 giây
    setTimeout(() => {
        updater_1.ExtensionUpdater.checkForUpdates(context, false);
    }, 3500);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map
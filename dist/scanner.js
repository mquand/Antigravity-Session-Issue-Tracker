"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionScanner = void 0;
const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");
const child_process = require("child_process");
class SessionScanner {
    static CACHE_VERSION = 10;
    static sessionCache = new Map();
    static resolveHomePath(p) {
        if (p.startsWith('~/') || p === '~') {
            return path.join(os.homedir(), p.slice(1));
        }
        return p;
    }
    static getDefaultStoragePath() {
        return path.join(os.homedir(), '.gemini', 'antigravity');
    }
    static getWatchedDirectories(customPath) {
        const baseDir = customPath ? this.resolveHomePath(customPath) : this.getDefaultStoragePath();
        const brainDir = path.join(baseDir, 'brain');
        const presenceDir = path.join(baseDir, 'presence');
        return [baseDir, brainDir, presenceDir].filter(d => fs.existsSync(d));
    }
    static deleteSession(sessionId, _filePath) {
        const baseDir = this.getDefaultStoragePath();
        const dbPath = path.join(baseDir, 'conversation_summaries.db');
        try {
            if (fs.existsSync(dbPath)) {
                try {
                    const sql = `DELETE FROM conversation_summaries WHERE conversation_id = '${sessionId}'; DELETE FROM conversation_parents WHERE conversation_id = '${sessionId}';`;
                    child_process.execSync(`sqlite3 "${dbPath}" "${sql}"`, { timeout: 3000, stdio: ['ignore', 'ignore', 'ignore'] });
                }
                catch { }
            }
            const brainDir = path.join(baseDir, 'brain', sessionId);
            if (fs.existsSync(brainDir)) {
                fs.rmSync(brainDir, { recursive: true, force: true });
            }
            const convoDb = path.join(baseDir, 'conversations', `${sessionId}.db`);
            if (fs.existsSync(convoDb)) {
                fs.rmSync(convoDb, { force: true });
            }
            const lockFile = path.join(baseDir, 'presence', `${sessionId}.lock`);
            if (fs.existsSync(lockFile)) {
                fs.rmSync(lockFile, { force: true });
            }
            this.sessionCache.delete(sessionId);
            return true;
        }
        catch (err) {
            console.error('Lỗi khi xoá session Antigravity:', err);
            return false;
        }
    }
    static getActiveSessionsMap() {
        const activeMap = new Map();
        const baseDir = this.getDefaultStoragePath();
        const dbPath = path.join(baseDir, 'conversation_summaries.db');
        if (fs.existsSync(dbPath)) {
            try {
                const stdout = child_process.execSync(`sqlite3 -json "${dbPath}" "SELECT conversation_id, status, not_fully_idle FROM conversation_summaries WHERE not_fully_idle = 1 OR status = 'CASCADE_RUN_STATUS_RUNNING';"`, { timeout: 1500, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
                if (stdout && stdout.trim()) {
                    const rows = JSON.parse(stdout.trim());
                    if (Array.isArray(rows)) {
                        for (const r of rows) {
                            if (r.conversation_id) {
                                activeMap.set(r.conversation_id, { status: 'running', pid: 0 });
                            }
                        }
                    }
                }
            }
            catch { }
        }
        // Kiểm tra nhanh presence: CHỈ xem các file lock được sửa đổi trong 30 giây gần nhất!
        // KHÔNG BAO GIỜ chạy lsof lặp qua hàng chục file lock cũ vì sẽ gây treo cứng Extension Host!
        const presenceDir = path.join(baseDir, 'presence');
        if (fs.existsSync(presenceDir)) {
            try {
                const now = Date.now();
                const files = fs.readdirSync(presenceDir);
                for (const f of files) {
                    if (f.endsWith('.lock')) {
                        const sid = f.replace('.lock', '');
                        if (!activeMap.has(sid)) {
                            try {
                                const stat = fs.statSync(path.join(presenceDir, f));
                                // Nếu file lock vừa được touch trong 30s thì mới là session đang chạy
                                if (now - stat.mtimeMs < 30_000) {
                                    activeMap.set(sid, { status: 'running', pid: 0 });
                                }
                            }
                            catch { }
                        }
                    }
                }
            }
            catch { }
        }
        return activeMap;
    }
    static async scanSessions(customPath, options) {
        const baseDir = customPath ? this.resolveHomePath(customPath) : this.getDefaultStoragePath();
        if (!fs.existsSync(baseDir)) {
            return [];
        }
        const dbPath = path.join(baseDir, 'conversation_summaries.db');
        let summaryRows = [];
        if (fs.existsSync(dbPath)) {
            try {
                const query = `SELECT conversation_id, title, preview, step_count, last_modified_time, workspace_uris, status, not_fully_idle, killed, last_user_input_time, parent_conversation_id, group_id, hex(raw_summary) AS raw_summary_hex FROM conversation_summaries ORDER BY last_modified_time DESC LIMIT 100;`;
                const stdout = child_process.execSync(`sqlite3 -json "${dbPath}" "${query}"`, { timeout: 3000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], maxBuffer: 10 * 1024 * 1024 });
                if (stdout && stdout.trim()) {
                    summaryRows = JSON.parse(stdout.trim());
                }
            }
            catch (err) {
                console.error('Lỗi truy vấn conversation_summaries.db:', err);
            }
        }
        // Dự phòng: Quét thư mục brain nếu SQLite không trả về kết quả
        if (!Array.isArray(summaryRows) || summaryRows.length === 0) {
            const brainDir = path.join(baseDir, 'brain');
            if (fs.existsSync(brainDir)) {
                try {
                    const entries = fs.readdirSync(brainDir, { withFileTypes: true });
                    for (const entry of entries) {
                        if (entry.isDirectory()) {
                            const transPath = path.join(brainDir, entry.name, '.system_generated', 'logs', 'transcript.jsonl');
                            if (fs.existsSync(transPath)) {
                                const stat = fs.statSync(transPath);
                                summaryRows.push({
                                    conversation_id: entry.name,
                                    title: '',
                                    preview: '',
                                    step_count: 0,
                                    last_modified_time: new Date(stat.mtimeMs).toISOString(),
                                    workspace_uris: '',
                                    status: 'CASCADE_RUN_STATUS_IDLE',
                                    not_fully_idle: 0,
                                    killed: 0
                                });
                            }
                        }
                    }
                }
                catch { }
            }
        }
        const activeMap = this.getActiveSessionsMap();
        const sessions = [];
        for (const row of summaryRows) {
            const sessionId = row.conversation_id;
            if (!sessionId)
                continue;
            let title = ((row.title || '').trim() || (row.preview || '').trim() || this.extractTitleFromRawSummary(row.raw_summary_hex) || 'Cuộc trò chuyện mới').trim();
            // Nhận diện Issue ID (#1234, Issue #1234, etc.) — chỉ chấp nhận dấu # để tránh bắt nhầm số thường
            let issueId = undefined;
            const issueMatch = title.match(/#(\d{1,7})\b/);
            if (issueMatch) {
                issueId = `#${issueMatch[1]}`;
            }
            // Xử lý Workspace URI, cwd, repo
            let cwd = undefined;
            let repo = options?.defaultRepo || '';
            let branch = '';
            let isWorktree = false;
            if (row.workspace_uris) {
                try {
                    const uris = JSON.parse(row.workspace_uris);
                    if (Array.isArray(uris) && uris.length > 0 && typeof uris[0] === 'string' && uris[0].startsWith('file://')) {
                        cwd = decodeURIComponent(new URL(uris[0]).pathname);
                        repo = path.basename(cwd);
                    }
                }
                catch { }
            }
            if (cwd && fs.existsSync(cwd)) {
                const gitInfo = this.getGitInfoFromDir(cwd);
                if (gitInfo) {
                    if (gitInfo.branch && gitInfo.branch !== 'HEAD') {
                        branch = gitInfo.branch;
                    }
                    if (gitInfo.isWorktree)
                        isWorktree = true;
                    if (gitInfo.mainRepo)
                        repo = gitInfo.mainRepo;
                }
            }
            const updatedAt = row.last_modified_time ? new Date(row.last_modified_time).getTime() : Date.now();
            const transcriptPath = path.join(baseDir, 'brain', sessionId, '.system_generated', 'logs', 'transcript.jsonl');
            const hasTranscript = fs.existsSync(transcriptPath);
            let mtimeMs = updatedAt;
            if (hasTranscript) {
                try {
                    const stat = fs.statSync(transcriptPath);
                    mtimeMs = stat.mtimeMs;
                }
                catch { }
            }
            const isActive = activeMap.has(sessionId) || row.not_fully_idle === 1 || row.status === 'CASCADE_RUN_STATUS_RUNNING';
            // Kiểm tra cache
            const cached = this.sessionCache.get(sessionId);
            if (cached &&
                cached.cacheVersion === this.CACHE_VERSION &&
                cached.mtimeMs === mtimeMs &&
                cached.session.title === title &&
                !isActive) {
                const s = { ...cached.session };
                s.statusMessage = this.formatRelativeTime(s.updatedAt);
                sessions.push(s);
                continue;
            }
            // Đọc phân tích chi tiết transcript.jsonl
            let inTokens = 0;
            let outTokens = 0;
            let cacheTokens = 0;
            let turnCount = row.step_count || 0;
            let lastUserPrompt = '';
            let lastAssistantResponse = '';
            let modelName = 'Gemini 3.8 Flash';
            let errorDetail = undefined;
            let isNeedAccept = false;
            let isQuestion = false;
            if (hasTranscript) {
                try {
                    const parsed = await this.fastParseTranscript(transcriptPath, cwd);
                    inTokens = parsed.inTokens;
                    outTokens = parsed.outTokens;
                    cacheTokens = parsed.cacheTokens;
                    if (parsed.turnCount > 0)
                        turnCount = parsed.turnCount;
                    if (parsed.lastUserPrompt)
                        lastUserPrompt = parsed.lastUserPrompt;
                    if (parsed.lastAssistantResponse)
                        lastAssistantResponse = parsed.lastAssistantResponse;
                    if (parsed.modelName)
                        modelName = parsed.modelName;
                    if (parsed.detectedSubRepo) {
                        repo = parsed.detectedSubRepo;
                        if (cwd) {
                            const subGit = this.getGitInfoFromDir(path.join(cwd, repo));
                            if (subGit && subGit.branch)
                                branch = subGit.branch;
                        }
                    }
                    if (parsed.isWaitingQuestion)
                        isQuestion = true;
                    if (parsed.isWaitingApproval)
                        isNeedAccept = true;
                }
                catch (err) {
                    console.error('Lỗi parse transcript cho session', sessionId, err);
                }
            }
            // Xác định trạng thái cuối
            let status = 'done';
            if (isActive) {
                if (isQuestion) {
                    status = 'question';
                }
                else if (isNeedAccept) {
                    status = 'need_accept';
                }
                else {
                    status = 'running';
                }
            }
            else if (row.killed === 1) {
                status = 'failed';
            }
            else {
                status = 'done';
            }
            const totalTokens = inTokens + outTokens;
            const inputTokensFormatted = this.formatTokens(inTokens);
            const outputTokensFormatted = this.formatTokens(outTokens);
            const session = {
                id: sessionId,
                shortId: sessionId.slice(0, 8),
                issueId,
                title,
                repo: repo || options?.defaultRepo || 'antigravity',
                branch: branch || 'main',
                isWorktree,
                status,
                statusMessage: this.formatRelativeTime(updatedAt),
                lastUserPrompt,
                lastAssistantResponse,
                updatedAt,
                filePath: transcriptPath,
                errorDetail,
                source: 'VS Code',
                modelName,
                inputTokensFormatted,
                outputTokensFormatted,
                turnCount,
                cwd,
                parentId: row.parent_conversation_id || undefined,
                groupId: row.group_id || undefined,
                rawInputTokens: inTokens,
                rawOutputTokens: outTokens,
                totalTokens
            };
            if (!isActive) {
                this.sessionCache.set(sessionId, {
                    session,
                    mtimeMs,
                    cacheVersion: this.CACHE_VERSION
                });
            }
            sessions.push(session);
        }
        return sessions;
    }
    static async fastParseTranscript(filePath, workspaceCwd) {
        let inTokens = 0;
        let outTokens = 0;
        let cacheTokens = 0;
        let turnCount = 0;
        let lastUserPrompt = '';
        let lastAssistantResponse = '';
        let modelName = 'Gemini 3.8 Flash';
        let detectedSubRepo = undefined;
        let lastStep = null;
        let firstSystemMessage = '';
        const fileStream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 64 * 1024 });
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        for await (const line of rl) {
            if (!line.trim())
                continue;
            try {
                const step = JSON.parse(line);
                lastStep = step;
                if (step.type === 'USER_INPUT') {
                    turnCount++;
                    if (step.content) {
                        let prompt = String(step.content);
                        const userReqMatch = prompt.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
                        if (userReqMatch) {
                            prompt = userReqMatch[1].trim();
                        }
                        // Lọc ra model selection nếu có
                        const modelMatch = step.content.match(/setting `Model Selection` from \S+ to ([^\n]+?)\.(?:\s*No need|$)/i);
                        if (modelMatch) {
                            modelName = modelMatch[1].trim();
                        }
                        lastUserPrompt = prompt.slice(0, 300);
                    }
                }
                else if (step.type === 'SYSTEM_MESSAGE') {
                    if (!firstSystemMessage && step.content) {
                        firstSystemMessage = String(step.content);
                    }
                }
                else if (step.type === 'PLANNER_RESPONSE') {
                    if (typeof step.input_tokens === 'number')
                        inTokens += step.input_tokens;
                    if (typeof step.output_tokens === 'number')
                        outTokens += step.output_tokens;
                    if (typeof step.cache_read_tokens === 'number')
                        cacheTokens += step.cache_read_tokens;
                    if (step.content) {
                        lastAssistantResponse = String(step.content).slice(0, 300);
                    }
                }
                // Nhận diện subrepo trong workspace từ tool calls
                if (!detectedSubRepo && workspaceCwd && step.tool_calls && Array.isArray(step.tool_calls)) {
                    for (const tc of step.tool_calls) {
                        const argsStr = JSON.stringify(tc.args || {});
                        if (argsStr.includes(workspaceCwd)) {
                            const regex = new RegExp(`${workspaceCwd.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}/([^/"'\\\\&\\s;]+)`);
                            const match = argsStr.match(regex);
                            if (match && match[1] !== '.git' && match[1] !== '.agents') {
                                const candidate = match[1].trim();
                                if (fs.existsSync(path.join(workspaceCwd, candidate))) {
                                    detectedSubRepo = candidate;
                                }
                            }
                        }
                    }
                }
            }
            catch { }
        }
        // Sub-agent sessions không có USER_INPUT — prompt thật nằm trong SYSTEM_MESSAGE delegation
        if (!lastUserPrompt && firstSystemMessage) {
            const idx = firstSystemMessage.indexOf('content=');
            if (idx >= 0) {
                let body = firstSystemMessage.slice(idx + 'content='.length).trim();
                const endIdx = body.indexOf('</SYSTEM_MESSAGE>');
                if (endIdx >= 0)
                    body = body.slice(0, endIdx);
                body = body.trim();
                if (body)
                    lastUserPrompt = body.slice(0, 300);
            }
        }
        let isWaitingQuestion = false;
        let isWaitingApproval = false;
        if (lastStep && lastStep.tool_calls && Array.isArray(lastStep.tool_calls)) {
            for (const tc of lastStep.tool_calls) {
                if (tc.name === 'ask_question') {
                    isWaitingQuestion = true;
                    break;
                }
            }
        }
        return {
            inTokens,
            outTokens,
            cacheTokens,
            turnCount,
            lastUserPrompt,
            lastAssistantResponse,
            modelName,
            detectedSubRepo,
            isWaitingQuestion,
            isWaitingApproval
        };
    }
    // Sub-agent sessions (nesting_depth >= 1) có title/preview rỗng trong conversation_summaries.
    // Title thật nằm trong raw_summary (protobuf): message agent-info chứa cặp (agent_name, task title).
    static extractTitleFromRawSummary(rawSummaryHex) {
        if (!rawSummaryHex || typeof rawSummaryHex !== 'string')
            return undefined;
        let buf;
        try {
            buf = Buffer.from(rawSummaryHex, 'hex');
        }
        catch {
            return undefined;
        }
        if (!buf || buf.length === 0)
            return undefined;
        const candidates = [];
        this.collectProtobufStrings(buf, 0, candidates);
        // Ưu tiên 1: cặp (agent_name ngắn, title) trong cùng một sub-message
        const paired = this.findAgentTitlePair(buf);
        if (paired)
            return paired;
        // Ưu tiên 2: chuỗi "giống title" nhất trong toàn blob
        let best;
        let bestScore = 0;
        for (const c of candidates) {
            const score = this.scoreTitleCandidate(c);
            if (score > bestScore) {
                bestScore = score;
                best = c.trim();
            }
        }
        return bestScore >= 4 ? best : undefined;
    }
    static findAgentTitlePair(buf, depth = 0) {
        if (depth > 4 || buf.length < 2)
            return undefined;
        const fields = this.readProtobufFields(buf);
        if (!fields)
            return undefined;
        const strings = [];
        for (const f of fields) {
            if (f.wire === 2 && f.chunk) {
                const text = f.chunk.toString('utf8');
                if (this.isLikelyPlainText(text))
                    strings.push(text);
            }
        }
        if (strings.length >= 2) {
            const agentName = strings[0].trim();
            const maybeTitle = strings[1].trim();
            if (agentName.length >= 2 && agentName.length <= 30 &&
                /^[\p{L}\p{N}_-]+$/u.test(agentName) &&
                this.scoreTitleCandidate(maybeTitle) >= 3) {
                return maybeTitle;
            }
        }
        for (const f of fields) {
            if (f.wire === 2 && f.chunk && f.chunk.length >= 2) {
                const nested = this.findAgentTitlePair(f.chunk, depth + 1);
                if (nested)
                    return nested;
            }
        }
        return undefined;
    }
    static collectProtobufStrings(buf, depth, out) {
        if (depth > 4 || buf.length < 2)
            return;
        const fields = this.readProtobufFields(buf);
        if (!fields)
            return;
        for (const f of fields) {
            if (f.wire === 2 && f.chunk) {
                const text = f.chunk.toString('utf8');
                if (this.isLikelyPlainText(text))
                    out.push(text);
                this.collectProtobufStrings(f.chunk, depth + 1, out);
            }
        }
    }
    static readProtobufFields(buf) {
        const fields = [];
        let i = 0;
        while (i < buf.length) {
            let tag = 0, shift = 0;
            while (i < buf.length) {
                const b = buf[i++];
                tag |= (b & 0x7f) << shift;
                if ((b & 0x80) === 0)
                    break;
                shift += 7;
                if (shift > 28)
                    return null;
            }
            const wire = tag & 7;
            if (wire === 0) {
                while (i < buf.length && (buf[i++] & 0x80) !== 0) { }
            }
            else if (wire === 1) {
                i += 8;
            }
            else if (wire === 5) {
                i += 4;
            }
            else if (wire === 2) {
                let len = 0;
                shift = 0;
                while (i < buf.length) {
                    const b = buf[i++];
                    len |= (b & 0x7f) << shift;
                    if ((b & 0x80) === 0)
                        break;
                    shift += 7;
                    if (shift > 28)
                        return null;
                }
                if (i + len > buf.length)
                    return null;
                if (len > 0) {
                    fields.push({ wire, chunk: buf.subarray(i, i + len) });
                }
                i += len;
            }
            else {
                return null; // wire types 3/4 (groups) không hỗ trợ
            }
            if (i > buf.length)
                return null;
        }
        return fields.length > 0 ? fields : null;
    }
    static isLikelyPlainText(s) {
        if (!s || s.length > 500)
            return false;
        if (/[\u0000-\u001F\u007F-\u009F\uFFFD]/.test(s))
            return false;
        return /[\p{L}]/u.test(s);
    }
    static scoreTitleCandidate(s) {
        const t = s.trim();
        if (t.length < 3 || t.length > 140 || t.includes('\n'))
            return 0;
        if (/[a-z][a-z0-9+.-]*:\/\//i.test(t) || /^[a-zA-Z]:[\\/]/.test(t))
            return 0;
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t))
            return 0;
        if (/^[0-9a-f]{24,}$/i.test(t))
            return 0;
        if (!/[\p{L}]/u.test(t))
            return 0;
        let score = 1;
        if (/\s/.test(t))
            score += 2;
        if (t.length >= 10 && t.length <= 90)
            score += 1;
        if (/\p{Lu}/u.test(t))
            score += 1;
        return score;
    }
    static getGitInfoFromDir(dirPath) {
        try {
            const gitPath = path.join(dirPath, '.git');
            if (!fs.existsSync(gitPath)) {
                return null;
            }
            const stat = fs.statSync(gitPath);
            if (stat.isFile()) {
                // Đây là git worktree
                const content = fs.readFileSync(gitPath, 'utf8').trim();
                const match = content.match(/^gitdir:\s*(.*)$/m);
                if (match) {
                    const gitDir = path.resolve(dirPath, match[1]);
                    const headFile = path.join(gitDir, 'HEAD');
                    if (fs.existsSync(headFile)) {
                        const headContent = fs.readFileSync(headFile, 'utf8').trim();
                        const branchMatch = headContent.match(/^ref: refs\/heads\/(.*)$/);
                        return {
                            branch: branchMatch ? branchMatch[1] : headContent.slice(0, 7),
                            isWorktree: true
                        };
                    }
                }
            }
            else if (stat.isDirectory()) {
                const headFile = path.join(gitPath, 'HEAD');
                if (fs.existsSync(headFile)) {
                    const headContent = fs.readFileSync(headFile, 'utf8').trim();
                    const branchMatch = headContent.match(/^ref: refs\/heads\/(.*)$/);
                    return {
                        branch: branchMatch ? branchMatch[1] : headContent.slice(0, 7),
                        isWorktree: false
                    };
                }
            }
        }
        catch { }
        return null;
    }
    static getWorktreesFromRepo(repoPath) {
        const results = [];
        try {
            const gitPath = path.join(repoPath, '.git');
            if (!fs.existsSync(gitPath))
                return results;
            const output = child_process.execSync('git worktree list --porcelain', {
                cwd: repoPath,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
                timeout: 3000
            });
            let currentPath = '';
            let currentBranch = '';
            let currentHead = '';
            for (const line of output.split('\n')) {
                const trimmed = line.trim();
                if (trimmed.startsWith('worktree ')) {
                    currentPath = trimmed.substring(9).trim();
                }
                else if (trimmed.startsWith('branch refs/heads/')) {
                    currentBranch = trimmed.substring(18).trim();
                }
                else if (trimmed.startsWith('HEAD ')) {
                    currentHead = trimmed.substring(5).trim();
                }
                else if (trimmed === '') {
                    if (currentPath && (currentBranch || currentHead)) {
                        results.push({
                            path: currentPath,
                            branch: currentBranch || currentHead.slice(0, 7),
                            head: currentHead
                        });
                    }
                    currentPath = '';
                    currentBranch = '';
                    currentHead = '';
                }
            }
            if (currentPath && (currentBranch || currentHead)) {
                results.push({
                    path: currentPath,
                    branch: currentBranch || currentHead.slice(0, 7),
                    head: currentHead
                });
            }
        }
        catch { }
        return results;
    }
    static pruneWorktrees(workspaceFolders) {
        let prunedCount = 0;
        if (!workspaceFolders)
            return 0;
        for (const wf of workspaceFolders) {
            try {
                if (fs.existsSync(path.join(wf, '.git'))) {
                    child_process.execSync('git worktree prune', {
                        cwd: wf,
                        stdio: ['ignore', 'ignore', 'ignore'],
                        timeout: 3000
                    });
                    prunedCount++;
                }
            }
            catch { }
        }
        this._worktreesCache = null;
        return prunedCount;
    }
    static _worktreesCache = null;
    static discoverWorkspaceWorktrees(workspaceFolders, force = false) {
        const results = [];
        if (!workspaceFolders || workspaceFolders.length === 0)
            return results;
        const key = workspaceFolders.join(';');
        const now = Date.now();
        if (!force && this._worktreesCache && this._worktreesCache.key === key && (now - this._worktreesCache.timestamp < 15_000)) {
            return this._worktreesCache.data;
        }
        const seenPaths = new Set();
        for (const wf of workspaceFolders) {
            if (!fs.existsSync(wf))
                continue;
            const wfGit = this.getGitInfoFromDir(wf);
            if (wfGit) {
                const repoName = wfGit.mainRepo || path.basename(wf);
                const list = this.getWorktreesFromRepo(wf);
                for (const item of list) {
                    if (!seenPaths.has(item.path) && fs.existsSync(item.path)) {
                        seenPaths.add(item.path);
                        results.push({ path: item.path, branch: item.branch, repo: repoName });
                    }
                }
            }
            try {
                const entries = fs.readdirSync(wf, { withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isDirectory())
                        continue;
                    if (entry.name.startsWith('.') || entry.name === 'node_modules')
                        continue;
                    const subPath = path.join(wf, entry.name);
                    if (seenPaths.has(subPath))
                        continue;
                    const gitInfo = this.getGitInfoFromDir(subPath);
                    if (gitInfo) {
                        const repoName = gitInfo.mainRepo || (gitInfo.isWorktree ? undefined : entry.name);
                        seenPaths.add(subPath);
                        if (gitInfo.branch) {
                            results.push({ path: subPath, branch: gitInfo.branch, repo: repoName || entry.name });
                        }
                        if (!gitInfo.isWorktree) {
                            const list = this.getWorktreesFromRepo(subPath);
                            for (const item of list) {
                                if (!seenPaths.has(item.path) && fs.existsSync(item.path)) {
                                    seenPaths.add(item.path);
                                    results.push({ path: item.path, branch: item.branch, repo: repoName || entry.name });
                                }
                            }
                        }
                    }
                }
            }
            catch { }
        }
        this._worktreesCache = { timestamp: now, key, data: results };
        return results;
    }
    static formatTokens(count) {
        if (!count || count <= 0)
            return '0';
        if (count >= 1000000) {
            return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        }
        if (count >= 1000) {
            return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        }
        return String(count);
    }
    static formatRelativeTime(timestamp) {
        const diff = Math.max(0, Date.now() - timestamp);
        const secs = Math.floor(diff / 1000);
        const mins = Math.floor(secs / 60);
        const hours = Math.floor(mins / 60);
        const days = Math.floor(hours / 24);
        if (secs < 45)
            return 'vừa xong';
        if (mins < 60)
            return `${mins} phút trước`;
        if (hours < 24)
            return `${hours} giờ trước`;
        if (days < 30)
            return `${days} ngày trước`;
        return `${Math.floor(days / 30)} tháng trước`;
    }
}
exports.SessionScanner = SessionScanner;
//# sourceMappingURL=scanner.js.map
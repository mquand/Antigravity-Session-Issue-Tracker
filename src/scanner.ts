import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import * as child_process from 'child_process';
import { AntigravitySession, SessionStatus, ScanOptions } from './types';

export class SessionScanner {
  private static readonly CACHE_VERSION = 11;
  private static sessionCache = new Map<string, { session: AntigravitySession; mtimeMs: number; cacheVersion?: number }>();

  public static resolveHomePath(p: string): string {
    if (p.startsWith('~/') || p === '~') {
      return path.join(os.homedir(), p.slice(1));
    }
    return p;
  }

  public static getDefaultStoragePath(): string {
    return path.join(os.homedir(), '.gemini', 'antigravity');
  }

  public static getWatchedDirectories(customPath?: string): string[] {
    const baseDir = customPath ? this.resolveHomePath(customPath) : this.getDefaultStoragePath();
    const brainDir = path.join(baseDir, 'brain');
    const presenceDir = path.join(baseDir, 'presence');
    const annotationsDir = path.join(baseDir, 'annotations');

    return [baseDir, brainDir, presenceDir, annotationsDir].filter(d => fs.existsSync(d));
  }

  /**
   * Đọc tiêu đề trực tiếp từ annotations/{sessionId}.pbtxt
   * Antigravity lưu title chuẩn ở đây, đọc thuần Node.js không cần phụ thuộc binary bên ngoài.
   */
  public static getTitleFromAnnotations(baseDir: string, sessionId: string): string | undefined {
    try {
      const pbtxtPath = path.join(baseDir, 'annotations', `${sessionId}.pbtxt`);
      if (fs.existsSync(pbtxtPath)) {
        const content = fs.readFileSync(pbtxtPath, 'utf8');
        const match = content.match(/title:\s*"([^"]+)"/);
        if (match && match[1]) {
          const t = match[1].trim();
          if (t) return t;
        }
      }
    } catch {}
    return undefined;
  }

  /**
   * Truy vấn SQLite an toàn: thử dùng sqlite3 CLI trước, nếu máy không có sqlite3 CLI
   * thì fallback qua python (sẵn có trên Windows/macOS/Linux)
   */
  private static querySqlite(dbPath: string, sql: string, timeoutMs = 3000): any[] | null {
    if (!fs.existsSync(dbPath)) return null;

    // Cách 1: Thử sqlite3 CLI
    try {
      const stdout = child_process.execSync(
        `sqlite3 -json "${dbPath}" "${sql}"`,
        { timeout: timeoutMs, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], maxBuffer: 10 * 1024 * 1024 }
      );
      if (stdout && stdout.trim()) {
        return JSON.parse(stdout.trim());
      }
    } catch {}

    // Cách 2: Fallback sang python (nếu có sẵn python trên máy)
    try {
      const pyScript = 'import sys, sqlite3, json; con = sqlite3.connect(sys.argv[1]); con.row_factory = sqlite3.Row; cur = con.cursor(); print(json.dumps([dict(r) for r in cur.execute(sys.argv[2]).fetchall()]))';
      const cmd = process.platform === 'win32'
        ? `cmd.exe /c "python -c \\"${pyScript}\\" \\"${dbPath}\\" \\"${sql.replace(/"/g, '\\"')}\\""`
        : `python3 -c '${pyScript}' "${dbPath}" "${sql}"`;

      const stdout = child_process.execSync(cmd, {
        timeout: timeoutMs,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
        maxBuffer: 10 * 1024 * 1024
      });
      if (stdout && stdout.trim()) {
        return JSON.parse(stdout.trim());
      }
    } catch {}

    return null;
  }

  public static deleteSession(sessionId: string, _filePath?: string): boolean {
    const baseDir = this.getDefaultStoragePath();
    const dbPath = path.join(baseDir, 'conversation_summaries.db');

    try {
      if (fs.existsSync(dbPath)) {
        try {
          const sql = `DELETE FROM conversation_summaries WHERE conversation_id = '${sessionId}'; DELETE FROM conversation_parents WHERE conversation_id = '${sessionId}';`;
          // Thử sqlite3 CLI
          try {
            child_process.execSync(`sqlite3 "${dbPath}" "${sql}"`, { timeout: 3000, stdio: ['ignore', 'ignore', 'ignore'] });
          } catch {
            const pyScript = 'import sys, sqlite3; con = sqlite3.connect(sys.argv[1]); cur = con.cursor(); cur.executescript(sys.argv[2]); con.commit()';
            const cmd = process.platform === 'win32'
              ? `cmd.exe /c "python -c \\"${pyScript}\\" \\"${dbPath}\\" \\"${sql.replace(/"/g, '\\"')}\\""`
              : `python3 -c '${pyScript}' "${dbPath}" "${sql}"`;
            child_process.execSync(cmd, { timeout: 3000, stdio: ['ignore', 'ignore', 'ignore'] });
          }
        } catch {}
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

      const annotationFile = path.join(baseDir, 'annotations', `${sessionId}.pbtxt`);
      if (fs.existsSync(annotationFile)) {
        try { fs.rmSync(annotationFile, { force: true }); } catch {}
      }

      this.sessionCache.delete(sessionId);
      return true;
    } catch (err) {
      console.error('Lỗi khi xoá session Antigravity:', err);
      return false;
    }
  }

  public static getActiveSessionsMap(): Map<string, { status: string; pid: number }> {
    const activeMap = new Map<string, { status: string; pid: number }>();
    const baseDir = this.getDefaultStoragePath();
    const dbPath = path.join(baseDir, 'conversation_summaries.db');

    if (fs.existsSync(dbPath)) {
      try {
        const rows = this.querySqlite(
          dbPath,
          "SELECT conversation_id, status, not_fully_idle FROM conversation_summaries WHERE not_fully_idle = 1 OR status = 'CASCADE_RUN_STATUS_RUNNING';",
          1500
        );
        if (Array.isArray(rows)) {
          for (const r of rows) {
            if (r.conversation_id) {
              activeMap.set(r.conversation_id, { status: 'running', pid: 0 });
            }
          }
        }
      } catch {}
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
              } catch {}
            }
          }
        }
      } catch {}
    }

    return activeMap;
  }

  public static async scanSessions(customPath?: string, options?: ScanOptions): Promise<AntigravitySession[]> {
    const baseDir = customPath ? this.resolveHomePath(customPath) : this.getDefaultStoragePath();
    if (!fs.existsSync(baseDir)) {
      return [];
    }

    const dbPath = path.join(baseDir, 'conversation_summaries.db');
    let summaryRows: any[] = [];

    if (fs.existsSync(dbPath)) {
      try {
        const query = `SELECT conversation_id, title, preview, step_count, last_modified_time, workspace_uris, status, not_fully_idle, killed, last_user_input_time, parent_conversation_id, group_id, hex(raw_summary) AS raw_summary_hex FROM conversation_summaries ORDER BY last_modified_time DESC LIMIT 100;`;
        const rows = this.querySqlite(dbPath, query, 3000);
        if (Array.isArray(rows) && rows.length > 0) {
          summaryRows = rows;
        }
      } catch (err) {
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
                // Thử đọc title từ annotations/{sessionId}.pbtxt
                const annotTitle = this.getTitleFromAnnotations(baseDir, entry.name) || '';
                summaryRows.push({
                  conversation_id: entry.name,
                  title: annotTitle,
                  preview: annotTitle,
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
        } catch {}
      }
    }

    const activeMap = this.getActiveSessionsMap();
    const sessions: AntigravitySession[] = [];

    for (const row of summaryRows) {
      const sessionId = row.conversation_id;
      if (!sessionId) continue;

      // Ưu tiên: 1. row.title -> 2. annotations pbtxt -> 3. row.preview -> 4. raw_summary -> 5. fallback
      const annotTitle = this.getTitleFromAnnotations(baseDir, sessionId);
      let title = (
        (row.title || '').trim() ||
        (annotTitle || '').trim() ||
        (row.preview || '').trim() ||
        this.extractTitleFromRawSummary(row.raw_summary_hex) ||
        ''
      ).trim();

      // Nhận diện Issue ID (#1234, Issue #1234, etc.) — chỉ chấp nhận dấu # để tránh bắt nhầm số thường
      let issueId: string | undefined = undefined;
      const issueMatch = title.match(/#(\d{1,7})\b/);
      if (issueMatch) {
        issueId = `#${issueMatch[1]}`;
      }

      // Xử lý Workspace URI, cwd, repo
      let cwd: string | undefined = undefined;
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
        } catch {}
      }

      if (cwd && fs.existsSync(cwd)) {
        const gitInfo = this.getGitInfoFromDir(cwd);
        if (gitInfo) {
          if (gitInfo.branch && gitInfo.branch !== 'HEAD') {
            branch = gitInfo.branch;
          }
          if (gitInfo.isWorktree) isWorktree = true;
          if (gitInfo.mainRepo) repo = gitInfo.mainRepo;
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
        } catch {}
      }

      const isActive = activeMap.has(sessionId) || row.not_fully_idle === 1 || row.status === 'CASCADE_RUN_STATUS_RUNNING';

      // Kiểm tra cache
      const cached = this.sessionCache.get(sessionId);
      if (
        cached &&
        cached.cacheVersion === this.CACHE_VERSION &&
        cached.mtimeMs === mtimeMs &&
        cached.session.title === title &&
        !isActive
      ) {
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
      let errorDetail: string | undefined = undefined;
      let isNeedAccept = false;
      let isQuestion = false;

      if (hasTranscript) {
        try {
          const parsed = await this.fastParseTranscript(transcriptPath, cwd);
          inTokens = parsed.inTokens;
          outTokens = parsed.outTokens;
          cacheTokens = parsed.cacheTokens;
          if (parsed.turnCount > 0) turnCount = parsed.turnCount;
          if (parsed.lastUserPrompt) lastUserPrompt = parsed.lastUserPrompt;
          if (parsed.lastAssistantResponse) lastAssistantResponse = parsed.lastAssistantResponse;
          if (parsed.modelName) modelName = parsed.modelName;
          if (parsed.detectedSubRepo) {
            repo = parsed.detectedSubRepo;
            if (cwd) {
              const subGit = this.getGitInfoFromDir(path.join(cwd, repo));
              if (subGit && subGit.branch) branch = subGit.branch;
            }
          }
          if (parsed.isWaitingQuestion) isQuestion = true;
          if (parsed.isWaitingApproval) isNeedAccept = true;

          // Nếu title vẫn rỗng hoặc là generic "Cuộc trò chuyện mới", dùng câu hỏi đầu tiên của user
          if (!title || title === 'Cuộc trò chuyện mới' || title === 'New Conversation' || title === 'Untitled') {
            if (parsed.firstUserPrompt) {
              title = parsed.firstUserPrompt.replace(/[\r\n]+/g, ' ').trim();
            }
          }
        } catch (err) {
          console.error('Lỗi parse transcript cho session', sessionId, err);
        }
      }

      // Đảm bảo title luôn có giá trị và chỉ trên 1 dòng
      if (!title) {
        title = 'Cuộc trò chuyện mới';
      }
      title = title.replace(/[\r\n]+/g, ' ').trim();
      if (title.length > 80) {
        title = title.slice(0, 80).trim() + '...';
      }

      // Xác định trạng thái cuối
      let status: SessionStatus = 'done';
      if (isActive) {
        if (isQuestion) {
          status = 'question';
        } else if (isNeedAccept) {
          status = 'need_accept';
        } else {
          status = 'running';
        }
      } else if (row.killed === 1) {
        status = 'failed';
      } else {
        status = 'done';
      }

      const totalTokens = inTokens + outTokens;
      const inputTokensFormatted = this.formatTokens(inTokens);
      const outputTokensFormatted = this.formatTokens(outTokens);

      const session: AntigravitySession = {
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

  private static async fastParseTranscript(
    filePath: string,
    workspaceCwd?: string
  ): Promise<{
    inTokens: number;
    outTokens: number;
    cacheTokens: number;
    turnCount: number;
    lastUserPrompt: string;
    lastAssistantResponse: string;
    modelName: string;
    detectedSubRepo?: string;
    isWaitingQuestion?: boolean;
    isWaitingApproval?: boolean;
    firstUserPrompt?: string;
  }> {
    let inTokens = 0;
    let outTokens = 0;
    let cacheTokens = 0;
    let turnCount = 0;
    let lastUserPrompt = '';
    let firstUserPrompt = '';
    let lastAssistantResponse = '';
    let modelName = 'Gemini 3.8 Flash';
    let detectedSubRepo: string | undefined = undefined;
    let lastStep: any = null;
    let firstSystemMessage = '';

    const fileStream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 64 * 1024 });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
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
            if (!firstUserPrompt && prompt) {
              firstUserPrompt = prompt.slice(0, 150);
            }
          }
        } else if (step.type === 'SYSTEM_MESSAGE') {
          if (!firstSystemMessage && step.content) {
            firstSystemMessage = String(step.content);
          }
        } else if (step.type === 'PLANNER_RESPONSE') {
          if (typeof step.input_tokens === 'number') inTokens += step.input_tokens;
          if (typeof step.output_tokens === 'number') outTokens += step.output_tokens;
          if (typeof step.cache_read_tokens === 'number') cacheTokens += step.cache_read_tokens;
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
      } catch {}
    }

    // Sub-agent sessions không có USER_INPUT — prompt thật nằm trong SYSTEM_MESSAGE delegation
    if (!lastUserPrompt && firstSystemMessage) {
      const idx = firstSystemMessage.indexOf('content=');
      if (idx >= 0) {
        let body = firstSystemMessage.slice(idx + 'content='.length).trim();
        const endIdx = body.indexOf('</SYSTEM_MESSAGE>');
        if (endIdx >= 0) body = body.slice(0, endIdx);
        body = body.trim();
        if (body) {
          lastUserPrompt = body.slice(0, 300);
          if (!firstUserPrompt) firstUserPrompt = body.slice(0, 150);
        }
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
      firstUserPrompt,
      lastAssistantResponse,
      modelName,
      detectedSubRepo,
      isWaitingQuestion,
      isWaitingApproval
    };
  }

  // Sub-agent sessions (nesting_depth >= 1) có title/preview rỗng trong conversation_summaries.
  // Title thật nằm trong raw_summary (protobuf): message agent-info chứa cặp (agent_name, task title).
  private static extractTitleFromRawSummary(rawSummaryHex?: string): string | undefined {
    if (!rawSummaryHex || typeof rawSummaryHex !== 'string') return undefined;
    let buf: Buffer;
    try {
      buf = Buffer.from(rawSummaryHex, 'hex');
    } catch {
      return undefined;
    }
    if (!buf || buf.length === 0) return undefined;

    const candidates: string[] = [];
    this.collectProtobufStrings(buf, 0, candidates);

    // Ưu tiên 1: cặp (agent_name ngắn, title) trong cùng một sub-message
    const paired = this.findAgentTitlePair(buf);
    if (paired) return paired;

    // Ưu tiên 2: chuỗi "giống title" nhất trong toàn blob
    let best: string | undefined;
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

  private static findAgentTitlePair(buf: Buffer, depth = 0): string | undefined {
    if (depth > 4 || buf.length < 2) return undefined;
    const fields = this.readProtobufFields(buf);
    if (!fields) return undefined;

    const strings: string[] = [];
    for (const f of fields) {
      if (f.wire === 2 && f.chunk) {
        const text = f.chunk.toString('utf8');
        if (this.isLikelyPlainText(text)) strings.push(text);
      }
    }
    if (strings.length >= 2) {
      const agentName = strings[0].trim();
      const maybeTitle = strings[1].trim();
      if (
        agentName.length >= 2 && agentName.length <= 30 &&
        /^[\p{L}\p{N}_-]+$/u.test(agentName) &&
        this.scoreTitleCandidate(maybeTitle) >= 3
      ) {
        return maybeTitle;
      }
    }

    for (const f of fields) {
      if (f.wire === 2 && f.chunk && f.chunk.length >= 2) {
        const nested = this.findAgentTitlePair(f.chunk, depth + 1);
        if (nested) return nested;
      }
    }
    return undefined;
  }

  private static collectProtobufStrings(buf: Buffer, depth: number, out: string[]): void {
    if (depth > 4 || buf.length < 2) return;
    const fields = this.readProtobufFields(buf);
    if (!fields) return;
    for (const f of fields) {
      if (f.wire === 2 && f.chunk) {
        const text = f.chunk.toString('utf8');
        if (this.isLikelyPlainText(text)) out.push(text);
        this.collectProtobufStrings(f.chunk, depth + 1, out);
      }
    }
  }

  private static readProtobufFields(buf: Buffer): Array<{ wire: number; chunk?: Buffer }> | null {
    const fields: Array<{ wire: number; chunk?: Buffer }> = [];
    let i = 0;
    while (i < buf.length) {
      let tag = 0, shift = 0;
      while (i < buf.length) {
        const b = buf[i++];
        tag |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
        if (shift > 28) return null;
      }
      const wire = tag & 7;
      if (wire === 0) {
        while (i < buf.length && (buf[i++] & 0x80) !== 0) {}
      } else if (wire === 1) {
        i += 8;
      } else if (wire === 5) {
        i += 4;
      } else if (wire === 2) {
        let len = 0; shift = 0;
        while (i < buf.length) {
          const b = buf[i++];
          len |= (b & 0x7f) << shift;
          if ((b & 0x80) === 0) break;
          shift += 7;
          if (shift > 28) return null;
        }
        if (i + len > buf.length) return null;
        if (len > 0) {
          fields.push({ wire, chunk: buf.subarray(i, i + len) });
        }
        i += len;
      } else {
        return null; // wire types 3/4 (groups) không hỗ trợ
      }
      if (i > buf.length) return null;
    }
    return fields.length > 0 ? fields : null;
  }

  private static isLikelyPlainText(s: string): boolean {
    if (!s || s.length > 500) return false;
    if (/[\u0000-\u001F\u007F-\u009F\uFFFD]/.test(s)) return false;
    return /[\p{L}]/u.test(s);
  }

  private static scoreTitleCandidate(s: string): number {
    const t = s.trim();
    if (t.length < 3 || t.length > 140 || t.includes('\n')) return 0;
    if (/[a-z][a-z0-9+.-]*:\/\//i.test(t) || /^[a-zA-Z]:[\\/]/.test(t)) return 0;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return 0;
    if (/^[0-9a-f]{24,}$/i.test(t)) return 0;
    if (!/[\p{L}]/u.test(t)) return 0;
    let score = 1;
    if (/\s/.test(t)) score += 2;
    if (t.length >= 10 && t.length <= 90) score += 1;
    if (/\p{Lu}/u.test(t)) score += 1;
    return score;
  }

  public static getGitInfoFromDir(dirPath: string): { branch: string; isWorktree: boolean; mainRepo?: string } | null {
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
      } else if (stat.isDirectory()) {
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
    } catch {}

    return null;
  }

  public static getWorktreesFromRepo(repoPath: string): Array<{ path: string; branch: string; head?: string }> {
    const results: Array<{ path: string; branch: string; head?: string }> = [];
    try {
      const gitPath = path.join(repoPath, '.git');
      if (!fs.existsSync(gitPath)) return results;

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
        } else if (trimmed.startsWith('branch refs/heads/')) {
          currentBranch = trimmed.substring(18).trim();
        } else if (trimmed.startsWith('HEAD ')) {
          currentHead = trimmed.substring(5).trim();
        } else if (trimmed === '') {
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
    } catch {}

    return results;
  }

  public static pruneWorktrees(workspaceFolders?: string[]): number {
    let prunedCount = 0;
    if (!workspaceFolders) return 0;
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
      } catch {}
    }
    this._worktreesCache = null;
    return prunedCount;
  }

  private static _worktreesCache: { timestamp: number; key: string; data: Array<{ path: string; branch: string; repo?: string }> } | null = null;

  public static discoverWorkspaceWorktrees(workspaceFolders?: string[], force = false): Array<{ path: string; branch: string; repo?: string }> {
    const results: Array<{ path: string; branch: string; repo?: string }> = [];
    if (!workspaceFolders || workspaceFolders.length === 0) return results;

    const key = workspaceFolders.join(';');
    const now = Date.now();
    if (!force && this._worktreesCache && this._worktreesCache.key === key && (now - this._worktreesCache.timestamp < 15_000)) {
      return this._worktreesCache.data;
    }

    const seenPaths = new Set<string>();

    for (const wf of workspaceFolders) {
      if (!fs.existsSync(wf)) continue;

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
          if (!entry.isDirectory()) continue;
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const subPath = path.join(wf, entry.name);
          if (seenPaths.has(subPath)) continue;

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
      } catch {}
    }

    this._worktreesCache = { timestamp: now, key, data: results };
    return results;
  }

  public static formatTokens(count: number): string {
    if (!count || count <= 0) return '0';
    if (count >= 1000000) {
      return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (count >= 1000) {
      return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return String(count);
  }

  public static formatRelativeTime(timestamp: number): string {
    const diff = Math.max(0, Date.now() - timestamp);
    const secs = Math.floor(diff / 1000);
    const mins = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (secs < 45) return 'vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    if (hours < 24) return `${hours} giờ trước`;
    if (days < 30) return `${days} ngày trước`;
    return `${Math.floor(days / 30)} tháng trước`;
  }
}

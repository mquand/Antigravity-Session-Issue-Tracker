export type SessionStatus = 'need_accept' | 'done' | 'running' | 'failed' | 'question';

export interface AntigravitySession {
  id: string;
  issueId?: string;           // Ví dụ: #101, #204, #7001
  title: string;             // Tiêu đề
  repo: string;              // Ví dụ: "pos-ssr", "pos-api", "workspace"
  branch: string;            // Ví dụ: "main", "feature/login", "master"
  isWorktree?: boolean;      // Đang chạy trên Git Worktree
  status: SessionStatus;
  statusMessage: string;     // Ví dụ: "3 phút trước", "3 ngày trước"
  lastUserPrompt?: string;   // Ví dụ: "> cập nhật giao diện..."
  lastAssistantResponse?: string;
  updatedAt: number;
  filePath?: string;
  errorDetail?: string;

  // Metadata theo UI
  source: 'VS Code' | 'Terminal';
  modelName: string;         // Ví dụ: "Gemini 3.8 Flash", "Gemini 3.8 Pro"
  inputTokensFormatted: string;  // Ví dụ: "1.5M", "63.2K"
  outputTokensFormatted: string; // Ví dụ: "2.4M", "308K"
  costUSD?: string;          // Chi phí ước tính nếu có
  turnCount: number;         // Ví dụ: 1049, 185
  shortId: string;           // 8 ký tự đầu: "5ae34f8e"
  cwd?: string;
  rawInputTokens?: number;
  rawOutputTokens?: number;
  totalTokens?: number;
  subSessions?: AntigravitySession[];
  isNeedReview?: boolean;
}

export interface ScanOptions {
  workspaceFolders?: string[];
  defaultRepo?: string;
  hiddenSessionIds?: Set<string>;
  dbPathHint?: string;
}

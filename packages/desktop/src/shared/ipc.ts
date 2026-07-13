/**
 * @license
 * Copyright 2026 Easy Code team
 * SPDX-License-Identifier: Apache-2.0
 *
 * The single source of truth for the main <-> renderer contract.
 *
 * The renderer never touches Node, ACP, or `deepv-code-core` directly. It only
 * speaks this typed protocol through the `window.easycode` bridge installed by
 * the preload script. Main implements the handlers; the bridge in preload mirrors
 * this surface 1:1.
 */

// ──────────────────────────────────────────────────────────────────────────
// Channel names
// ──────────────────────────────────────────────────────────────────────────

/** Renderer -> main, request/response (ipcRenderer.invoke / ipcMain.handle). */
export const IpcInvoke = {
  // auth
  AuthStatus: 'auth:status',
  AuthLoginApiKey: 'auth:login-apikey',
  AuthLoginBrowser: 'auth:login-browser',
  AuthCancelBrowser: 'auth:login-browser-cancel',
  AuthLogout: 'auth:logout',
  // sessions
  SessionList: 'session:list',
  SessionCreate: 'session:create',
  SessionCreateChat: 'session:create-chat',
  SessionResume: 'session:resume',
  SessionClose: 'session:close',
  SessionPrompt: 'session:prompt',
  SessionCancel: 'session:cancel',
  SessionSetModel: 'session:set-model',
  SessionSetMode: 'session:set-mode',
  SessionRewind: 'session:rewind',
  SessionArchive: 'session:archive',
  SessionRename: 'session:rename',
  SessionSetTitleProvisional: 'session:set-title-provisional',
  // external agents
  AgentsDetect: 'agents:detect',
  // feishu gateway
  FeishuStatus: 'feishu:status',
  FeishuSaveManual: 'feishu:save-manual',
  FeishuQrBegin: 'feishu:qr-begin',
  FeishuQrPoll: 'feishu:qr-poll',
  FeishuQrCancel: 'feishu:qr-cancel',
  FeishuClear: 'feishu:clear',
  FeishuStart: 'feishu:start',
  FeishuStop: 'feishu:stop',
  FeishuDetectExternal: 'feishu:detect-external',
  FeishuKillExternal: 'feishu:kill-external',
  FeishuLobby: 'feishu:lobby',
  // custom models
  ModelsListCustom: 'models:list-custom',
  ModelsSaveCustom: 'models:save-custom',
  ModelsDeleteCustom: 'models:delete-custom',
  // user settings (shared ~/.easycode-user/settings.json)
  SettingsGet: 'settings:get',
  SettingsUpdate: 'settings:update',
  // color theme (renderer preference → native window chrome)
  ThemeSet: 'theme:set',
  // permission reply
  PermissionRespond: 'permission:respond',
  // workspace helpers
  PickFolder: 'workspace:pick-folder',
  PickFiles: 'workspace:pick-files',
  ReadFile: 'workspace:read-file',
  ReadFileBase64: 'workspace:read-file-base64',
  ListDir: 'workspace:list-dir',
  GitDiff: 'workspace:git-diff',
  GitBranch: 'workspace:git-branch',
  OpenExternal: 'workspace:open-external',
  SaveClipboardImage: 'workspace:save-clipboard-image',
  // clipboard
  ReadClipboardImage: 'clipboard:read-image',
  // version update
  UpdateGetState: 'update:get-state',
  UpdateCheck: 'update:check',
  UpdateDownload: 'update:download',
  UpdateCancelDownload: 'update:cancel-download',
  UpdateInstall: 'update:install',
  UpdateSkip: 'update:skip',
  UpdateSnooze: 'update:snooze',
} as const;

/** Main -> renderer, push events (webContents.send / ipcRenderer.on). */
export const IpcEvent = {
  AuthChanged: 'auth:changed',
  SessionEvent: 'session:event',
  SessionStatus: 'session:status',
  PermissionRequest: 'permission:request',
  BackendLog: 'backend:log',
  FeishuChanged: 'feishu:changed',
  /** Main asks the renderer to surface a session (e.g. notification clicked). */
  SessionFocusRequest: 'session:focus-request',
  /** Version-update state changed (check result, download done, error, …). */
  UpdateStatus: 'update:status',
  /** Streamed download progress for an in-flight update download. */
  UpdateProgress: 'update:progress',
} as const;

// ──────────────────────────────────────────────────────────────────────────
// Auth
// ──────────────────────────────────────────────────────────────────────────

export interface DesktopUser {
  userId: string;
  name?: string;
  email?: string;
  avatar?: string;
}

export interface AuthStatus {
  loggedIn: boolean;
  user?: DesktopUser;
  /** Resolved proxy server base URL the desktop and backend talk to. */
  serverUrl: string;
}

export interface ApiKeyLoginResult {
  ok: boolean;
  error?: string;
  status?: AuthStatus;
}

/** Result of kicking off the browser/OAuth flow. */
export interface BrowserLoginResult {
  ok: boolean;
  error?: string;
  /** URL opened in the system browser (also usable inside an in-app window). */
  url?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Sessions
// ──────────────────────────────────────────────────────────────────────────

/**
 * The two permission modes, mapped 1:1 onto the backend's real ApprovalMode
 * values (`default` / `yolo`). The backend has no distinct plan/acceptEdits
 * behaviour, so we don't surface modes it can't honour.
 */
export type PermissionMode =
  | 'default' // ask before each edit/command
  | 'yolo'; // auto-accept everything

export const PERMISSION_MODES: {
  id: PermissionMode;
  label: string;
  hint: string;
}[] = [
  { id: 'default', label: '每次询问', hint: '每次编辑/命令前询问' },
  { id: 'yolo', label: 'YOLO 自动接受', hint: '自动接受所有编辑与命令，不再询问' },
];

export type SessionRunStatus =
  | 'idle' // ready, waiting for input
  | 'starting' // backend process spawning / authenticating
  | 'thinking' // model is producing output
  | 'needs_approval' // a permission request is pending
  | 'error'
  | 'exited'; // backend process gone

export type EnvironmentKind = 'local'; // remote/ssh reserved for the future

/**
 * Which agent backend drives a session.
 *   - `easy-code`   — the bundled `easycode --acp` backend (default).
 *   - `claude-code` — the user's local Claude Code, via the
 *                     `@agentclientprotocol/claude-agent-acp` ACP bridge.
 *   - `codex`       — the user's local Codex CLI, via `@zed-industries/codex-acp`.
 * The external agents speak the same ACP protocol, so the desktop drives them
 * with the identical client — only the spawned command differs.
 */
export type AgentKind = 'easy-code' | 'claude-code' | 'codex';

/**
 * How the desktop shell groups a session in the sidebar. Purely a front-end
 * organizational concept — the agent backend neither knows nor cares about it.
 * - `project`: bound to a real working directory the user picked; grouped under
 *   that project in the sidebar.
 * - `chat`: a directory-less "just chat" session. Its cwd is a throwaway folder
 *   under `~/.easycode-user/chats/<id>`; listed flat in the Chats section.
 */
export type SessionKind = 'project' | 'chat';

/** Which local external agents were detected on PATH (claude / codex). */
export interface ExternalAgentAvailability {
  /** True when `claude` resolves on PATH. */
  claudeCode: boolean;
  /** True when `codex` resolves on PATH. */
  codex: boolean;
}

export interface ModelInfo {
  modelId: string;
  name: string;
}

export interface SessionMeta {
  /** Stable desktop-side id (also the ACP sessionId once created). */
  id: string;
  title: string;
  cwd: string;
  environment: EnvironmentKind;
  status: SessionRunStatus;
  /** Which agent backend drives this session. */
  agentType: AgentKind;
  /**
   * Sidebar grouping bucket (front-end only). `project` = grouped under its
   * working directory; `chat` = directory-less, listed flat in Chats. Older
   * records without this field are backfilled on load (cwd under the chats dir
   * → `chat`, otherwise `project`).
   */
  kind: SessionKind;
  permissionMode: PermissionMode;
  model?: string;
  availableModels: ModelInfo[];
  /** Cumulative token usage from the latest usage_update. */
  tokenUsed?: number;
  tokenSize?: number;
  /** Aggregate diff stat across the session, for the +N -M chip. */
  added: number;
  removed: number;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
}

// ──────────────────────────────────────────────────────────────────────────
// Custom models (stored in ~/.easycode-user/custom-models.json, shared w/ CLI)
// ──────────────────────────────────────────────────────────────────────────

export type CustomModelProvider =
  | 'openai'
  | 'openai-responses'
  | 'anthropic'
  | 'gemini';

/** The user-editable fields of a custom model. */
export interface CustomModelInput {
  /** Display name; also the unique key in the store. */
  displayName: string;
  provider: CustomModelProvider;
  /** API base URL. */
  baseUrl: string;
  /** API key (supports ${ENV_VAR} substitution, resolved by the backend). */
  apiKey: string;
  /** Actual model id sent to the provider. */
  modelId: string;
  /** Optional context-window size. */
  maxTokens?: number;
  enabled?: boolean;
}

/** A stored custom model enriched with its generated id + display label. */
export interface CustomModelEntry extends CustomModelInput {
  /** Generated `custom:...` id — the value passed to `sessions.setModel`. */
  id: string;
  /** "[Provider] displayName" — what the picker shows. */
  label: string;
}

export interface SaveCustomModelResult {
  ok: boolean;
  error?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// User settings (stored in ~/.easycode-user/settings.json, shared w/ CLI)
// ──────────────────────────────────────────────────────────────────────────

/** Project-memory loading mode — mirrors the CLI's `projectMemoryMode`. */
export type ProjectMemoryMode = 'all' | 'deepv-only' | 'none';

/**
 * Desktop GUI color theme. Distinct from the CLI's terminal theme (ANSI palette)
 * below — this is a renderer-only preference persisted in localStorage, not in
 * the shared settings file. 'system' follows the OS color scheme.
 */
export type ThemeMode = 'system' | 'light' | 'dark';

/**
 * The subset of the CLI's user settings the desktop exposes in its Settings
 * dialog. These live in the *same* `~/.easycode-user/settings.json` the CLI's
 * `/config` command reads and writes, so a change here is honoured by the CLI
 * and by every `easycode --acp` backend on its next start.
 *
 * Terminal-only settings (theme, vim mode, external editor) are intentionally
 * omitted; the model and permission mode are handled per-session elsewhere in
 * the desktop UI.
 */
export interface DesktopUserSettings {
  /** Preferred response language, e.g. "English" / "中文". Empty = model default. */
  preferredLanguage?: string;
  /** Healthy-use reminders. Undefined is treated as disabled (the default). */
  healthyUse?: boolean;
  /** How project memory (DEEPV.md / AGENTS.md) is loaded. Undefined = "all". */
  projectMemoryMode?: ProjectMemoryMode;
  /** Minimize to system tray instead of quitting when window is closed. */
  minimizeToTray?: boolean;
}

export interface CreateSessionOptions {
  cwd: string;
  title?: string;
  /** Agent backend to drive the session. Defaults to `easy-code`. */
  agentType?: AgentKind;
  /** Sidebar grouping bucket. Defaults to `project`. */
  kind?: SessionKind;
  permissionMode?: PermissionMode;
  model?: string;
}

export interface PromptOptions {
  sessionId: string;
  /** Plain text (may contain @file references). */
  text: string;
  /** Absolute paths attached via @-references, resolved by the renderer. */
  atPaths?: string[];
  /** base64 image attachments. */
  images?: { mimeType: string; data: string }[];
}

// ──────────────────────────────────────────────────────────────────────────
// Session events (ACP sessionUpdate, normalized for the renderer)
// ──────────────────────────────────────────────────────────────────────────

export type AcpToolKind =
  | 'read'
  | 'edit'
  | 'delete'
  | 'move'
  | 'search'
  | 'execute'
  | 'think'
  | 'fetch'
  | 'switch_mode'
  | 'other';

export type ToolCallStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed';

export interface ToolLocation {
  path: string;
  line?: number;
}

/** A diff carried inside a tool call (write/edit preview). */
export interface ToolDiff {
  path: string;
  oldText?: string | null;
  newText: string;
}

/** Normalized content attached to a tool call / update. */
export interface ToolCallContent {
  text?: string;
  diff?: ToolDiff;
}

export interface PlanEntry {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface SlashCommand {
  name: string;
  description: string;
}

/**
 * The normalized event union pushed to the renderer for a given session.
 * Mirrors the ACP `sessionUpdate` notifications plus desktop lifecycle events.
 */
export type DesktopSessionEvent =
  | { kind: 'turn_start' }
  | { kind: 'turn_end'; stopReason?: string }
  | { kind: 'message_chunk'; text: string }
  | { kind: 'thought_chunk'; text: string }
  | { kind: 'user_chunk'; text: string }
  | { kind: 'mode_marker'; mode: string } // [MODE_UPDATE]/[Model switched...] markers
  | { kind: 'title'; title: string } // [TITLE_UPDATE] — auto-generated session title
  | {
      kind: 'tool_call';
      toolCallId: string;
      title: string;
      toolKind: AcpToolKind;
      status: ToolCallStatus;
      locations?: ToolLocation[];
      content?: ToolCallContent[];
      /** Raw tool arguments, used to build parameter-aware result summaries. */
      rawInput?: Record<string, unknown>;
    }
  | {
      kind: 'tool_update';
      toolCallId: string;
      status?: ToolCallStatus;
      title?: string;
      content?: ToolCallContent[];
      terminalOutput?: string;
    }
  | { kind: 'plan'; entries: PlanEntry[] }
  | { kind: 'usage'; used: number; size: number }
  | { kind: 'commands'; commands: SlashCommand[] }
  | { kind: 'error'; message: string };

export interface SessionEventEnvelope {
  sessionId: string;
  event: DesktopSessionEvent;
}

export interface SessionStatusEnvelope {
  sessionId: string;
  status: SessionRunStatus;
  meta?: Partial<SessionMeta>;
}

// ──────────────────────────────────────────────────────────────────────────
// Permission requests
// ──────────────────────────────────────────────────────────────────────────

export type PermissionOptionKind =
  | 'allow_once'
  | 'allow_always'
  | 'reject_once'
  | 'reject_always';

export interface PermissionOption {
  optionId: string;
  name: string;
  kind: PermissionOptionKind;
}

// ── ask_user_question (multi-choice cards) ─────────────────────────────────
//
// Mirrors the core `AskUserQuestion*` types (packages/core/src/tools/tools.ts).
// Duplicated here (not imported) so the renderer never pulls in `deepv-code-core`.
// Carried out-of-band on a permission request via `_meta.dvcode.askUserQuestion`
// because the base ACP requestPermission contract only models Allow/Reject.

/** One selectable option for an AskUserQuestion question. */
export interface AskQuestionOption {
  label: string;
  description?: string;
  /** Optional markdown preview rendered beside the option (single-select only). */
  preview?: string;
}

/** A single question inside an ask_user_question prompt. */
export interface AskQuestion {
  question: string;
  header: string;
  options: AskQuestionOption[];
  multiSelect?: boolean;
}

/** The collected answers the renderer returns for an ask_user_question prompt. */
export interface AskAnswersPayload {
  /** Keyed by question text → selected label(s) (comma-joined for multi-select). */
  answers?: Record<string, string>;
  annotations?: Record<string, { preview?: string; notes?: string }>;
  /** Free-form feedback (e.g. "chat about this") that overrides answers. */
  feedback?: string;
}

export interface PermissionRequest {
  requestId: string;
  sessionId: string;
  toolCallId: string;
  title: string;
  toolKind: AcpToolKind;
  options: PermissionOption[];
  /** Optional diff/content preview to render in the approval dialog. */
  content?: ToolCallContent[];
  /**
   * Present only for `ask_user_question`: the multi-choice questions to render.
   * When set, the dialog shows the Ask card UI instead of plain Allow/Reject
   * buttons, and replies via {@link PermissionResponse.answers}.
   */
  questions?: AskQuestion[];
}

export type PermissionResponse =
  | {
      outcome: 'selected';
      optionId: string;
      /** ask_user_question only: the collected answers, forwarded to the backend. */
      answers?: AskAnswersPayload;
    }
  | { outcome: 'cancelled' };

// ──────────────────────────────────────────────────────────────────────────
// Feishu / Lark gateway
// ──────────────────────────────────────────────────────────────────────────

export type FeishuDomain = 'feishu' | 'lark';

/** Snapshot of the Feishu gateway, surfaced in the management dialog. */
export interface FeishuStatus {
  /** Whether credentials are configured in the shared store. */
  credsConfigured: boolean;
  botName?: string;
  platform?: FeishuDomain;
  /** Bot owner's open_id (the user authorized to drive the bot). */
  ownerOpenId?: string;
  allowlistCount?: number;
  /** Whether the desktop-managed gateway child is alive. */
  running: boolean;
  pid?: number;
  startedAt?: number;
  lastError?: string;
  /** Tail of the gateway child's output, for diagnostics. */
  logTail?: string;
}

/** Manual credential entry (App ID / App Secret / platform). */
export interface FeishuManualInput {
  appId: string;
  appSecret: string;
  domain: FeishuDomain;
}

/** Device-code registration handle returned by qrBegin. */
export interface FeishuQrBegin {
  deviceCode: string;
  /** URL to render as a QR (and open in a browser) for scan-to-authorize. */
  qrUrl: string;
  userCode: string;
  interval: number;
  expireIn: number;
  domain: FeishuDomain;
}

export interface FeishuResult {
  ok: boolean;
  error?: string;
  status?: FeishuStatus;
  /** How many external (CLI-launched) gateways were shut down on start. */
  killedExternal?: number;
}

export interface FeishuQrBeginResult {
  ok: boolean;
  error?: string;
  begin?: FeishuQrBegin;
}

/** A detected `--feishu` gateway process not managed by this desktop app. */
export interface FeishuExternalProcess {
  pid: number;
  cmd: string;
}

/**
 * One project↔chat binding from the shared `feishu-projects.json` route table,
 * enriched with the resolved chat name / type. Powers the desktop's gateway
 * lobby panel (the GUI counterpart of the CLI's `FeishuStatusDashboard`).
 */
export interface FeishuBinding {
  /** Feishu chat id (`oc_…`). */
  chatId: string;
  /** Resolved group name, when the bot can read it. */
  chatName?: string;
  /** True when this is a 1:1 chat with the bot (chat_mode = 'p2p'). */
  isP2p?: boolean;
  /** Absolute project root this chat is bound to. */
  projectRoot?: string;
  /** Backing agent: 'self' (Easy Code) | 'claude-code' | 'codex'. */
  agent?: string;
  /** Pinned model for this chat, if any. */
  model?: string;
  /** Native session id of the chat's last completed run. */
  lastSessionId?: string;
  /** Date.now() when lastSessionId was saved — drives the activity view. */
  lastSessionAt?: number;
  /**
   * True when this chat is *currently* running an AI session, per the gateway's
   * live state. Mirrors the CLI TUI's green "(Active)" indicator.
   */
  active?: boolean;
}

/** Snapshot of the gateway lobby: every bound project↔chat, newest activity first. */
export interface FeishuLobby {
  bindings: FeishuBinding[];
}

// ──────────────────────────────────────────────────────────────────────────
// Workspace helpers
// ──────────────────────────────────────────────────────────────────────────

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
}

/** A file chosen via the native open dialog. */
export interface PickedFile {
  path: string;
  name: string;
}

/** A file read back as base64 with its detected mime type (for inline images). */
export interface FileBase64 {
  mimeType: string;
  /** base64-encoded bytes, WITHOUT the `data:...;base64,` prefix. */
  data: string;
}

export interface GitFileDiff {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  added: number;
  removed: number;
  /** Unified diff hunks as raw text. */
  patch: string;
}

export interface RewindResult {
  keptUserMessageCount: number;
  droppedContentCount: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Version updates
//
// The desktop checks `…/api/desktop/version` for a newer build, downloads the
// platform installer (DMG on macOS, NSIS .exe on Windows) with progress, and
// then launches it. There is no in-place auto-update (no electron-updater feed):
// macOS mounts the DMG for a manual drag-to-Applications, Windows runs the
// installer and quits so it can replace the files.
// ──────────────────────────────────────────────────────────────────────────

/** The OS key under the version API's `data` object. Linux is unsupported. */
export type UpdatePlatform = 'mac' | 'windows';

/**
 * The update lifecycle, mirrored 1:1 into the renderer's banner UI.
 *  - `idle`        — no update known (or already on the latest version).
 *  - `checking`    — a version check is in flight.
 *  - `available`   — a newer version exists; not yet downloading.
 *  - `downloading` — the installer is downloading (see {@link UpdateState.progress}).
 *  - `downloaded`  — the installer is on disk, ready to launch.
 *  - `installing`  — the installer has been launched (Windows: app about to quit).
 *  - `error`       — the last check/download/launch failed (see `error`).
 */
export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

/** A newer build advertised by the version API for this platform. */
export interface UpdateInfo {
  /** Semver of the available build, e.g. "1.2.3". */
  version: string;
  /** Direct download URL of the platform installer (DMG / EXE). */
  url: string;
  platform: UpdatePlatform;
  /** Optional release notes / changelog, if the API ever provides them. */
  notes?: string;
}

/** Streamed progress while the installer downloads. */
export interface UpdateDownloadProgress {
  receivedBytes: number;
  /** Total size from Content-Length, or 0 when the server didn't send one. */
  totalBytes: number;
  /** 0..100, or -1 when the total size is unknown. */
  percent: number;
  bytesPerSecond: number;
}

/** The full update snapshot the renderer renders from. */
export interface UpdateState {
  phase: UpdatePhase;
  /** The running app's version (`app.getVersion()`). */
  currentVersion: string;
  /** The available update, present once a check finds one. */
  info?: UpdateInfo;
  /** Live download progress (only while `phase === 'downloading'`). */
  progress?: UpdateDownloadProgress;
  /** Absolute path of the downloaded installer (once `phase === 'downloaded'`). */
  downloadedPath?: string;
  /** Last error message (only while `phase === 'error'`). */
  error?: string;
  /** True when the user chose "skip this version" — the banner stays hidden. */
  skipped?: boolean;
  /**
   * True when the user chose "later" this run — the banner is hidden until the
   * next launch even though an update is available. Renderer-only concern.
   */
  snoozed?: boolean;
  /** False on platforms without an installer feed (Linux) — no banner is shown. */
  supported: boolean;
}

export interface UpdateCheckResult {
  /** True when a newer, non-skipped version is available for this platform. */
  updateAvailable: boolean;
  state: UpdateState;
}

// ──────────────────────────────────────────────────────────────────────────
// The bridge surface exposed on window.easycode (preload).
// ──────────────────────────────────────────────────────────────────────────

export interface EasycodeBridge {
  auth: {
    status(): Promise<AuthStatus>;
    loginApiKey(apiKey: string): Promise<ApiKeyLoginResult>;
    loginBrowser(): Promise<BrowserLoginResult>;
    cancelBrowserLogin(): Promise<void>;
    logout(): Promise<void>;
    onChanged(cb: (status: AuthStatus) => void): () => void;
  };
  sessions: {
    list(): Promise<SessionMeta[]>;
    create(opts: CreateSessionOptions): Promise<SessionMeta>;
    /**
     * Start a directory-less "just chat" session. The hub picks a throwaway cwd
     * under `~/.easycode-user/chats/<id>` and tags it `kind: 'chat'`.
     */
    createChat(opts?: Omit<CreateSessionOptions, 'cwd'>): Promise<SessionMeta>;
    resume(sessionId: string, cwd: string): Promise<SessionMeta>;
    close(sessionId: string): Promise<void>;
    archive(sessionId: string, archived: boolean): Promise<void>;
    /** Rename a session's display title. Empty title falls back to the folder name. */
    rename(sessionId: string, title: string): Promise<SessionMeta>;
    /**
     * Set a provisional display title (e.g. derived from the first user message)
     * WITHOUT locking it — a later backend `[TITLE_UPDATE]` may still override.
     * No-ops if the user has already manually renamed (titleLocked).
     */
    setTitleProvisional(sessionId: string, title: string): Promise<SessionMeta>;
    prompt(opts: PromptOptions): Promise<void>;
    cancel(sessionId: string): Promise<void>;
    setModel(sessionId: string, modelId: string): Promise<void>;
    setMode(sessionId: string, mode: PermissionMode): Promise<void>;
    rewind(sessionId: string, beforeUserMessageIndex: number): Promise<RewindResult>;
    onEvent(cb: (env: SessionEventEnvelope) => void): () => void;
    onStatus(cb: (env: SessionStatusEnvelope) => void): () => void;
    /**
     * Main -> renderer: bring a session to the foreground. Fired when the user
     * clicks a turn-complete system notification while the window is in the
     * background. Payload is the session id to focus.
     */
    onFocusRequest(cb: (sessionId: string) => void): () => void;
  };
  models: {
    /** List the user's custom models (shared with the CLI). */
    listCustom(): Promise<CustomModelEntry[]>;
    /**
     * Add or update a custom model. Pass `originalDisplayName` when an edit
     * renamed the model so the old entry is replaced, not orphaned.
     */
    saveCustom(
      model: CustomModelInput,
      originalDisplayName?: string,
    ): Promise<SaveCustomModelResult>;
    deleteCustom(displayName: string): Promise<void>;
  };
  settings: {
    /** Read the shared user settings (the same file the CLI's `/config` edits). */
    get(): Promise<DesktopUserSettings>;
    /**
     * Merge a partial update into the shared settings file, preserving every key
     * the desktop doesn't manage. Pass `preferredLanguage: ''` to clear the
     * language back to the model default. Returns the new state.
     */
    update(patch: DesktopUserSettings): Promise<DesktopUserSettings>;
  };
  theme: {
    /**
     * Mirror the renderer's color-theme choice to the native window chrome by
     * setting `nativeTheme.themeSource`. 'system' restores OS-follow behaviour.
     */
    set(mode: ThemeMode): Promise<void>;
  };
  agents: {
    /** Detect which external agents (Claude Code / Codex) are installed locally. */
    detect(): Promise<ExternalAgentAvailability>;
  };
  feishu: {
    status(): Promise<FeishuStatus>;
    /** Validate + persist manually-entered App ID / App Secret. */
    saveManual(input: FeishuManualInput): Promise<FeishuResult>;
    /** Begin QR device-code registration; render `begin.qrUrl` to scan. */
    qrBegin(domain: FeishuDomain): Promise<FeishuQrBeginResult>;
    /** Poll until the user scans + approves (long-running); saves creds on success. */
    qrPoll(begin: FeishuQrBegin): Promise<FeishuResult>;
    /** Cancel an in-flight qrPoll. */
    qrCancel(): Promise<void>;
    /** Forget stored credentials. */
    clear(): Promise<FeishuStatus>;
    /** Start the desktop-managed gateway (kills any external one first). */
    start(): Promise<FeishuResult>;
    /** Stop the desktop-managed gateway. */
    stop(): Promise<FeishuStatus>;
    /** List `--feishu` gateways running outside this app's control. */
    detectExternal(): Promise<FeishuExternalProcess[]>;
    /** Kill external gateways; returns how many were terminated. */
    killExternal(): Promise<number>;
    /** Read the project↔chat bindings (+ resolved chat names) for the lobby panel. */
    lobby(): Promise<FeishuLobby>;
    onChanged(cb: (status: FeishuStatus) => void): () => void;
  };
  permissions: {
    onRequest(cb: (req: PermissionRequest) => void): () => void;
    respond(requestId: string, response: PermissionResponse): Promise<void>;
  };
  workspace: {
    pickFolder(): Promise<string | undefined>;
    /** Open the native file picker (multi-select); returns chosen files. */
    pickFiles(): Promise<PickedFile[]>;
    readFile(path: string): Promise<string>;
    /** Read a file as base64 + mime (used to inline picked images). */
    readFileBase64(path: string): Promise<FileBase64 | null>;
    listDir(path: string): Promise<DirEntry[]>;
    /** Pass `sessionId` to also refresh that session's +N/-M chip in the sidebar. */
    gitDiff(cwd: string, sessionId?: string): Promise<GitFileDiff[]>;
    /** Current git branch + dirty flag for `cwd`, or null if not a git work tree. */
    gitBranch(cwd: string): Promise<{ branch: string; dirty: boolean } | null>;
    openExternal(url: string): Promise<void>;
    /**
     * Persist an attached/pasted image into `<cwd>/.easycode/clipboard/` with a
     * real extension and return its absolute path. Lets non-multimodal models
     * (and the image_reader tool) reach the image by path. Returns null on failure.
     */
    saveClipboardImage(
      cwd: string,
      mimeType: string,
      data: string,
      name?: string,
    ): Promise<string | null>;
  };
  clipboard: {
    /** Read a bitmap from the OS clipboard as base64 PNG (null when empty). */
    readImage(): Promise<FileBase64 | null>;
  };
  backend: {
    onLog(cb: (line: string) => void): () => void;
  };
  updater: {
    /** Read the current update snapshot (e.g. to render the banner on mount). */
    getState(): Promise<UpdateState>;
    /**
     * Check the version API now. `manual: true` ignores a prior "skip"/"snooze"
     * so the user-initiated check in Settings always reports honestly.
     */
    check(manual?: boolean): Promise<UpdateCheckResult>;
    /** Begin downloading the available installer; resolves with the new state. */
    download(): Promise<UpdateState>;
    /** Abort an in-flight download. */
    cancelDownload(): Promise<void>;
    /**
     * Launch the downloaded installer. macOS mounts the DMG (manual drag);
     * Windows runs the .exe and quits the app so it can replace files.
     */
    install(): Promise<void>;
    /** Permanently dismiss the given version (persisted across launches). */
    skip(version: string): Promise<void>;
    /** Hide the banner until the next app launch (this run only). */
    snooze(): Promise<void>;
    onStatus(cb: (state: UpdateState) => void): () => void;
    onProgress(cb: (p: UpdateDownloadProgress) => void): () => void;
  };
}

declare global {
  interface Window {
    easycode: EasycodeBridge;
  }
}

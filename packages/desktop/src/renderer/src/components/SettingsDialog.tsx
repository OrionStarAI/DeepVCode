import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { useT } from '../i18n/useT';
import type { TranslationKey } from '../i18n/i18n';
import { useStore } from '../store';
import type {
  CustomModelEntry,
  CustomModelInput,
  CustomModelProvider,
  DesktopUserSettings,
  ProjectMemoryMode,
  ThemeMode,
} from '@shared/ipc';

const api = window.easycode;

const PROVIDERS: { id: CustomModelProvider; label: string }[] = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'openai-responses', label: 'OpenAI Responses' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'gemini', label: 'Gemini' },
];

const EMPTY_FORM: CustomModelInput = {
  displayName: '',
  provider: 'openai',
  baseUrl: '',
  apiKey: '',
  modelId: '',
  maxTokens: undefined,
  enabled: true,
};

/** Project-memory modes — mirrors the CLI `/config` "项目记忆" submenu. */
const MEMORY_MODES: Array<{ id: ProjectMemoryMode; labelKey: TranslationKey; hintKey: TranslationKey }> = [
  { id: 'all', labelKey: 'settings.memoryAll', hintKey: 'settings.memoryAllHint' },
  { id: 'deepv-only', labelKey: 'settings.memoryDeepvOnly', hintKey: 'settings.memoryDeepvOnlyHint' },
  { id: 'none', labelKey: 'settings.memoryNone', hintKey: 'settings.memoryNoneHint' },
];

/** GUI color-theme options shown as chips in the 通用 tab. */
const THEME_MODES: Array<{ id: ThemeMode; labelKey: TranslationKey }> = [
  { id: 'system', labelKey: 'settings.themeSystem' },
  { id: 'light', labelKey: 'settings.themeLight' },
  { id: 'dark', labelKey: 'settings.themeDark' },
];

type Tab = 'general' | 'models';

/**
 * Settings dialog. The two tabs both read/write the shared
 * `~/.easycode-user/…` stores the CLI uses, so anything changed here is honoured
 * by the CLI and by every newly created session's `easycode --acp` backend:
 *   - 通用       → `settings.json` (the file the CLI's `/config` edits)
 *   - 自定义模型 → `custom-models.json`
 */
export function SettingsDialog({
  onClose,
  initialTab = 'general',
}: {
  onClose: () => void;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const t = useT();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>
            <Icon name="settings" size={17} />
            {t('settings.title')}
          </h3>
          <div className="sub">
            {t('settings.subtitlePre')}<code>~/.easycode-user/</code>{t('settings.subtitlePost')}
          </div>
          <div className="seg settings-tabs">
            <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>
              {t('settings.tabGeneral')}
            </button>
            <button className={tab === 'models' ? 'active' : ''} onClick={() => setTab('models')}>
              {t('settings.tabModels')}
            </button>
          </div>
        </div>

        {tab === 'general' ? (
          <GeneralTab onClose={onClose} />
        ) : (
          <ModelsTab onClose={onClose} />
        )}
      </div>
    </div>
  );
}

/* ── 通用 ─────────────────────────────────────────────────────────────────
 * Shared user settings stored in `~/.easycode-user/settings.json`. Each control
 * persists immediately (the reply-language input on blur), so the only footer
 * action is "关闭". The display-language switch is a renderer-only preference
 * (the app's own i18n); reply-language / project-memory / healthy-use mirror the
 * CLI settings. Terminal-only CLI settings (theme/vim/editor) are not shown;
 * model and permission mode are configured per-session in the session view.
 */
function GeneralTab({ onClose }: { onClose: () => void }) {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const update = useStore((s) => s.update);
  const checkUpdate = useStore((s) => s.checkUpdate);
  const [checking, setChecking] = useState(false);
  const [settings, setSettings] = useState<DesktopUserSettings | null>(null);
  const [replyLang, setReplyLang] = useState('');
  const [saved, setSaved] = useState(false);

  const runCheck = async () => {
    setChecking(true);
    try {
      await checkUpdate(true);
    } finally {
      setChecking(false);
    }
  };

  // Resolve the line under the "Check for updates" button from the latest state.
  const curVersion = update?.currentVersion ?? __APP_VERSION__;
  const updateStatus = checking
    ? t('update.checking')
    : update?.phase === 'available' && update.info
      ? t('update.newAvailable', { version: update.info.version })
      : update?.phase === 'error'
        ? t('update.checkFailed')
        : t('update.upToDate', { version: curVersion });

  const load = async () => {
    const s = await api.settings.get();
    setSettings(s);
    setReplyLang(s.preferredLanguage ?? '');
  };

  useEffect(() => {
    void load();
  }, []);

  const patch = async (p: DesktopUserSettings) => {
    const next = await api.settings.update(p);
    setSettings(next);
    setReplyLang(next.preferredLanguage ?? '');
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };

  const commitLanguage = () => {
    if (replyLang.trim() === (settings?.preferredLanguage ?? '')) return;
    void patch({ preferredLanguage: replyLang });
  };

  const healthyEnabled = settings?.healthyUse === true; // undefined = off (default)
  const memoryMode: ProjectMemoryMode = settings?.projectMemoryMode ?? 'all';
  const memoryHint = MEMORY_MODES.find((m) => m.id === memoryMode)?.hintKey;

  return (
    <>
      <div className="modal-body">
        <div className="setting-item">
          <label className="field-label">{t('settings.language')}</label>
          <div className="prompt-config">
            {(['zh', 'en'] as const).map((l) => (
              <span
                key={l}
                className={`chip interactive ${lang === l ? 'accent' : ''}`}
                onClick={() => setLang(l)}
              >
                {lang === l && <Icon name="check" size={13} />}
                {l === 'zh' ? t('settings.langZh') : t('settings.langEn')}
              </span>
            ))}
          </div>
        </div>

        <div className="setting-item">
          <label className="field-label">{t('settings.theme')}</label>
          <div className="prompt-config">
            {THEME_MODES.map((m) => (
              <span
                key={m.id}
                className={`chip interactive ${theme === m.id ? 'accent' : ''}`}
                onClick={() => setTheme(m.id)}
              >
                {theme === m.id && <Icon name="check" size={13} />}
                {t(m.labelKey)}
              </span>
            ))}
          </div>
          <div className="setting-desc">{t('settings.themeDesc')}</div>
        </div>

        <div className="setting-item">
          <label className="field-label">{t('settings.replyLanguage')}</label>
          <input
            className="prompt-input cm-input"
            placeholder={t('settings.replyLanguagePlaceholder')}
            value={replyLang}
            onChange={(e) => setReplyLang(e.target.value)}
            onBlur={commitLanguage}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
          <div className="setting-desc">{t('settings.replyLanguageDesc')}</div>
        </div>

        <div className="setting-item">
          <label className="field-label">{t('settings.projectMemory')}</label>
          <div className="prompt-config">
            {MEMORY_MODES.map((m) => (
              <span
                key={m.id}
                className={`chip interactive ${memoryMode === m.id ? 'accent' : ''}`}
                title={t(m.hintKey)}
                onClick={() => void patch({ projectMemoryMode: m.id })}
              >
                {memoryMode === m.id && <Icon name="check" size={13} />}
                {t(m.labelKey)}
              </span>
            ))}
          </div>
          <div className="setting-desc">
            {t('settings.projectMemoryDesc', { hint: memoryHint ? t(memoryHint) : '' })}
          </div>
        </div>

        <div className="setting-item">
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={healthyEnabled}
              onChange={(e) => void patch({ healthyUse: e.target.checked })}
            />
            {t('settings.healthyUse')}
          </label>
          <div className="setting-desc">{t('settings.healthyUseDesc')}</div>
        </div>

        <div className="setting-item">
          <label className="field-label">Background</label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings?.minimizeToTray === true}
              onChange={(e) => void patch({ minimizeToTray: e.target.checked })}
            />
            Keep running in background (minimize to tray on close)
          </label>
          <div className="setting-desc">When enabled, closing the window minimizes Easy Code to the system tray. AI tasks continue running in the background. Click the tray icon to restore.</div>
        </div>

        <div className="setting-item">
          <label className="field-label">{t('update.section')}</label>
          <div className="update-check-row">
            <button className="btn" disabled={checking} onClick={() => void runCheck()}>
              {checking ? <span className="spinner" /> : <Icon name="refresh" size={14} />}
              {t('update.checkNow')}
            </button>
            <span className="setting-desc">{updateStatus}</span>
          </div>
        </div>
      </div>

      <div className="modal-foot">
        {saved && (
          <span className="saved-flag">
            <Icon name="check" size={13} />
            {t('settings.saved')}
          </span>
        )}
        <button className="btn" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </>
  );
}

/* ── 自定义模型 ─────────────────────────────────────────────────────────────
 * Reads/writes the shared `~/.easycode-user/custom-models.json` (the same store
 * the CLI uses), so models added here are picked up by every newly created
 * session's ACP backend.
 */
function ModelsTab({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [models, setModels] = useState<CustomModelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<CustomModelInput | null>(null);
  /** displayName of the model being edited (undefined when adding). */
  const [editingName, setEditingName] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    const list = await api.models.listCustom();
    setModels(list);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const startAdd = () => {
    setError('');
    setEditingName(undefined);
    setForm({ ...EMPTY_FORM });
  };

  const startEdit = (m: CustomModelEntry) => {
    setError('');
    setEditingName(m.displayName);
    setForm({
      displayName: m.displayName,
      provider: m.provider,
      baseUrl: m.baseUrl,
      apiKey: m.apiKey,
      modelId: m.modelId,
      maxTokens: m.maxTokens,
      enabled: m.enabled !== false,
    });
  };

  const remove = async (m: CustomModelEntry) => {
    await api.models.deleteCustom(m.displayName);
    await refresh();
  };

  const save = async () => {
    if (!form) return;
    if (!form.displayName.trim()) return setError(t('settings.errName'));
    if (!form.baseUrl.trim()) return setError(t('settings.errBaseUrl'));
    if (!form.apiKey.trim()) return setError(t('settings.errApiKey'));
    if (!form.modelId.trim()) return setError(t('settings.errModelId'));
    setBusy(true);
    setError('');
    const res = await api.models.saveCustom(form, editingName);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? t('settings.saveFailed'));
      return;
    }
    setForm(null);
    setEditingName(undefined);
    await refresh();
  };

  const patch = (p: Partial<CustomModelInput>) =>
    setForm((f) => (f ? { ...f, ...p } : f));

  return (
    <>
      <div className="modal-body">
        {error && (
          <div className="login-err">
            <Icon name="alert" size={15} />
            {error}
          </div>
        )}

        {!form && (
          <>
            <div className="cm-list">
              {loading && (
                <div className="cm-empty">
                  <span className="spinner" /> {t('common.loading')}
                </div>
              )}
              {!loading && models.length === 0 && (
                <div className="cm-empty">{t('settings.noModels')}</div>
              )}
              {models.map((m) => (
                <div className="cm-row" key={m.id}>
                  <div className="cm-row-main">
                    <span className="cm-name">{m.displayName}</span>
                    <span className="cm-badge">
                      {PROVIDERS.find((p) => p.id === m.provider)?.label ?? m.provider}
                    </span>
                    {m.enabled === false && <span className="cm-badge muted">{t('settings.disabled')}</span>}
                  </div>
                  <div className="cm-row-sub">
                    {m.modelId} · {m.baseUrl}
                  </div>
                  <div className="cm-actions">
                    <button className="icon-btn" title={t('common.edit')} onClick={() => startEdit(m)}>
                      <Icon name="edit" size={14} />
                    </button>
                    <button className="icon-btn" title={t('common.delete')} onClick={() => void remove(m)}>
                      <Icon name="delete" size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn" onClick={startAdd}>
              <Icon name="plus" size={14} />
              {t('settings.addModel')}
            </button>
          </>
        )}

        {form && (
          <div className="cm-form">
            <label className="field-label">{t('settings.name')}</label>
            <input
              className="prompt-input cm-input"
              placeholder={t('settings.namePlaceholder')}
              value={form.displayName}
              onChange={(e) => patch({ displayName: e.target.value })}
            />

            <label className="field-label">{t('settings.provider')}</label>
            <div className="prompt-config">
              {PROVIDERS.map((p) => (
                <span
                  key={p.id}
                  className={`chip interactive ${form.provider === p.id ? 'accent' : ''}`}
                  onClick={() => patch({ provider: p.id })}
                >
                  {form.provider === p.id && <Icon name="check" size={13} />}
                  {p.label}
                </span>
              ))}
            </div>

            <label className="field-label">Base URL</label>
            <input
              className="prompt-input cm-input"
              placeholder="https://api.openai.com/v1"
              value={form.baseUrl}
              onChange={(e) => patch({ baseUrl: e.target.value })}
            />

            <label className="field-label">API Key</label>
            <input
              className="prompt-input cm-input"
              type="password"
              placeholder={t('settings.apiKeyPlaceholder')}
              value={form.apiKey}
              onChange={(e) => patch({ apiKey: e.target.value })}
            />

            <label className="field-label">{t('settings.modelId')}</label>
            <input
              className="prompt-input cm-input"
              placeholder="gpt-4o / claude-3-5-sonnet / …"
              value={form.modelId}
              onChange={(e) => patch({ modelId: e.target.value })}
            />

            <label className="field-label">{t('settings.contextWindow')}</label>
            <input
              className="prompt-input cm-input"
              type="number"
              placeholder={t('settings.contextWindowPlaceholder')}
              value={form.maxTokens ?? ''}
              onChange={(e) =>
                patch({
                  maxTokens: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />

            <label className="cm-check">
              <input
                type="checkbox"
                checked={form.enabled !== false}
                onChange={(e) => patch({ enabled: e.target.checked })}
              />
              {t('settings.enableModel')}
            </label>
          </div>
        )}
      </div>

      <div className="modal-foot">
        {form ? (
          <>
            <button className="btn" onClick={() => setForm(null)}>
              {t('common.back')}
            </button>
            <button className="btn primary" disabled={busy} onClick={save}>
              {busy ? <span className="spinner" /> : <Icon name="check" size={14} />}
              {t('common.save')}
            </button>
          </>
        ) : (
          <button className="btn" onClick={onClose}>
            {t('common.close')}
          </button>
        )}
      </div>
    </>
  );
}

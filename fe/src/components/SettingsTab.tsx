import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, LoaderCircle, RefreshCw, ShieldCheck, ShieldX, Sparkles, Unplug } from 'lucide-react';
import VietnameseTtsTool from './VietnameseTtsTool';

type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  authProvider?: string;
};

type SettingsTabProps = {
  currentUser: AuthenticatedUser | null;
  onSessionRefresh?: () => Promise<void> | void;
  refreshNonce?: number;
  globalLang: 'en' | 'vi';
  globalTheme: 'dark' | 'light';
  onLogout?: () => Promise<void> | void;
};

type ParentSettingsPayload = {
  profile?: {
    displayName?: string | null;
    email?: string | null;
    authProvider?: string | null;
  };
  aiSettings?: {
    apiKeyMasked?: string;
    hasApiKey?: boolean;
    modelName?: string;
    baseUrl?: string;
    usageCount?: number;
    usageLimit?: number | null;
  };
};

type ValidationResult = {
  connected: boolean;
  provider: string;
  modelName: string;
  endpoint: string;
  latencyMs?: number;
  sampleReply?: string;
  errorType?: string;
  message?: string;
};

const DEFAULT_MODEL = 'gemini-2.5-flash';

function inferProviderLabel(baseUrl: string, modelName: string) {
  const normalizedUrl = (baseUrl || '').trim().toLowerCase();
  const normalizedModel = (modelName || '').trim().toLowerCase();

  if (
    normalizedUrl.includes('googleapis')
    || normalizedUrl.includes(':generatecontent')
    || normalizedModel.startsWith('gemini')
  ) {
    return 'Gemini-compatible';
  }
  if (normalizedUrl.includes('anthropic') || normalizedUrl.includes('/messages') || normalizedModel.startsWith('claude')) {
    return 'Claude-compatible';
  }
  if (normalizedUrl.includes('dashscope') || normalizedModel.startsWith('qwen')) {
    return 'Qwen-compatible';
  }
  return 'OpenAI-compatible';
}

function inferDefaultEndpoint(baseUrl: string, modelName: string) {
  const trimmedBaseUrl = (baseUrl || '').trim();
  if (trimmedBaseUrl) {
    return trimmedBaseUrl;
  }

  const providerLabel = inferProviderLabel(baseUrl, modelName);
  if (providerLabel === 'Gemini-compatible') {
    return 'https://generativelanguage.googleapis.com/v1beta';
  }
  if (providerLabel === 'Claude-compatible') {
    return 'https://api.anthropic.com';
  }
  if (providerLabel === 'Qwen-compatible') {
    return 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
  }
  return 'https://api.openai.com/v1';
}

function formatValidationMessage(result: ValidationResult | null, isEnglish: boolean) {
  if (!result) {
    return isEnglish
      ? 'Run a real connection test to confirm the API key, model, and URL all work together.'
      : 'Hãy chạy kiểm tra kết nối thật để xác nhận API key, model và URL hoạt động đúng cùng nhau.';
  }

  if (result.connected) {
    return isEnglish
      ? 'The provider accepted the configuration and returned a real response. This setup is ready for your child.'
      : 'Nhà cung cấp đã chấp nhận cấu hình và trả về phản hồi thật. Cấu hình này đã sẵn sàng cho bé dùng.';
  }

  if (result.errorType === 'invalid_api_key') {
    return isEnglish
      ? 'The API key was rejected. Please check that the key is correct and belongs to this provider.'
      : 'API key đã bị từ chối. Hãy kiểm tra lại khóa và chắc chắn nó thuộc đúng nhà cung cấp này.';
  }
  if (result.errorType === 'invalid_model') {
    return isEnglish
      ? 'The provider could not find this model. Please check the model name exactly.'
      : 'Nhà cung cấp không tìm thấy model này. Hãy kiểm tra lại tên model thật chính xác.';
  }
  if (result.errorType === 'invalid_url') {
    return isEnglish
      ? 'The endpoint looks wrong or unsupported. Please verify the base URL / endpoint.'
      : 'Endpoint có vẻ sai hoặc không được hỗ trợ. Hãy kiểm tra lại Base URL / endpoint.';
  }
  if (result.errorType === 'network_error') {
    return isEnglish
      ? 'The test could not reach the provider. Please check the endpoint and network access.'
      : 'Bài test không thể kết nối tới nhà cung cấp. Hãy kiểm tra endpoint và kết nối mạng.';
  }

  return result.message || (isEnglish ? 'Connection test failed.' : 'Kiểm tra kết nối thất bại.');
}

export default function SettingsTab({
  currentUser,
  onSessionRefresh,
  refreshNonce = 0,
  globalLang,
  globalTheme,
}: SettingsTabProps) {
  const isEnglish = globalLang === 'en';
  const isLight = globalTheme === 'light';
  const latestRequestRef = useRef(0);

  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [modelName, setModelName] = useState(DEFAULT_MODEL);
  const [baseUrl, setBaseUrl] = useState('');
  const [usageCount, setUsageCount] = useState(0);
  const [usageLimit, setUsageLimit] = useState<number | ''>('');
  const [displayedKeyMask, setDisplayedKeyMask] = useState(isEnglish ? 'Not configured yet' : 'Chưa cấu hình');
  const [hasStoredApiKey, setHasStoredApiKey] = useState(false);
  const [clearApiKey, setClearApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [lastValidatedAt, setLastValidatedAt] = useState<string | null>(null);
  const [accountName, setAccountName] = useState(currentUser?.name || '');
  const [accountEmail, setAccountEmail] = useState(currentUser?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  useEffect(() => {
    setAccountName(currentUser?.name || '');
    setAccountEmail(currentUser?.email || '');
  }, [currentUser?.id, currentUser?.name, currentUser?.email]);

  const saveLocalAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingAccount(true);
    setAccountError(null);
    setAccountMessage(null);
    try {
      const response = await fetch('/api/auth/account', {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: accountName, email: accountEmail, currentPassword, newPassword: newPassword || null }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || (isEnglish ? 'Unable to update account.' : 'Không thể cập nhật tài khoản.'));
      setCurrentPassword('');
      setNewPassword('');
      setAccountMessage(isEnglish ? 'Account information updated.' : 'Đã cập nhật thông tin tài khoản.');
      await onSessionRefresh?.();
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : (isEnglish ? 'Unable to update account.' : 'Không thể cập nhật tài khoản.'));
    } finally { setSavingAccount(false); }
  };

  const resolvedProviderLabel = inferProviderLabel(baseUrl, modelName);
  const resolvedEndpointLabel = inferDefaultEndpoint(baseUrl, modelName);

  const validationTone = useMemo(() => {
    if (validating) {
      return isLight
        ? 'border-sky-200 bg-sky-50 text-sky-800'
        : 'border-sky-500/30 bg-sky-500/10 text-sky-200';
    }
    if (validationResult?.connected) {
      return isLight
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
    }
    if (validationResult && !validationResult.connected) {
      return isLight
        ? 'border-rose-200 bg-rose-50 text-rose-800'
        : 'border-rose-500/30 bg-rose-500/10 text-rose-200';
    }
    return isLight
      ? 'border-[var(--app-border)] bg-white text-[var(--app-text)]'
      : 'border-[var(--app-border)] bg-black/20 text-[var(--app-text)]';
  }, [isLight, validating, validationResult]);

  const validationSummary = formatValidationMessage(validationResult, isEnglish);

  const applyPayload = (payload: ParentSettingsPayload) => {
    const aiSettings = payload.aiSettings || {};
    const nextModel = aiSettings.modelName || DEFAULT_MODEL;
    setModelName(nextModel);
    setBaseUrl(aiSettings.baseUrl || '');
    setUsageCount(aiSettings.usageCount || 0);
    setUsageLimit(typeof aiSettings.usageLimit === 'number' && aiSettings.usageLimit > 0 ? aiSettings.usageLimit : '');
    setDisplayedKeyMask(aiSettings.apiKeyMasked || (isEnglish ? 'Not configured yet' : 'Chưa cấu hình'));
    setHasStoredApiKey(Boolean(aiSettings.hasApiKey));
    setApiKey('');
    setClearApiKey(false);
  };

  useEffect(() => {
    if (!currentUser) {
      setErrorMessage(null);
      setSaveMessage(null);
      setValidationResult(null);
      return;
    }

    const loadSettings = async () => {
      const requestId = ++latestRequestRef.current;
      setLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch('/api/parent-settings', {
          credentials: 'include',
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.message || payload?.error || (isEnglish ? 'Unable to load parent settings.' : 'Không thể tải cài đặt phụ huynh.'));
        }
        if (requestId !== latestRequestRef.current) {
          return;
        }
        applyPayload(payload?.data || payload);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : (isEnglish ? 'Unable to load parent settings.' : 'Không thể tải cài đặt phụ huynh.'));
      } finally {
        if (requestId === latestRequestRef.current) {
          setLoading(false);
        }
      }
    };

    void loadSettings();
  }, [currentUser, refreshNonce, isEnglish]);

  const runValidation = async () => {
    setValidating(true);
    setErrorMessage(null);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/parent-settings/validate', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: apiKey.trim() || undefined,
          modelName: modelName.trim() || undefined,
          baseUrl: baseUrl.trim() || undefined,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
          throw new Error(payload?.message || payload?.error || (isEnglish ? 'Connection test failed.' : 'Kiểm tra kết nối thất bại.'));
      }

      const result: ValidationResult = payload?.data || payload;
      setValidationResult(result);
      setLastValidatedAt(new Date().toLocaleString(isEnglish ? 'en-US' : 'vi-VN'));
      if (!result.connected) {
        setErrorMessage(result.message || (isEnglish ? 'Connection test failed.' : 'Kiểm tra kết nối thất bại.'));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : (isEnglish ? 'Connection test failed.' : 'Kiểm tra kết nối thất bại.');
      setValidationResult({
        connected: false,
        provider: resolvedProviderLabel,
        modelName,
        endpoint: resolvedEndpointLabel,
        errorType: 'unknown_error',
        message,
      });
      setLastValidatedAt(new Date().toLocaleString(isEnglish ? 'en-US' : 'vi-VN'));
      setErrorMessage(message);
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage(null);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/parent-settings', {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: apiKey.trim() || undefined,
          clearApiKey,
          modelName: modelName.trim() || undefined,
          baseUrl: baseUrl.trim() || undefined,
          usageLimit: typeof usageLimit === 'number' ? usageLimit : null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || (isEnglish ? 'Unable to save AI settings.' : 'Không thể lưu cấu hình AI.'));
      }

      applyPayload(payload?.data || payload);
      setSaveMessage(isEnglish ? 'AI settings saved to the backend.' : 'Đã lưu cấu hình AI vào backend.');
      if (onSessionRefresh) {
        await onSessionRefresh();
      }
      await runValidation();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : (isEnglish ? 'Unable to save AI settings.' : 'Không thể lưu cấu hình AI.'));
    } finally {
      setSaving(false);
    }
  };

  if (!currentUser) {
    return (
      <div className={`rounded-[20px] border border-b-4 p-6 ${isLight ? 'border-[var(--app-border)] bg-transparent text-[var(--app-text)]' : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)]'}`}>
        <h2 className="text-xl font-black">{isEnglish ? 'Parent settings' : 'Cài đặt phụ huynh'}</h2>
        <p className="mt-2 text-sm text-[var(--app-text-muted)]">
          {isEnglish
            ? 'Please sign in first to save and verify AI settings.'
            : 'Hãy đăng nhập trước để lưu và kiểm tra cấu hình AI.'}
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-6 rounded-[24px] border border-b-4 p-6 shadow-xl ${isLight ? 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)]' : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)]'}`}>
      {(currentUser.authProvider || 'local') === 'local' && (
        <form onSubmit={saveLocalAccount} className={`rounded-[20px] border p-5 ${isLight ? 'border-[var(--app-border)] bg-[var(--app-bg-alt)]' : 'border-[var(--app-border)] bg-black/20'}`}>
          <div className="mb-4 flex items-center gap-2"><KeyRound className="h-5 w-5 text-[#1cb0f6]" /><h2 className="text-lg font-black">{isEnglish ? 'Local account information' : 'Thông tin tài khoản local'}</h2></div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-xs font-black uppercase">{isEnglish ? 'Display name' : 'Tên hiển thị'}<input value={accountName} onChange={(event) => setAccountName(event.target.value)} minLength={2} required className={`mt-2 min-h-[50px] w-full rounded-xl border border-[var(--app-border)] px-4 text-sm font-bold normal-case outline-none focus:border-[#1cb0f6] ${isLight ? 'bg-gradient-to-r from-[#fff0f3] to-[#fff8e7] text-[var(--app-text)]' : 'bg-black/30 text-white'}`} /></label>
            <label className="text-xs font-black uppercase">Email<input type="email" value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} required className={`mt-2 min-h-[50px] w-full rounded-xl border border-[var(--app-border)] px-4 text-sm font-bold normal-case outline-none focus:border-[#1cb0f6] ${isLight ? 'bg-gradient-to-r from-[#fff0f3] to-[#fff8e7] text-[var(--app-text)]' : 'bg-black/30 text-white'}`} /></label>
            <label className="text-xs font-black uppercase">{isEnglish ? 'Current password' : 'Mật khẩu hiện tại'}<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required className={`mt-2 min-h-[50px] w-full rounded-xl border border-[var(--app-border)] px-4 text-sm font-bold normal-case outline-none focus:border-[#1cb0f6] ${isLight ? 'bg-gradient-to-r from-[#fff0f3] to-[#fff8e7] text-[var(--app-text)]' : 'bg-black/30 text-white'}`} /></label>
            <label className="text-xs font-black uppercase">{isEnglish ? 'New password (optional)' : 'Mật khẩu mới (không bắt buộc)'}<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={6} className={`mt-2 min-h-[50px] w-full rounded-xl border border-[var(--app-border)] px-4 text-sm font-bold normal-case outline-none focus:border-[#1cb0f6] ${isLight ? 'bg-gradient-to-r from-[#fff0f3] to-[#fff8e7] text-[var(--app-text)]' : 'bg-black/30 text-white'}`} /></label>
          </div>
          {accountError && <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-xs font-bold text-red-500">{accountError}</p>}
          {accountMessage && <p className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-xs font-bold text-emerald-500">{accountMessage}</p>}
          <button disabled={savingAccount} className="mt-4 min-h-[50px] rounded-xl bg-[#1cb0f6] px-5 text-xs font-black uppercase text-white disabled:opacity-60">{savingAccount ? (isEnglish ? 'Saving…' : 'Đang lưu…') : (isEnglish ? 'Save account' : 'Lưu tài khoản')}</button>
        </form>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#8b5cf6]" />
            <h2 className="text-2xl font-black">{isEnglish ? 'AI settings and API key' : 'Cài đặt AI và API key'}</h2>
          </div>
        </div>

        <div className={`rounded-[16px] border px-4 py-3 text-sm ${isLight ? 'border-[var(--app-border)] bg-[var(--app-bg-alt)]' : 'border-[var(--app-border)] bg-black/20'}`}>
          <div className="font-black">{currentUser.name}</div>
          <div className="text-xs text-[var(--app-text-muted)]">{currentUser.email}</div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#1cb0f6]">
            {(currentUser.authProvider || 'local')} session
          </div>
        </div>
      </div>



      <form onSubmit={handleSave} className="space-y-5">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <label className="text-xs font-black uppercase">{isEnglish ? "Parent's API key" : 'API key của phụ huynh'}</label>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-black text-[#1cb0f6] underline"
            >
              {isEnglish ? 'Get API key' : 'Lấy API key'} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={hasStoredApiKey ? (isEnglish ? 'Enter a new key to replace it' : 'Nhập key mới nếu muốn thay') : (isEnglish ? 'Enter your API key' : 'Nhập API key')}
              className={`w-full rounded-[14px] border py-3 pl-4 pr-24 text-sm font-mono ${isLight ? 'border-[var(--app-border)] bg-gradient-to-r from-[#fff0f3] to-[#fff8e7] text-[var(--app-text)]' : 'border-[var(--app-border)] bg-black/30 text-[var(--app-text)]'}`}
            />
            <div className="absolute right-3 top-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowKey((previous) => !previous)}
                className="text-[var(--app-text-muted)]"
                aria-label={showKey ? 'Hide key' : 'Show key'}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <KeyRound className="h-4 w-4 text-[#8b5cf6]" />
            </div>
          </div>

          <div className={`rounded-[14px] border px-4 py-3 text-sm ${isLight ? 'border-[var(--app-border)] bg-[var(--app-bg-alt)]' : 'border-[var(--app-border)] bg-black/20'}`}>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
              {isEnglish ? 'Active key' : 'Key hiện tại'}
            </div>
            <div className="mt-1 font-black">{displayedKeyMask}</div>
            {hasStoredApiKey && (
              <label className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-rose-500">
                <input
                  type="checkbox"
                  checked={clearApiKey}
                  onChange={(event) => setClearApiKey(event.target.checked)}
                />
                {isEnglish ? 'Remove saved key on next save' : 'Xóa key đã lưu ở lần lưu tiếp theo'}
              </label>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-black uppercase">{isEnglish ? 'Model name' : 'Tên model'}</label>
            <input
              type="text"
              value={modelName}
              onChange={(event) => setModelName(event.target.value)}
              placeholder="gemini-2.5-flash / gpt-4o-mini / claude-sonnet-4-5 / qwen-plus"
              className={`w-full rounded-[14px] border px-4 py-3 text-sm font-mono ${isLight ? 'border-[var(--app-border)] bg-gradient-to-r from-[#fff0f3] to-[#fff8e7] text-[var(--app-text)]' : 'border-[var(--app-border)] bg-black/30 text-[var(--app-text)]'}`}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-black uppercase">{isEnglish ? 'Base URL / endpoint' : 'Base URL / endpoint'}</label>
            <input
              type="url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.openai.com/v1 / https://api.anthropic.com/v1/messages"
              className={`w-full rounded-[14px] border px-4 py-3 text-sm font-mono ${isLight ? 'border-[var(--app-border)] bg-gradient-to-r from-[#fff0f3] to-[#fff8e7] text-[var(--app-text)]' : 'border-[var(--app-border)] bg-black/30 text-[var(--app-text)]'}`}
            />
            <p className="text-[11px] text-[var(--app-text-muted)]">
              {isEnglish
                ? 'You can enter either a root URL or a full endpoint.'
                : 'Bạn có thể nhập URL gốc hoặc endpoint đầy đủ.'}
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className={`rounded-[18px] border p-4 ${isLight ? 'border-[var(--app-border)] bg-[var(--app-bg-alt)]' : 'border-[var(--app-border)] bg-black/20'}`}>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
              {isEnglish ? 'Current token usage' : 'Số token đang dùng'}
            </div>
            <div className="mt-2 text-2xl font-black">{usageCount.toLocaleString()}</div>
          </div>
          <div className={`rounded-[18px] border p-4 ${isLight ? 'border-[var(--app-border)] bg-[var(--app-bg-alt)]' : 'border-[var(--app-border)] bg-black/20'}`}>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
              {isEnglish ? 'Usage limit' : 'Giới hạn sử dụng'}
            </div>
            <input
              type="number"
              min={0}
              value={usageLimit}
              onChange={(event) => {
                const value = event.target.value;
                setUsageLimit(value ? Number(value) : '');
              }}
              placeholder={isEnglish ? 'Leave blank for unlimited' : 'Để trống để không giới hạn'}
              className={`mt-2 w-full rounded-[12px] border px-4 py-3 text-sm font-mono ${isLight ? 'border-[var(--app-border)] bg-gradient-to-r from-[#fff0f3] to-[#fff8e7] text-[var(--app-text)]' : 'border-[var(--app-border)] bg-black/30 text-[var(--app-text)]'}`}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-[52px] items-center gap-2 rounded-[14px] bg-[#58cc02] px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {isEnglish ? 'Save AI settings' : 'Lưu cấu hình AI'}
          </button>

          <button
            type="button"
            onClick={() => void runValidation()}
            disabled={validating}
            className={`inline-flex min-h-[52px] items-center gap-2 rounded-[14px] border px-5 py-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60 ${isLight ? 'border-[#1cb0f6] bg-sky-50 text-sky-700' : 'border-[#1cb0f6]/40 bg-[#1cb0f6]/10 text-sky-300'}`}
          >
            {validating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {isEnglish ? 'Test connection' : 'Kiểm tra kết nối'}
          </button>
        </div>

        <AnimatePresence>
          {saveMessage && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`rounded-[14px] border px-4 py-3 text-sm font-semibold ${isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}
            >
              {saveMessage}
            </motion.div>
          )}
        </AnimatePresence>

        <div className={`rounded-[20px] border p-5 ${validationTone}`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 rounded-full p-2 ${validationResult?.connected ? 'bg-emerald-500/15 text-emerald-500' : validationResult ? 'bg-rose-500/15 text-rose-500' : 'bg-slate-500/15 text-slate-500'}`}>
                {validationResult?.connected ? <ShieldCheck className="h-5 w-5" /> : validationResult ? <ShieldX className="h-5 w-5" /> : <Unplug className="h-5 w-5" />}
              </div>
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.22em]">
                  {isEnglish ? 'Connection status' : 'Trạng thái kết nối'}
                </div>
                <div className="mt-1 text-lg font-black">
                  {validating
                    ? (isEnglish ? 'Testing now...' : 'Đang kiểm tra...')
                    : validationResult?.connected
                      ? (isEnglish ? 'Connected successfully' : 'Kết nối thành công')
                      : validationResult
                        ? (isEnglish ? 'Connection failed' : 'Kết nối thất bại')
                        : (isEnglish ? 'Not verified yet' : 'Chưa xác minh')}
                </div>
                <p className="mt-2 max-w-2xl text-sm opacity-90">{validationSummary}</p>
              </div>
            </div>

            {lastValidatedAt && (
              <div className="text-xs font-semibold opacity-80">
                {isEnglish ? 'Last checked:' : 'Lần kiểm tra cuối:'} {lastValidatedAt}
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className={`rounded-[14px] border p-3 ${isLight ? 'border-white bg-white/80' : 'border-white/10 bg-black/20'}`}>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-70">
                {isEnglish ? 'Provider used' : 'Provider sử dụng'}
              </div>
              <div className="mt-1 font-black">{validationResult?.provider || resolvedProviderLabel}</div>
            </div>
            <div className={`rounded-[14px] border p-3 ${isLight ? 'border-white bg-white/80' : 'border-white/10 bg-black/20'}`}>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-70">
                {isEnglish ? 'Model verified' : 'Model được kiểm tra'}
              </div>
              <div className="mt-1 break-all font-black">{validationResult?.modelName || modelName}</div>
            </div>
            <div className={`rounded-[14px] border p-3 ${isLight ? 'border-white bg-white/80' : 'border-white/10 bg-black/20'}`}>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-70">
                {isEnglish ? 'Endpoint used' : 'Endpoint đã dùng'}
              </div>
              <div className="mt-1 break-all text-sm font-black">{validationResult?.endpoint || resolvedEndpointLabel}</div>
            </div>
          </div>

          {validationResult?.connected && (
            <div className={`mt-4 rounded-[14px] border p-4 text-sm ${isLight ? 'border-emerald-200 bg-white/80' : 'border-emerald-500/20 bg-black/20'}`}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-black uppercase text-emerald-500">
                  {validationResult.latencyMs ?? 0} ms
                </span>
                <span className="text-xs font-semibold text-[var(--app-text-muted)]">
                  {isEnglish ? 'Sample provider reply:' : 'Phản hồi mẫu từ provider:'}
                </span>
              </div>
              <div className="mt-2 font-mono text-sm">{validationResult.sampleReply || 'OK'}</div>
            </div>
          )}
        </div>

        {errorMessage && (
          <div className={`rounded-[14px] border px-4 py-3 text-sm font-semibold ${isLight ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
            {errorMessage}
          </div>
        )}
      </form>

      <VietnameseTtsTool globalLang={globalLang} globalTheme={globalTheme} />
    </div>
  );
}

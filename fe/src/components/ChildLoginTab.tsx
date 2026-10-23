import React, { useEffect, useMemo, useState } from 'react';
import { KeyRound, Search, UserRound } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

type Child = { id: string; name: string; avatarUrl?: string | null };

interface ChildLoginTabProps {
  children: Child[];
  globalLang: 'en' | 'vi';
  globalTheme: 'light' | 'dark';
  onSuccess: (child: { id: string; name: string; username: string }) => void;
}

export default function ChildLoginTab({ children, globalLang, globalTheme, onSuccess }: ChildLoginTabProps) {
  const [query, setQuery] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingChildId, setLoadingChildId] = useState<string | null>(null);
  const [credentialUsernames, setCredentialUsernames] = useState<Record<string, string>>({});
  const [isMobile, setIsMobile] = useState(false);
  const isEnglish = globalLang === 'en';
  const isLight = globalTheme === 'light';

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!selectedChildId) return;
    const stillExists = children.some((child) => child.id === selectedChildId);
    if (!stillExists) {
      setSelectedChildId(null);
      setUsername('');
      setPassword('');
    }
  }, [children, selectedChildId]);

  const filteredChildren = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return children;

    return children.filter((child) => {
      const cachedUsername = credentialUsernames[child.id] || '';
      return (
        child.name.toLocaleLowerCase().includes(normalized) ||
        cachedUsername.toLocaleLowerCase().includes(normalized)
      );
    });
  }, [children, credentialUsernames, query]);

  const selectChild = async (child: Child) => {
    setSelectedChildId(child.id);
    setError(null);
    setLoadingChildId(child.id);
    setUsername('');
    setPassword('');

    const knownUsername = credentialUsernames[child.id] || '';
    if (knownUsername) {
      setUsername(knownUsername);
      setPassword('AUTOFILL');
      setLoadingChildId(null);
      return;
    }

    try {
      const response = await fetch(`/api/child-auth/credentials/${child.id}`, { credentials: 'include' });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.message || 'Unable to load child login.');
      }

      const loadedUsername = String(payload?.credential?.username || '').trim();
      if (!loadedUsername) {
        throw new Error(
          isEnglish ? 'This child does not have a login yet.' : 'Bé chưa được tạo tài khoản đăng nhập.',
        );
      }

      setCredentialUsernames((previous) => ({
        ...previous,
        [child.id]: loadedUsername,
      }));
      setUsername(loadedUsername);
      setPassword('AUTOFILL');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : (isEnglish ? 'Unable to load child login.' : 'Không thể tải tài khoản của bé.'),
      );
      setUsername('');
      setPassword('');
    } finally {
      setLoadingChildId(null);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/child-auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.message || (isEnglish ? 'Unable to sign in.' : 'Không thể đăng nhập.'));
      }

      onSuccess(payload.child);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : (isEnglish ? 'Unable to sign in.' : 'Không thể đăng nhập.'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0">
      <section
        className={`rounded-[24px] border border-b-4 p-6 border-[var(--app-border)] backdrop-blur-md ${isLight ? 'bg-amber-50/90' : 'bg-[var(--app-surface)]'}`}
      >
        <div className="mb-5">
          <h2 className="text-2xl font-black">{isEnglish ? 'Who is learning today?' : 'Hôm nay bé nào sẽ học?'}</h2>
          <p className="mt-1 text-sm text-[var(--app-text-muted)]">
            {isEnglish
              ? 'Search by child name or username, choose the profile, then enter the child password.'
              : 'Tìm theo tên bé hoặc tên tài khoản, chọn hồ sơ rồi nhập mật khẩu của bé.'}
          </p>
        </div>

        <label className="relative block">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--app-text-muted)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className={`min-h-[52px] w-full rounded-2xl border border-[var(--app-border)] pl-12 pr-4 text-sm font-bold outline-none focus:border-[#1cb0f6] ${
              isLight
                ? 'bg-gradient-to-r from-[#fff0f3] to-[#fff8e7] text-[var(--app-text)]'
                : 'bg-black/30 text-white'
            }`}
            placeholder={isEnglish ? 'Search child name or username' : 'Tìm tên bé hoặc tên tài khoản'}
          />
        </label>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredChildren.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => void selectChild(child)}
              className={`flex min-h-[76px] items-center gap-3 rounded-2xl border p-3 text-left transition ${
                selectedChildId === child.id
                  ? 'border-[#1cb0f6] bg-[#1cb0f6]/10 ring-2 ring-[#1cb0f6]/20'
                  : 'border-[var(--app-border)] bg-[var(--app-bg-alt)] hover:border-[#1cb0f6]/60'
              }`}
            >
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[#ffc800]/20 text-xl">
                {child.avatarUrl ? (
                  <img src={child.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <UserRound className="h-6 w-6 text-[#ff9600]" />
                )}
              </div>

              <span className="min-w-0">
                <span className="block truncate font-black">{child.name}</span>

                {loadingChildId === child.id ? (
                  <span className="block truncate text-xs font-bold text-[#58cc02]">
                    {isEnglish ? 'Loading account…' : 'Đang tải tài khoản…'}
                  </span>
                ) : credentialUsernames[child.id] ? (
                  <span className="block truncate text-xs font-bold text-[#1cb0f6]">
                    @{credentialUsernames[child.id]}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>

        {filteredChildren.length === 0 && (
          <div className="py-10 text-center text-sm font-bold text-[var(--app-text-muted)]">
            {isEnglish ? 'Child has not been created.' : 'Bé chưa được tạo.'}
          </div>
        )}
      </section>

      {/* Inline Form for Desktop */}
      {!isMobile && (
        <form
          autoComplete="off"
          onSubmit={submit}
          className={`rounded-[24px] border border-b-4 p-6 border-[var(--app-border)] backdrop-blur-md ${isLight ? 'bg-amber-50/90' : 'bg-[var(--app-surface)]'}`}
        >
          <div className="mb-4 flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-[#58cc02]" />
            <h3 className="font-black">{isEnglish ? 'Child sign in' : 'Đăng nhập cho bé'}</h3>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              name="child-login-username"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              className={`min-h-[52px] rounded-xl border border-[var(--app-border)] px-4 text-sm font-bold outline-none focus:border-[#1cb0f6] ${
                isLight
                  ? 'bg-gradient-to-r from-[#fff0f3] to-[#fff8e7] text-[var(--app-text)]'
                  : 'bg-black/30 text-white'
              }`}
              placeholder={isEnglish ? 'Username' : 'Tên đăng nhập'}
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              name="child-login-password"
              autoComplete="new-password"
              required
              className={`min-h-[52px] rounded-xl border border-[var(--app-border)] px-4 text-sm font-bold outline-none focus:border-[#1cb0f6] ${
                isLight
                  ? 'bg-gradient-to-r from-[#fff0f3] to-[#fff8e7] text-[var(--app-text)]'
                  : 'bg-black/30 text-white'
              }`}
              placeholder={isEnglish ? 'Child password' : 'Mật khẩu của bé'}
            />
          </div>

          {selectedChildId && loadingChildId === selectedChildId && (
            <p className="mt-3 text-xs font-bold text-[#1cb0f6]">
              {isEnglish ? 'Loading the selected child account…' : 'Đang tải tài khoản của bé đã chọn…'}
            </p>
          )}

          {error && <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-xs font-bold text-red-500">{error}</p>}

          <button
            disabled={loading || loadingChildId !== null || !username}
            className="duo-btn-green mt-5 min-h-[52px] w-full rounded-xl px-6 text-xs font-black uppercase text-white disabled:opacity-50"
          >
            {loading ? (isEnglish ? 'Signing in…' : 'Đang đăng nhập…') : (isEnglish ? 'Start learning' : 'Bắt đầu học')}
          </button>
        </form>
      )}

      {/* Modal Form for Mobile */}
      <AnimatePresence>
        {isMobile && selectedChildId && (
          <motion.div
            className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.form
              onSubmit={submit}
              autoComplete="off"
              className={`w-full max-w-md rounded-[24px] border border-b-4 p-6 border-[var(--app-border)] backdrop-blur-xl ${isLight ? 'bg-amber-50/90' : 'bg-[var(--app-surface)]'}`}
              initial={{ y: 14, scale: 0.97 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 14, scale: 0.97 }}
            >
              <div className="mb-4 flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-[#58cc02]" />
                <h3 className="font-black">{isEnglish ? 'Child sign in' : 'Đăng nhập cho bé'}</h3>
              </div>

              <div className="grid gap-4">
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  name="child-login-username"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  className={`min-h-[52px] rounded-xl border border-[var(--app-border)] px-4 text-sm font-bold outline-none focus:border-[#1cb0f6] ${
                    isLight
                      ? 'bg-gradient-to-r from-[#fff0f3] to-[#fff8e7] text-[var(--app-text)]'
                      : 'bg-black/30 text-white'
                  }`}
                  placeholder={isEnglish ? 'Username' : 'Tên đăng nhập'}
                />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  name="child-login-password"
                  autoComplete="new-password"
                  required
                  className={`min-h-[52px] rounded-xl border border-[var(--app-border)] px-4 text-sm font-bold outline-none focus:border-[#1cb0f6] ${
                    isLight
                      ? 'bg-gradient-to-r from-[#fff0f3] to-[#fff8e7] text-[var(--app-text)]'
                      : 'bg-black/30 text-white'
                  }`}
                  placeholder={isEnglish ? 'Child password' : 'Mật khẩu của bé'}
                />
              </div>

              {loadingChildId === selectedChildId && (
                <p className="mt-3 text-xs font-bold text-[#1cb0f6]">
                  {isEnglish ? 'Loading the selected child account…' : 'Đang tải tài khoản của bé đã chọn…'}
                </p>
              )}

              {error && <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-xs font-bold text-red-500">{error}</p>}

              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedChildId(null);
                    setPassword('');
                    setUsername('');
                  }}
                  className="min-h-[48px] rounded-xl border border-[var(--app-border)] px-5 text-xs font-black uppercase text-[var(--app-text)] hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition"
                >
                  {isEnglish ? 'Cancel' : 'Hủy'}
                </button>
                <button
                  disabled={loading || loadingChildId !== null || !username}
                  className="duo-btn-green min-h-[48px] flex-1 rounded-xl px-5 text-xs font-black uppercase text-white disabled:opacity-50"
                >
                  {loading ? (isEnglish ? 'Signing in…' : 'Đang đăng nhập…') : (isEnglish ? 'Start learning' : 'Bắt đầu học')}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

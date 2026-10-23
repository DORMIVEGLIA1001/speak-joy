import React, { useState } from 'react';

export default function ResetPasswordModal({ token, globalLang, globalTheme, onClose }: { token: string; globalLang: 'en' | 'vi'; globalTheme: 'light' | 'dark'; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const isEnglish = globalLang === 'en';
  const isLight = globalTheme === 'light';

  return <div className="fixed inset-0 z-[2200] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
    <form onSubmit={async (event) => {
      event.preventDefault();
      if (password !== confirmPassword) { setError(isEnglish ? 'Passwords do not match.' : 'Mật khẩu nhập lại không khớp.'); return; }
      setLoading(true); setError(null);
      try {
        const response = await fetch('/api/auth/reset-password', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, newPassword: password }) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.message || 'Unable to reset password.');
        setDone(true);
      } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to reset password.'); }
      finally { setLoading(false); }
    }} className={`w-full max-w-md rounded-[24px] border p-6 shadow-2xl ${isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-[var(--app-border)] bg-[var(--app-surface)] text-white'}`}>
      <h2 className="text-xl font-black">{isEnglish ? 'Set a new password' : 'Đặt mật khẩu mới'}</h2>
      {done ? <><p className="mt-3 text-sm text-emerald-500">{isEnglish ? 'Password updated. You can now sign in.' : 'Đã cập nhật mật khẩu. Bạn có thể đăng nhập.'}</p><button type="button" onClick={onClose} className="mt-5 min-h-[50px] w-full rounded-xl bg-[#58cc02] text-xs font-black uppercase text-white">{isEnglish ? 'Continue' : 'Tiếp tục'}</button></> : <>
        <input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required placeholder={isEnglish ? 'New password' : 'Mật khẩu mới'} className="mt-5 min-h-[52px] w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-bg-alt)] px-4 font-bold outline-none focus:border-[#1cb0f6]" />
        <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={6} required placeholder={isEnglish ? 'Confirm new password' : 'Nhập lại mật khẩu mới'} className="mt-3 min-h-[52px] w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-bg-alt)] px-4 font-bold outline-none focus:border-[#1cb0f6]" />
        {error && <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-xs font-bold text-red-500">{error}</p>}
        <button disabled={loading} className="mt-5 min-h-[52px] w-full rounded-xl bg-[#1cb0f6] text-xs font-black uppercase text-white disabled:opacity-60">{loading ? (isEnglish ? 'Updating…' : 'Đang cập nhật…') : (isEnglish ? 'Update password' : 'Cập nhật mật khẩu')}</button>
      </>}
    </form>
  </div>;
}

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, X } from 'lucide-react';

import { playAppSound } from '../data';
import { formatApiError } from '../lib/apiError';

interface AuthModalProps {
  mode: 'signup' | 'login';
  onClose: () => void;
  onSwitchMode: (newMode: 'signup' | 'login') => void;
  onSubmit: (data: { email: string; name?: string; pass: string; user?: any }) => void;
  onSessionRefresh?: () => Promise<void> | void;
  initialErrorMessage?: string | null;
  globalLang: 'en' | 'vi';
  globalTheme: 'dark' | 'light';
}

type ResetStep = 'idle' | 'otp' | 'newPassword';

const getFriendlyError = (message: string | undefined, isEnglish: boolean) => {
  const normalized = (message || '').trim();
  if (!normalized) {
    return isEnglish
      ? 'The sign-in system is temporarily unavailable. Please try again in a moment.'
      : 'Hệ thống đăng nhập tạm thời chưa sẵn sàng. Vui lòng thử lại sau ít phút.';
  }

  if (/failed to fetch|fetch failed/i.test(normalized)) {
    return isEnglish
      ? 'The frontend could not reach the auth backend. Please make sure the backend is running on port 8080 and try again.'
      : 'Frontend chưa kết nối được tới backend xác thực. Hãy kiểm tra backend đang chạy ở cổng 8080 rồi thử lại.';
  }

  return normalized;
};

export default function AuthModal({
  mode,
  onClose,
  onSwitchMode,
  onSubmit,
  onSessionRefresh,
  initialErrorMessage,
  globalLang,
  globalTheme,
}: AuthModalProps) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialErrorMessage || null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [requestingReset, setRequestingReset] = useState(false);
  const [resetStep, setResetStep] = useState<ResetStep>('idle');
  const [resetOtp, setResetOtp] = useState('');
  const [resetGrantToken, setResetGrantToken] = useState('');
  const [newResetPassword, setNewResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');
  const [resetCooldownSeconds, setResetCooldownSeconds] = useState(0);
  const [resetResendRemaining, setResetResendRemaining] = useState(0);

  const isLight = globalTheme === 'light';
  const isEnglish = globalLang === 'en';

  useEffect(() => {
    setErrorMessage(initialErrorMessage || null);
  }, [initialErrorMessage, mode]);

  useEffect(() => {
    setResetStep('idle');
    setResetOtp('');
    setResetGrantToken('');
    setNewResetPassword('');
    setConfirmResetPassword('');
    setResetMessage(null);
    setResetCooldownSeconds(0);
    setResetResendRemaining(0);
  }, [mode]);

  const resetForgotPasswordFlow = () => {
    setResetStep('idle');
    setResetOtp('');
    setResetGrantToken('');
    setNewResetPassword('');
    setConfirmResetPassword('');
    setResetMessage(null);
    setErrorMessage(null);
    setResetCooldownSeconds(0);
    setResetResendRemaining(0);
  };

  useEffect(() => {
    if (resetCooldownSeconds <= 0) return;
    const timer = window.setTimeout(() => {
      setResetCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [resetCooldownSeconds]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword || (mode === 'signup' && !trimmedUsername)) {
      setErrorMessage(
        isEnglish
          ? 'Please complete all required fields.'
          : 'Hãy điền đầy đủ các trường bắt buộc.',
      );
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch(mode === 'signup' ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          mode === 'signup'
            ? {
              email: trimmedEmail,
              username: trimmedUsername,
              name: trimmedUsername,
              displayName: trimmedUsername,
              password: trimmedPassword,
              role: 'parent',
            }
            : {
              identifier: trimmedEmail,
              email: trimmedEmail.includes('@') ? trimmedEmail : undefined,
              username: trimmedEmail.includes('@') ? undefined : trimmedEmail,
              password: trimmedPassword,
            },
        ),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        throw new Error(
          formatApiError(
            payload,
            isEnglish
              ? 'This account could not be authenticated right now.'
              : 'Tài khoản hiện chưa thể xác thực.',
            isEnglish,
          ),
        );
      }

      const user = payload?.user || payload?.data?.user;
      await onSessionRefresh?.();
      onSubmit({
        email: trimmedEmail,
        name: trimmedUsername || user?.name,
        pass: trimmedPassword,
        user,
      });
    } catch (error) {
      console.error('Auth request failed:', error);
      setErrorMessage(getFriendlyError(error instanceof Error ? error.message : String(error), isEnglish));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOAuthStart = (provider: 'google' | 'facebook') => {
    playAppSound(500, 'sine', 0.1);
    const nextPath = '/';
    window.location.assign(`/api/auth/${provider}/start?next=${encodeURIComponent(nextPath)}`);
  };

  const handleForgotPassword = async () => {
    const resetEmail = email.trim();
    if (!resetEmail || !resetEmail.includes('@')) {
      setErrorMessage(isEnglish ? 'Enter your account email first.' : 'Hãy nhập email tài khoản trước.');
      return;
    }

    setRequestingReset(true);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || 'Unable to request a password reset.');
      }
      setResetStep('otp');
      setResetCooldownSeconds(Number(payload?.cooldownSeconds || 60));
      setResetResendRemaining(Number(payload?.resendRemaining || 0));
      setResetMessage(
        payload?.delivery === 'console'
          ? (isEnglish
            ? 'Development mode: the OTP code was written to the backend terminal.'
            : 'Chế độ phát triển: mã OTP đã được ghi ra terminal backend.')
          : payload?.delivery === 'unavailable'
            ? (isEnglish
              ? 'Email delivery is not configured. Ask the administrator to configure SMTP.'
              : 'Dịch vụ gửi email chưa được cấu hình SMTP. Hãy liên hệ quản trị viên.')
            : (isEnglish
              ? 'If this is a local account, a 6-digit code has been sent to the email.'
              : 'Nếu đây là tài khoản local, mã 6 số đã được gửi qua email.'),
      );
    } catch {
      setResetMessage(
        isEnglish
          ? 'If this is a local account, a reset code will be sent when email service is available.'
          : 'Nếu đây là tài khoản local, mã đặt lại mật khẩu sẽ được gửi khi dịch vụ email sẵn sàng.',
      );
    } finally {
      setRequestingReset(false);
    }
  };

  const handleVerifyResetOtp = async () => {
    if (!email.trim() || !resetOtp.trim()) {
      setErrorMessage(isEnglish ? 'Enter the email and OTP code.' : 'Hãy nhập email và mã OTP.');
      return;
    }

    setRequestingReset(true);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/auth/forgot-password/verify-otp', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), otp: resetOtp.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || 'Unable to verify OTP.');
      }
      setResetGrantToken(payload.grantToken || '');
      setResetStep('newPassword');
      setResetMessage(
        isEnglish
          ? 'Code verified. You can set a new password now.'
          : 'Xác minh mã thành công. Bây giờ bạn có thể đặt mật khẩu mới.',
      );
    } catch (error) {
      setErrorMessage(getFriendlyError(error instanceof Error ? error.message : String(error), isEnglish));
    } finally {
      setRequestingReset(false);
    }
  };

  const handleCompletePasswordReset = async () => {
    if (!newResetPassword.trim() || !confirmResetPassword.trim()) {
      setErrorMessage(isEnglish ? 'Please enter the new password twice.' : 'Hãy nhập mật khẩu mới đủ hai lần.');
      return;
    }
    if (newResetPassword !== confirmResetPassword) {
      setErrorMessage(isEnglish ? 'The new passwords do not match.' : 'Mật khẩu mới không khớp.');
      return;
    }

    setRequestingReset(true);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/auth/forgot-password/complete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grantToken: resetGrantToken, newPassword: newResetPassword }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || 'Unable to reset the password.');
      }
      setPassword('');
      resetForgotPasswordFlow();
      setResetMessage(
        isEnglish
          ? 'Password updated. Please sign in with the new password.'
          : 'Mật khẩu đã được cập nhật. Hãy đăng nhập bằng mật khẩu mới.',
      );
    } catch (error) {
      setErrorMessage(getFriendlyError(error instanceof Error ? error.message : String(error), isEnglish));
    } finally {
      setRequestingReset(false);
    }
  };

  const renderPasswordArea = () => {
    if (mode !== 'login' || resetStep === 'idle') {
      return (
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isEnglish ? 'Password' : 'Mật khẩu'}
            className={`w-full rounded-[18px] border-2 px-5 py-4 pr-13 text-sm font-semibold transition-all focus:border-sky-400 focus:outline-none md:text-base ${isLight
                ? 'border-slate-300 bg-slate-50 text-slate-900 placeholder-slate-500'
                : 'border-slate-600 bg-slate-900/80 text-white placeholder-slate-400'
              }`}
          />

          <button
            type="button"
            onClick={() => {
              playAppSound(300, 'sine', 0.05);
              setShowPassword((value) => !value);
            }}
            className={`absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer transition ${isLight ? 'text-slate-500 hover:text-slate-900' : 'text-slate-400 hover:text-white'
              }`}
            aria-label={showPassword ? (isEnglish ? 'Hide password' : 'Ẩn mật khẩu') : isEnglish ? 'Show password' : 'Hiện mật khẩu'}
          >
            {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
          </button>
        </div>
      );
    }

    if (resetStep === 'otp') {
      return (
        <div className="space-y-3">
          <input
            type="text"
            value={resetOtp}
            onChange={(e) => setResetOtp(e.target.value)}
            placeholder={isEnglish ? '6-digit code' : 'Mã OTP 6 số'}
            className={`w-full rounded-[18px] border-2 px-5 py-4 text-sm font-semibold transition-all focus:border-sky-400 focus:outline-none md:text-base ${isLight
                ? 'border-slate-300 bg-slate-50 text-slate-900 placeholder-slate-500'
                : 'border-slate-600 bg-slate-900/80 text-white placeholder-slate-400'
              }`}
          />
          <button
            type="button"
            disabled={requestingReset}
            onClick={() => void handleVerifyResetOtp()}
            className="w-full cursor-pointer rounded-[18px] auth-submit-btn py-4 text-sm font-black uppercase tracking-wider text-white transition-all hover:brightness-110 active:translate-y-1 active:border-b-0 active:brightness-95 disabled:opacity-70 md:text-base"
          >
            {requestingReset ? (isEnglish ? 'Checking...' : 'Đang kiểm tra...') : (isEnglish ? 'Verify code' : 'Xác minh mã')}
          </button>
          <button
            type="button"
            disabled={requestingReset || resetCooldownSeconds > 0 || resetResendRemaining <= 0}
            onClick={() => void handleForgotPassword()}
            className="text-xs font-black text-[var(--app-accent-blue)] hover:underline disabled:opacity-60"
          >
            {requestingReset
              ? (isEnglish ? 'Sending...' : 'Đang gửi...')
              : resetCooldownSeconds > 0
                ? (isEnglish ? `Resend in ${resetCooldownSeconds}s` : `Gửi lại sau ${resetCooldownSeconds}s`)
                : resetResendRemaining > 0
                  ? (isEnglish ? `Resend code (${resetResendRemaining} left)` : `Gửi lại mã (${resetResendRemaining} lượt)`)
                  : (isEnglish ? 'No resends left' : 'Đã hết lượt gửi lại')}
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <input
          type={showPassword ? 'text' : 'password'}
          value={newResetPassword}
          onChange={(e) => setNewResetPassword(e.target.value)}
          placeholder={isEnglish ? 'New password' : 'Mật khẩu mới'}
          className={`w-full rounded-[18px] border-2 px-5 py-4 pr-13 text-sm font-semibold transition-all focus:border-sky-400 focus:outline-none md:text-base ${isLight
              ? 'border-slate-300 bg-slate-50 text-slate-900 placeholder-slate-500'
              : 'border-slate-600 bg-slate-900/80 text-white placeholder-slate-400'
            }`}
        />
        <input
          type={showPassword ? 'text' : 'password'}
          value={confirmResetPassword}
          onChange={(e) => setConfirmResetPassword(e.target.value)}
          placeholder={isEnglish ? 'Confirm new password' : 'Nhập lại mật khẩu mới'}
          className={`w-full rounded-[18px] border-2 px-5 py-4 pr-13 text-sm font-semibold transition-all focus:border-sky-400 focus:outline-none md:text-base ${isLight
              ? 'border-slate-300 bg-slate-50 text-slate-900 placeholder-slate-500'
              : 'border-slate-600 bg-slate-900/80 text-white placeholder-slate-400'
            }`}
        />
        <button
          type="button"
          disabled={requestingReset}
          onClick={() => void handleCompletePasswordReset()}
          className="w-full cursor-pointer rounded-[18px] auth-submit-btn py-4 text-sm font-black uppercase tracking-wider text-white transition-all hover:brightness-110 active:translate-y-1 active:border-b-0 active:brightness-95 disabled:opacity-70 md:text-base"
        >
          {requestingReset ? (isEnglish ? 'Updating...' : 'Đang cập nhật...') : (isEnglish ? 'Save new password' : 'Lưu mật khẩu mới')}
        </button>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/82 p-4 font-sans backdrop-blur-md"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative w-full max-w-[520px] rounded-[30px] border-2 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] md:p-8 ${isLight
            ? 'border-slate-200 bg-white text-slate-900'
            : 'border-slate-700 bg-[#1d1a34] text-white'
          }`}
      >
        <div className="mb-6 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              playAppSound(250, 'sawtooth', 0.1);
              onClose();
            }}
            className={`cursor-pointer rounded-full p-2.5 transition ${isLight ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-900' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
          >
            {mode === 'signup' ? <ArrowLeft className="h-6 w-6 stroke-[2.5]" /> : <X className="h-6 w-6 stroke-[2.5]" />}
          </button>

          <button
            onClick={() => {
              playAppSound(400, 'triangle', 0.08);
              onSwitchMode(mode === 'login' ? 'signup' : 'login');
            }}
            className={`cursor-pointer rounded-[14px] border-2 bg-transparent px-5 py-2.5 text-xs font-black uppercase transition-all duration-100 active:scale-95 ${isLight
                ? 'border-slate-200 text-sky-600 hover:bg-slate-100'
                : 'border-slate-600 text-sky-300 hover:bg-slate-800'
              }`}
          >
            {mode === 'login' ? (isEnglish ? 'Sign up' : 'Đăng ký') : isEnglish ? 'Sign in' : 'Đăng nhập'}
          </button>
        </div>

        <div className="flex w-full flex-col space-y-8 text-center md:space-y-9">
          <h2 className={`text-3xl font-black tracking-wide md:text-4xl ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {mode === 'login' ? (isEnglish ? 'Sign in' : 'Đăng nhập') : isEnglish ? 'Create account' : 'Tạo tài khoản'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="relative">
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={isEnglish ? 'Parent username' : 'Tên tài khoản phụ huynh'}
                  className={`w-full rounded-[18px] border-2 px-5 py-4 text-sm font-semibold transition-all focus:border-sky-400 focus:outline-none md:text-base ${isLight
                      ? 'border-slate-300 bg-slate-50 text-slate-900 placeholder-slate-500'
                      : 'border-slate-600 bg-slate-900/80 text-white placeholder-slate-400'
                    }`}
                />
              </div>
            )}

            <div className="relative">
              <input
              type="text"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={mode === 'login' ? (isEnglish ? 'Email or username' : 'Email hoặc tên tài khoản') : isEnglish ? 'Parent email' : 'Email phụ huynh'}
                className={`w-full rounded-[18px] border-2 px-5 py-4 text-sm font-semibold transition-all focus:border-sky-400 focus:outline-none md:text-base ${isLight
                    ? 'border-slate-300 bg-slate-50 text-slate-900 placeholder-slate-500'
                    : 'border-slate-600 bg-slate-900/80 text-white placeholder-slate-400'
                  }`}
            />
          </div>

          {renderPasswordArea()}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || (mode === 'login' && resetStep !== 'idle')}
              className="w-full cursor-pointer rounded-[18px] auth-submit-btn py-4 text-sm font-black uppercase tracking-wider text-white transition-all hover:brightness-110 active:translate-y-1 active:border-b-0 active:brightness-95 disabled:opacity-70 md:text-base"
            >
              {isSubmitting ? (isEnglish ? 'Processing...' : 'Đang xử lý...') : mode === 'login' ? (isEnglish ? 'Sign in' : 'Đăng nhập') : isEnglish ? 'Create account' : 'Tạo tài khoản'}
            </button>
          </div>

            {mode === 'login' && (
              <div className="space-y-2">
                {resetStep === 'idle' ? (
                  <button
                    type="button"
                    disabled={requestingReset}
                    onClick={() => void handleForgotPassword()}
                    className="text-xs font-black text-[var(--app-accent-blue)] hover:underline disabled:opacity-60"
                  >
                    {requestingReset ? (isEnglish ? 'Sending...' : 'Đang gửi...') : (isEnglish ? 'Forgot password?' : 'Quên mật khẩu?')}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={requestingReset}
                    onClick={resetForgotPasswordFlow}
                    className="text-xs font-black text-[var(--app-accent-blue)] hover:underline disabled:opacity-60"
                  >
                    {isEnglish ? 'Back to sign in' : 'Quay lại đăng nhập'}
                  </button>
                )}
              </div>
            )}
          </form>

          {resetMessage && <div className="rounded-[18px] border border-emerald-500/40 bg-emerald-500/12 px-5 py-3.5 text-xs font-bold text-emerald-400 md:text-sm">{resetMessage}</div>}

          {errorMessage && (
            <div className="rounded-[18px] border border-red-500/40 bg-red-950/50 px-5 py-3.5 text-xs font-bold text-red-200 md:text-sm">
              {errorMessage}
            </div>
          )}

          <div className="flex items-center justify-center gap-3">
            <div className={`h-[2px] flex-1 ${isLight ? 'bg-slate-200' : 'bg-slate-700'}`} />
            <span className={`font-mono text-[11px] font-black uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{isEnglish ? 'Or' : 'Hoặc'}</span>
            <div className={`h-[2px] flex-1 ${isLight ? 'bg-slate-200' : 'bg-slate-700'}`} />
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => handleOAuthStart('google')}
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-[18px] border-[2px] py-4 text-sm font-black transition-all duration-100 active:scale-95 ${isLight ? 'border-slate-300 bg-slate-50 hover:bg-white' : 'border-slate-600 bg-slate-900/60 hover:bg-slate-800'
                }`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#EA4335" d="M12 5.04c1.64 0 3.12.56 4.28 1.67l3.2-3.2C17.52 1.58 14.92 1 12 1 7.37 1 3.4 3.63 1.48 7.47l3.77 2.92C6.13 7.39 8.82 5.04 12 5.04z" />
                <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.35H12v4.45h6.44c-.28 1.47-1.11 2.71-2.36 3.55l3.64 2.82c2.13-1.97 3.41-4.87 3.41-8.47z" />
                <path fill="#FBBC05" d="M5.25 14.75a7.16 7.16 0 010-4.5V7.33H1.48c-.78 1.55-1.23 3.3-1.23 5.17s.45 3.62 1.23 5.17l3.77-2.92z" />
                <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.64-2.82c-1.1.74-2.5 1.18-4.32 1.18-3.18 0-5.87-2.35-6.83-5.51L1.4 15.86C3.32 19.7 7.29 23 12 23z" />
              </svg>
              <span className="text-[#4285F4]">Google</span>
            </button>

            <button
              type="button"
              onClick={() => handleOAuthStart('facebook')}
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-[18px] border-[2px] py-4 text-sm font-black transition-all duration-100 active:scale-95 ${isLight ? 'border-slate-300 bg-slate-50 hover:bg-white' : 'border-slate-600 bg-slate-900/60 hover:bg-slate-800'
                }`}
            >
              <svg className="h-4.5 w-4.5 text-[#1877F2]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              <span className="text-[#1877f2]">Facebook</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

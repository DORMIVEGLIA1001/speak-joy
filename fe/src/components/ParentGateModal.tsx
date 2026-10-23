import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Fingerprint, KeyRound, LoaderCircle, ShieldAlert, X } from 'lucide-react';

import { playAppSound } from '../data';
import { isPlatformAuthenticatorAvailable, normalizeRequestOptions, serializeCredential } from '../lib/webauthn';
import { formatApiError } from '../lib/apiError';

interface ParentGateModalProps {
  onSuccess: () => void;
  onClose: () => void;
  onSetupRequired: () => void;
  globalLang: 'en' | 'vi';
  globalTheme: 'dark' | 'light';
}

type GateTab = 'passkey' | 'password';

type PasskeySummary = {
  hasPasskey: boolean;
  count: number;
};

export default function ParentGateModal({
  onSuccess,
  onClose,
  onSetupRequired,
  globalLang,
  globalTheme,
}: ParentGateModalProps) {
  const isLight = globalTheme === 'light';
  const isEnglish = globalLang === 'en';
  const [activeTab, setActiveTab] = useState<GateTab>('passkey');
  const [passwordInput, setPasswordInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifyingPasskey, setIsVerifyingPasskey] = useState(false);
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [hasPlatformAuthenticator, setHasPlatformAuthenticator] = useState(false);
  const [passkeySummary, setPasskeySummary] = useState<PasskeySummary>({ hasPasskey: false, count: 0 });

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const [platformAvailable, response] = await Promise.all([
          isPlatformAuthenticatorAvailable(),
          fetch('/api/webauthn/credentials', { credentials: 'include' }),
        ]);

        setHasPlatformAuthenticator(platformAvailable);

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.message || (isEnglish ? 'Unable to load the Passkey status.' : 'Không thể tải trạng thái Passkey.'));
        }

        const summary = (payload?.data || payload) as PasskeySummary;
        setPasskeySummary(summary);
        setActiveTab(summary.hasPasskey && platformAvailable ? 'passkey' : 'password');
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : (isEnglish ? 'Unable to initialize parent mode.' : 'Không thể khởi tạo parent mode.'));
        setActiveTab('password');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handlePasskeyVerify = async () => {
    if (!window.PublicKeyCredential) {
      setErrorMessage(isEnglish ? 'This browser does not support Passkey.' : 'Trình duyệt này chưa hỗ trợ Passkey.');
      return;
    }

    setIsVerifyingPasskey(true);
    setErrorMessage('');

    try {
      const optionsResponse = await fetch('/api/webauthn/authenticate/options', {
        method: 'POST',
        credentials: 'include',
      });
      const optionsPayload = await optionsResponse.json().catch(() => ({}));

      if (!optionsResponse.ok) {
        throw new Error(optionsPayload?.message || (isEnglish ? 'Unable to start Passkey verification.' : 'Không thể bắt đầu xác minh Passkey.'));
      }

      const publicKey = normalizeRequestOptions((optionsPayload?.data || optionsPayload).options);
      const stateToken = (optionsPayload?.data || optionsPayload).stateToken as string;
      const credential = await navigator.credentials.get({ publicKey });

      if (!credential) {
        throw new Error(isEnglish ? 'The device did not return a Passkey credential.' : 'Thiết bị không trả về Passkey credential.');
      }

      const verifyResponse = await fetch('/api/webauthn/authenticate/verify', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credential: serializeCredential(credential as PublicKeyCredential),
          stateToken,
        }),
      });
      const verifyPayload = await verifyResponse.json().catch(() => ({}));

      if (!verifyResponse.ok) {
        throw new Error(verifyPayload?.message || (isEnglish ? 'Passkey verification failed.' : 'Xác minh Passkey thất bại.'));
      }

      playAppSound(800, 'sine', 0.14);
      onSuccess();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : (isEnglish ? 'Passkey verification failed.' : 'Xác minh Passkey thất bại.'));
    } finally {
      setIsVerifyingPasskey(false);
    }
  };

  const handlePasswordVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedPassword = passwordInput.trim();
    if (!trimmedPassword) {
      setErrorMessage(isEnglish ? 'Enter the parent password first.' : 'Hãy nhập mật khẩu phụ huynh trước.');
      return;
    }

    setIsVerifyingPassword(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/parent-gate/verify-password', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: trimmedPassword }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          formatApiError(
            payload,
            isEnglish ? 'The parent password is incorrect.' : 'Mật khẩu phụ huynh không đúng.',
            isEnglish,
          ),
        );
      }

      playAppSound(800, 'sine', 0.1);
      onSuccess();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : (isEnglish ? 'The parent password is incorrect.' : 'Mật khẩu phụ huynh không đúng.'));
      setPasswordInput('');
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  const passkeyReady = hasPlatformAuthenticator && passkeySummary.hasPasskey;
  const shouldGuideToSetup = hasPlatformAuthenticator && !passkeySummary.hasPasskey;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className={`relative flex w-full max-w-md flex-col gap-4 overflow-hidden rounded-[28px] border p-6 text-left shadow-2xl ${
          isLight ? 'border-slate-200 bg-white text-slate-800' : 'border-[#37464f] bg-[#1a2c35] text-white'
        }`}
      >
        <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-emerald-500/10 blur-2xl" />

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-emerald-500/40 bg-emerald-500/20 text-lg">
              🔐
            </div>
            <div>
              <h2 className="text-base font-black uppercase tracking-tight">{isEnglish ? 'Parent verification' : 'Xác thực phụ huynh'}</h2>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">{isEnglish ? 'Secure unlock for parent mode' : 'Mở khóa an toàn cho parent mode'}</p>
            </div>
          </div>

          <button
            onClick={() => {
              playAppSound(200, 'triangle', 0.1);
              onClose();
            }}
            className={`cursor-pointer rounded-full p-1.5 transition ${
              isLight ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-black/20 text-gray-400 hover:bg-black/40 hover:text-white'
            }`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className={`flex gap-2 rounded-xl border p-2.5 text-[10.5px] leading-normal ${
            isLight ? 'border-amber-100 bg-amber-50 text-amber-800' : 'border-amber-900/30 bg-amber-950/20 text-amber-300'
          }`}
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
          <p>{isEnglish ? 'Only adults should enter this area. If Passkey is enabled, the device will invoke real Face ID, Touch ID, or Windows Hello.' : 'Chỉ người lớn mới nên vào khu vực này. Nếu đã bật Passkey, thiết bị sẽ gọi Face ID, Touch ID hoặc Windows Hello thật.'}</p>
        </div>

        <div className={`flex gap-1 rounded-xl p-1 ${isLight ? 'bg-slate-100' : 'bg-black/30'}`}>
          <button
            type="button"
            onClick={() => {
              playAppSound(150, 'sine', 0.05);
              setActiveTab('passkey');
            }}
            className={`flex-1 rounded-lg px-1 py-2 text-center text-[11px] font-black tracking-tight transition ${
              activeTab === 'passkey'
                ? isLight
                  ? 'bg-white text-emerald-600 shadow-sm'
                  : 'bg-[#37464f] text-white shadow'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Passkey / Face ID
          </button>

          <button
            type="button"
            onClick={() => {
              playAppSound(150, 'sine', 0.05);
              setActiveTab('password');
            }}
            className={`flex-1 rounded-lg px-1 py-2 text-center text-[11px] font-black tracking-tight transition ${
              activeTab === 'password'
                ? isLight
                  ? 'bg-white text-violet-600 shadow-sm'
                  : 'bg-[#37464f] text-white shadow'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            {isEnglish ? 'Backend password' : 'Mật khẩu backend'}
          </button>
        </div>

        <div className="flex min-h-[220px] flex-col justify-center">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <LoaderCircle className="h-8 w-8 animate-spin text-emerald-400" />
              <p className="text-xs font-semibold text-gray-400">{isEnglish ? 'Checking the parent account Passkey setup...' : 'Đang kiểm tra cấu hình Passkey của tài khoản phụ huynh...'}</p>
            </div>
          ) : (
            <>
              {activeTab === 'passkey' && (
                <div className="space-y-4">
                  <div className={`rounded-[18px] border p-4 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-[#37464f] bg-black/20'}`}>
                    <div className="flex items-start gap-3">
                      <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 p-3">
                        <Fingerprint className="h-6 w-6 text-emerald-400" />
                      </div>
                      <div className="space-y-1">
                        <h3 className={`text-sm font-black ${isLight ? 'text-slate-800' : 'text-white'}`}>{isEnglish ? 'Unlock with real Passkey' : 'Mở khóa bằng Passkey thật'}</h3>
                        <p className="text-[11px] leading-relaxed text-gray-400">
                          {isEnglish ? 'This flow uses operating-system biometrics. The web app does not read face data directly; it only asks the OS to verify for you.' : 'Luồng này dùng sinh trắc học của hệ điều hành. Web app không tự đọc dữ liệu khuôn mặt, mà chỉ yêu cầu hệ điều hành xác minh giúp.'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
                      <div className="rounded-[12px] border border-[#37464f] bg-black/20 px-3 py-2">
                        <div className="text-gray-500">{isEnglish ? 'Current device' : 'Thiết bị hiện tại'}</div>
                        <div className={`font-black ${hasPlatformAuthenticator ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {hasPlatformAuthenticator ? (isEnglish ? 'Passkey supported' : 'Hỗ trợ Passkey') : isEnglish ? 'Passkey not supported' : 'Chưa hỗ trợ Passkey'}
                        </div>
                      </div>
                      <div className="rounded-[12px] border border-[#37464f] bg-black/20 px-3 py-2">
                        <div className="text-gray-500">{isEnglish ? 'Parent account' : 'Tài khoản phụ huynh'}</div>
                        <div className={`font-black ${passkeySummary.hasPasskey ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {passkeySummary.hasPasskey ? (isEnglish ? `${passkeySummary.count} Passkey enabled` : `${passkeySummary.count} Passkey đã bật`) : isEnglish ? 'No Passkey yet' : 'Chưa có Passkey'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {!passkeyReady && (
                    <div className="rounded-[12px] border border-amber-900/30 bg-amber-950/20 p-3 text-[11px] font-semibold text-amber-300">
                      {!hasPlatformAuthenticator
                        ? isEnglish
                          ? 'This device does not support Passkey. Use the backend password or switch to a device with Face ID, Touch ID, or Windows Hello.'
                          : 'Thiết bị này chưa hỗ trợ Passkey. Hãy dùng mật khẩu backend hoặc đổi sang thiết bị có Face ID, Touch ID hoặc Windows Hello.'
                        : isEnglish
                          ? 'This account has not registered a Passkey yet. Open Settings to set up biometrics first.'
                          : 'Tài khoản này chưa được đăng ký Passkey. Hãy vào Cài đặt để thiết lập khuôn mặt trước.'}
                    </div>
                  )}

                  {shouldGuideToSetup && (
                    <button
                      type="button"
                      onClick={() => {
                        playAppSound(420, 'triangle', 0.08);
                        onSetupRequired();
                      }}
                      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#1cb0f6]/40 bg-[#1cb0f6]/15 px-4 py-3 text-xs font-extrabold uppercase text-[#54cbfd] transition hover:bg-[#1cb0f6]/25"
                    >
                      <Fingerprint className="h-4 w-4" />
                      {isEnglish ? 'Open settings to set up biometrics' : 'Vào cài đặt để thiết lập khuôn mặt'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void handlePasskeyVerify()}
                    disabled={!passkeyReady || isVerifyingPasskey}
                    className="duo-btn-green flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-extrabold uppercase text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isVerifyingPasskey ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
                    {isVerifyingPasskey ? (isEnglish ? 'Verifying...' : 'Đang xác minh...') : isEnglish ? 'Unlock with Passkey' : 'Mở khóa bằng Passkey'}
                  </button>
                </div>
              )}

              {activeTab === 'password' && (
                <form onSubmit={(event) => void handlePasswordVerify(event)} className="space-y-4">
                  <label className="block text-[11px] font-extrabold uppercase tracking-wide text-violet-400">
                    {isEnglish ? 'Enter the parent password stored in backend' : 'Nhập mật khẩu phụ huynh được lưu ở backend'}
                  </label>
                  <div className={`rounded-[18px] border p-4 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-[#37464f] bg-black/20'}`}>
                    <div className="mb-3 flex items-center gap-2 text-[11px] text-gray-400">
                      <KeyRound className="h-4 w-4 text-violet-400" />
                      {isEnglish ? 'This is the fallback path when the device cannot use Passkey yet.' : 'Đây là phương án dự phòng khi thiết bị chưa dùng được Passkey.'}
                    </div>
                    <input
                      type="password"
                      autoFocus
                      placeholder={isEnglish ? 'Enter the parent password...' : 'Nhập mật khẩu phụ huynh...'}
                      value={passwordInput}
                      onChange={(event) => {
                        setPasswordInput(event.target.value);
                        setErrorMessage('');
                      }}
                      className={`w-full rounded-xl border border-[#37464f] bg-black/15 px-4 py-2.5 text-xs font-mono transition focus:border-violet-500 focus:outline-none ${
                        isLight ? 'bg-white text-slate-800' : 'text-white'
                      }`}
                    />
                  </div>

                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        playAppSound(200, 'triangle', 0.1);
                        onClose();
                      }}
                      className={`flex-1 cursor-pointer rounded-xl border border-b-4 px-4 py-2.5 text-center text-xs font-black uppercase transition ${
                        isLight ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100' : 'border-[#37464f] bg-[#15242c] text-gray-300 hover:bg-[#1a2c35]'
                      }`}
                    >
                      {isEnglish ? 'Close' : 'Đóng lại'}
                    </button>
                    <button
                      type="submit"
                      disabled={isVerifyingPassword}
                      className="duo-btn-green flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-extrabold uppercase text-white disabled:opacity-60"
                    >
                      {isVerifyingPassword ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 stroke-[3]" />}
                      {isEnglish ? 'Confirm unlock' : 'Xác nhận mở khóa'}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>

        <AnimatePresence>
          {errorMessage && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="rounded-lg border border-rose-900/30 bg-rose-950/20 px-3 py-2 text-center text-[11px] font-bold leading-relaxed text-rose-400"
            >
              ⚠️ {errorMessage}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

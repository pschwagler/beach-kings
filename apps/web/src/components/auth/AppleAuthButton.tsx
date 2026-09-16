'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import api, { getStoredTokens } from '../../services/api';

export interface AppleAuthorization { id_token: string; code: string; state: string }
interface AppleConfig { clientId: string; redirectURI: string; state: string; nonce: string }
declare global {
  interface Window {
    AppleID?: { auth: {
      init: (config: AppleConfig & { scope: string; usePopup: boolean }) => void;
      signIn: () => Promise<{ authorization: AppleAuthorization }>;
    } };
  }
}

export function providerErrorMessage(error: unknown): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string') return detail.message;
  return 'Authorization could not be completed. Please try again.';
}

/** Prepare before clicking so signIn remains inside the browser's user gesture. */
export default function AppleAuthButton({ onSuccess, onError, onBusyChange, disabled = false, linking = false }: {
  onSuccess: (authorization: AppleAuthorization, signal: AbortSignal) => Promise<void>;
  onError: (message: string) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  linking?: boolean;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [config, setConfig] = useState<AppleConfig | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prepareFailed, setPrepareFailed] = useState(false);
  const [sdkFailed, setSdkFailed] = useState(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const authorizationRequest = useRef<AbortController | null>(null);
  const prepareRequest = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1; authorizationRequest.current?.abort(); prepareRequest.current?.abort(); }; }, []);
  const prepare = useCallback(async () => {
    const currentGeneration = ++generation.current;
    prepareRequest.current?.abort();
    const controller = new AbortController();
    prepareRequest.current = controller;
    try {
      const capability = await api.get('/api/auth/apple/web/config', { signal: controller.signal });
      if (!mounted.current || generation.current !== currentGeneration) return;
      setEnabled(capability.data.enabled);
      if (!capability.data.enabled) return;
      const response = await api.post(`/api/auth/apple/web/${linking ? 'link/' : ''}start`, {}, { withCredentials: true, signal: controller.signal });
      if (!mounted.current || generation.current !== currentGeneration) return;
      setConfig(response.data);
    } catch {
      if (mounted.current && generation.current === currentGeneration && !controller.signal.aborted) setPrepareFailed(true);
    }
  }, [linking]);
  // State changes follow API completion; stale/unmounted requests are discarded.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void prepare(); }, [prepare]);

  const signIn = async () => {
    if (!config || !window.AppleID || busy) return;
    const accessToken = getStoredTokens().accessToken;
    const controller = new AbortController();
    authorizationRequest.current = controller;
    setBusy(true);
    onBusyChange?.(true);
    try {
      window.AppleID.auth.init({ ...config, scope: 'name email', usePopup: true });
      const { authorization } = await window.AppleID.auth.signIn();
      if (!mounted.current) return;
      if (getStoredTokens().accessToken !== accessToken) throw new Error('Account changed during authorization');
      if (authorization.state !== config.state) throw new Error('Invalid authorization state');
      await onSuccess(authorization, controller.signal);
    } catch (error) {
      if (!mounted.current) return;
      const code = (error as { error?: string })?.error;
      onError(code === 'popup_closed_by_user' || code === 'user_cancelled_authorize'
        ? 'Apple sign-in was cancelled. Your account has not changed.'
        : providerErrorMessage(error));
      await prepare();
    } finally {
      if (mounted.current) setBusy(false);
      onBusyChange?.(false);
    }
  };

  if (enabled === false) return <p className="profile-page__help-text">Apple sign-in on the web is not available yet. You can use another sign-in method or the iOS app.</p>;
  if (sdkFailed) return <p role="alert">Apple could not load. Check your connection, then <button type="button" className="auth-modal__footer-link" onClick={() => window.location.reload()}>reload this page</button> to try again.</p>;
  return <div className="auth-modal__google-wrapper">
    {enabled && <Script src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js" onReady={() => setSdkReady(true)} onError={() => setSdkFailed(true)} />}
    {prepareFailed ? <button type="button" className="auth-modal__footer-link" onClick={() => { setConfig(null); setPrepareFailed(false); void prepare(); }}>Retry Apple sign-in</button>
      : <button type="button" className="auth-modal__submit" onClick={() => void signIn()} disabled={disabled || busy || !config || !sdkReady}>{busy ? 'Connecting…' : linking ? 'Connect Apple' : 'Sign in with Apple'}</button>}
  </div>;
}

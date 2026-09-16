'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api, { getStoredTokens } from '../../services/api';
import GoogleAuthButton from './GoogleAuthButton';
import AppleAuthButton, { providerErrorMessage } from './AppleAuthButton';

export default function ConnectedAccounts() {
  const { user, fetchCurrentUser } = useAuth();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (!user) return null;
  return <section aria-labelledby="connected-accounts-heading">
    <h3 id="connected-accounts-heading" className="profile-page__section-title">Sign-in methods</h3>
    <p className="profile-page__help-text">Connect Apple or Google to this account, even if their email is different. Your primary email stays the same.</p>
    <p>Password: {user.has_password ? 'Available' : 'Not set'}</p>
    <p>Text-code login: {user.phone_number ? 'Available with your verified phone number' : 'Add a verified phone number in the mobile app to enable'}</p>
    <div><p>Google: {user.google_connected ? 'Connected' : 'Not connected'}</p>
      {!user.google_connected && (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? <GoogleAuthButton disabled={busy} onSuccess={async ({ credential }) => {
        if (busy) return;
        const initiatingAccessToken = getStoredTokens().accessToken;
        setBusy(true); setMessage('');
        try {
          await api.post('/api/auth/google/add', { id_token: credential, expected_user_id: user.id });
          if (!mounted.current || getStoredTokens().accessToken !== initiatingAccessToken) return;
          await fetchCurrentUser();
          if (mounted.current && getStoredTokens().accessToken === initiatingAccessToken) setMessage('Google connected.');
        }
        catch (error) { if (mounted.current && getStoredTokens().accessToken === initiatingAccessToken) setMessage(providerErrorMessage(error)); }
        finally { if (mounted.current) setBusy(false); }
      }} onError={() => setMessage('Google authorization could not be completed. Please try again.')} /> : <p>Google connection is currently unavailable.</p>)}
    </div>
    <div><p>Apple: {user.apple_connected ? 'Connected' : 'Not connected'}</p>
      {!user.apple_connected && <AppleAuthButton linking disabled={busy} onBusyChange={setBusy} onError={setMessage} onSuccess={async (authorization, signal) => {
        const initiatingAccessToken = getStoredTokens().accessToken;
        await api.post('/api/auth/apple/web/link/complete', { id_token: authorization.id_token, authorization_code: authorization.code, state: authorization.state }, { withCredentials: true, signal });
        if (!mounted.current || getStoredTokens().accessToken !== initiatingAccessToken) return;
        await fetchCurrentUser();
        if (mounted.current && getStoredTokens().accessToken === initiatingAccessToken) setMessage('Apple connected.');
      }} />}
    </div>
    {message && <p role="status">{message}</p>}
  </section>;
}

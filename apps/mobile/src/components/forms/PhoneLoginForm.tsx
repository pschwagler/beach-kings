import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, Input } from '@/components/ui';
import FormError from './FormError';
import { useAuth } from '@/contexts/AuthContext';
import { phoneSchema } from '@/lib/validators';
import { getApiResponseErrorMessage } from '@/lib/apiError';

/** Existing-account login only: sending a code never creates an account. */
export default function PhoneLoginForm({ onCancel }: { readonly onCancel: () => void }) {
  const { sendLoginCode, loginWithSms, login } = useAuth();
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState(0);
  const busyRef = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  const run = async (operation: () => Promise<void>, fallback: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch (failure) {
      if (mounted.current) setError(getApiResponseErrorMessage(failure, fallback));
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const normalizedPhone = () => {
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) {
      setError('Enter a valid US or Canadian phone number, including area code.');
      return null;
    }
    const digits = parsed.data.replace(/\D/g, '');
    return digits.length === 10 ? `+1${digits}` : `+${digits}`;
  };

  const send = () => {
    const number = sentTo ?? normalizedPhone();
    if (!number || remaining > 0) return;
    void run(async () => {
      await sendLoginCode(number);
      if (!mounted.current) return;
      setSentTo(number);
      setCode('');
      setRemaining(60);
    }, 'Could not send a code. Please try again shortly.');
  };

  const submit = () => {
    if (usePassword) {
      const number = normalizedPhone();
      if (!number) return;
      if (!password) { setError('Enter your password.'); return; }
      void run(() => login({ phoneNumber: number, password }), 'Could not log in. Check your phone number and password.');
    } else if (sentTo && /^\d{6}$/.test(code)) {
      void run(() => loginWithSms(sentTo, code), 'The code is invalid or expired. Try again or request a new code.');
    } else {
      setError('Enter the six-digit code from your text message.');
    }
  };

  return (
    <View className="bg-surface rounded-card p-lg gap-md">
      <AppText className="text-body font-semibold">Log in with phone</AppText>
      <AppText className="text-footnote text-muted">
        Use the verified number attached to your account. If you haven’t added one, log in with email, Apple, or Google and add a phone in Settings.
      </AppText>
      {sentTo ? (
        <>
          <AppText className="text-footnote text-muted">If this number is eligible, a code will arrive by text.</AppText>
          <Input placeholder="6-digit code" value={code}
            onChangeText={(value) => { if (!busy) setCode(value.replace(/\D/g, '').slice(0, 6)); }}
            keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp"
            onSubmitEditing={submit} />
        </>
      ) : (
        <Input placeholder="Phone number" value={phone}
          onChangeText={(value) => { if (!busy) setPhone(value); }} keyboardType="phone-pad" autoComplete="tel"
          textContentType="telephoneNumber" />
      )}
      {usePassword && <Input placeholder="Password" value={password} onChangeText={(value) => { if (!busy) setPassword(value); }}
        secureTextEntry showPasswordToggle autoComplete="password" textContentType="password"
        onSubmitEditing={submit} />}
      <FormError message={error} />
      <Button title={sentTo || usePassword ? 'Log In' : 'Send login code'}
        onPress={sentTo || usePassword ? submit : send} variant="secondary" loading={busy} disabled={busy} />
      {sentTo ? (
        <>
          <Button title={remaining ? `Resend code in ${remaining}s` : 'Resend code'}
            onPress={send} variant="ghost" disabled={busy || remaining > 0} />
          <Button title="Use another number" variant="ghost" disabled={busy}
            onPress={() => { setSentTo(null); setCode(''); setRemaining(0); setError(''); }} />
        </>
      ) : (
        <Button title={usePassword ? 'Use a text message code' : 'Use phone and password'}
          variant="ghost" disabled={busy} onPress={() => { setUsePassword(!usePassword); setPassword(''); setError(''); }} />
      )}
      <Button title="Back to email login" variant="ghost" disabled={busy} onPress={onCancel} />
    </View>
  );
}

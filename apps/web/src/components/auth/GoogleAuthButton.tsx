'use client';

import { useEffect, useRef, useState } from 'react';
import { useGoogleOAuth } from '@react-oauth/google';
import { getStoredTokens } from '../../services/api';

export interface GoogleCredentialResponse {
  credential?: string;
  clientId?: string;
  select_by?: string;
  state?: string;
}

interface GoogleAuthButtonProps {
  onSuccess: (credentialResponse: GoogleCredentialResponse) => void;
  onError: () => void;
  text?: 'signin_with' | 'signup_with';
  disabled?: boolean;
}

interface GisWindow extends Window {
  google?: {
    accounts: {
      id: {
        initialize: (config: {
          client_id: string;
          callback: (response: GoogleCredentialResponse) => void;
        }) => void;
        renderButton: (
          element: HTMLElement,
          options: {
            type: 'standard';
            theme: 'outline';
            size: 'large';
            text: 'signin_with' | 'signup_with';
            shape: 'rectangular';
            width: number;
            state: string;
            click_listener: () => void;
          },
        ) => void;
      };
    };
  };
}

// GIS button width must be a pixel value between 200 and 400 — percentages
// such as "100%" are rejected by the provider.
const MIN_BUTTON_WIDTH = 200;
const MAX_BUTTON_WIDTH = 400;

// Initialize once, but dispatch by the provider-returned button state. A popup
// must never deliver its credential to a different mounted login/link button.
let gisInitialized = false;
const buttonHandlers = new Map<string, (response: GoogleCredentialResponse) => void>();

export default function GoogleAuthButton({ onSuccess, onError, text = 'signin_with', disabled = false }: GoogleAuthButtonProps) {
  const { clientId, scriptLoadedSuccessfully } = useGoogleOAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [buttonWidth, setButtonWidth] = useState(0);
  const callbacks = useRef({ onSuccess, onError });

  useEffect(() => {
    callbacks.current = { onSuccess, onError };
  });

  // Measure the container so renderButton receives a valid pixel width.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const measured = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (measured > 0) {
        setButtonWidth(Math.min(Math.max(measured, MIN_BUTTON_WIDTH), MAX_BUTTON_WIDTH));
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const google = (window as GisWindow).google;
    const container = containerRef.current;
    if (!scriptLoadedSuccessfully || !google || !container || buttonWidth === 0) return;

    if (!gisInitialized) {
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: GoogleCredentialResponse) => {
          if (response.state) buttonHandlers.get(response.state)?.(response);
        },
      });
      gisInitialized = true;
    }

    const state = crypto.randomUUID();
    let pending: { accessToken: string | null; onSuccess: typeof onSuccess; onError: typeof onError } | null = null;
    buttonHandlers.set(state, (response) => {
      const operation = pending;
      pending = null;
      if (!operation) return;
      if (!response.credential || getStoredTokens().accessToken !== operation.accessToken) {
        operation.onError();
        return;
      }
      operation.onSuccess(response);
    });
    container.innerHTML = '';
    google.accounts.id.renderButton(container, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text,
      shape: 'rectangular',
      width: buttonWidth,
      state,
      click_listener: () => { pending = { ...callbacks.current, accessToken: getStoredTokens().accessToken }; },
    });
    return () => { buttonHandlers.delete(state); };
  }, [scriptLoadedSuccessfully, clientId, text, buttonWidth]);

  return <div ref={containerRef} inert={disabled} aria-disabled={disabled || undefined} />;
}

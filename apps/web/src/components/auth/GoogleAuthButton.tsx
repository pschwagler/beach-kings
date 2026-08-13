'use client';

import { useEffect, useRef, useState } from 'react';
import { useGoogleOAuth } from '@react-oauth/google';

export interface GoogleCredentialResponse {
  credential?: string;
  clientId?: string;
  select_by?: string;
}

interface GoogleAuthButtonProps {
  onSuccess: (credentialResponse: GoogleCredentialResponse) => void;
  onError: () => void;
  text?: 'signin_with' | 'signup_with';
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

// google.accounts.id.initialize() may only run once per page load; further
// calls trigger "initialized multiple times" warnings and only the last call
// takes effect. Handlers live in module scope so the single registered
// callback always dispatches to the currently mounted button (only one
// Google button is ever visible at a time).
let gisInitialized = false;
const activeHandlers: {
  onSuccess?: (response: GoogleCredentialResponse) => void;
  onError?: () => void;
} = {};

export default function GoogleAuthButton({ onSuccess, onError, text = 'signin_with' }: GoogleAuthButtonProps) {
  const { clientId, scriptLoadedSuccessfully } = useGoogleOAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [buttonWidth, setButtonWidth] = useState(0);

  // Point the module-scope handlers at this instance.
  useEffect(() => {
    activeHandlers.onSuccess = onSuccess;
    activeHandlers.onError = onError;
    return () => {
      if (activeHandlers.onSuccess === onSuccess) {
        activeHandlers.onSuccess = undefined;
        activeHandlers.onError = undefined;
      }
    };
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
          if (!response?.credential) {
            activeHandlers.onError?.();
            return;
          }
          activeHandlers.onSuccess?.(response);
        },
      });
      gisInitialized = true;
    }

    container.innerHTML = '';
    google.accounts.id.renderButton(container, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text,
      shape: 'rectangular',
      width: buttonWidth,
    });
  }, [scriptLoadedSuccessfully, clientId, text, buttonWidth]);

  return <div ref={containerRef} />;
}

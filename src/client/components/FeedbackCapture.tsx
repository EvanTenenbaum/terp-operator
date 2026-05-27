import { useEffect } from 'react';

type CrikketCaptureApi = {
  init: (options: { key: string; host?: string; zIndex?: number }) => void;
  isInitialized?: () => boolean;
};

type FeedbackCaptureConfig = {
  enabled?: boolean;
  host?: string;
  key?: string;
  scriptSrc?: string;
};

type ClientConfig = {
  feedbackCapture?: FeedbackCaptureConfig;
};

declare global {
  interface Window {
    CrikketCapture?: CrikketCaptureApi;
  }
}

const DEFAULT_LOCAL_KEY = 'crk_terp_operator_feedback_local';
const DEFAULT_LOCAL_HOST = 'http://localhost:3000';
const DEFAULT_SCRIPT_SRC = '/vendor/crikket/capture.global.js';
const SCRIPT_ID = 'crikket-capture-sdk';

let scriptPromise: Promise<void> | null = null;
let didInit = false;

function isEnabled() {
  return import.meta.env.VITE_CRIKKET_ENABLED !== 'false';
}

async function loadRuntimeConfig() {
  const response = await fetch('/api/client-config', { credentials: 'same-origin' });
  if (!response.ok) return {};
  const config = (await response.json()) as ClientConfig;
  return config.feedbackCapture ?? {};
}

function loadCrikketScript(src: string) {
  if (window.CrikketCapture) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export function FeedbackCapture() {
  useEffect(() => {
    let cancelled = false;

    loadRuntimeConfig()
      .catch((): FeedbackCaptureConfig => ({}))
      .then((runtimeConfig) => {
        if (cancelled) return;
        const enabled = runtimeConfig.enabled ?? isEnabled();
        if (!enabled) return;

        const key = runtimeConfig.key || import.meta.env.VITE_CRIKKET_KEY || (import.meta.env.DEV ? DEFAULT_LOCAL_KEY : '');
        if (!key) return;

        const host = runtimeConfig.host || import.meta.env.VITE_CRIKKET_HOST || (import.meta.env.DEV ? DEFAULT_LOCAL_HOST : undefined);
        const scriptSrc = runtimeConfig.scriptSrc || import.meta.env.VITE_CRIKKET_SCRIPT_SRC || DEFAULT_SCRIPT_SRC;

        return loadCrikketScript(scriptSrc).then(() => {
          if (cancelled || didInit) return;
          const crikket = window.CrikketCapture;
          if (!crikket || crikket.isInitialized?.()) return;

          crikket.init({ key, host, zIndex: 2147483000 });
          didInit = true;
        });
      })
      .catch((error) => {
        console.warn('[feedback] Crikket capture unavailable', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

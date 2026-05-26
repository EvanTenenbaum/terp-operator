import { useEffect } from 'react';

type CrikketCaptureApi = {
  init: (options: { key: string; host?: string; zIndex?: number }) => void;
  isInitialized?: () => boolean;
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
    if (!isEnabled()) return;

    const key = import.meta.env.VITE_CRIKKET_KEY || (import.meta.env.DEV ? DEFAULT_LOCAL_KEY : '');
    if (!key) return;

    const host = import.meta.env.VITE_CRIKKET_HOST || (import.meta.env.DEV ? DEFAULT_LOCAL_HOST : undefined);
    const scriptSrc = import.meta.env.VITE_CRIKKET_SCRIPT_SRC || DEFAULT_SCRIPT_SRC;

    let cancelled = false;
    loadCrikketScript(scriptSrc)
      .then(() => {
        if (cancelled || didInit) return;
        const crikket = window.CrikketCapture;
        if (!crikket || crikket.isInitialized?.()) return;

        crikket.init({ key, host, zIndex: 2147483000 });
        didInit = true;
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

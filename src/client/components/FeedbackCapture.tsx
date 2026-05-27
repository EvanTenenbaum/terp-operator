import { useEffect } from 'react';

type CrikketCaptureApi = {
  init: (options: { key: string; host?: string; zIndex?: number }) => void;
  isInitialized?: () => boolean;
};

type FeedbackCapturePosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

type FeedbackCaptureConfig = {
  enabled?: boolean;
  host?: string;
  key?: string;
  scriptSrc?: string;
  position?: FeedbackCapturePosition;
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
const DEFAULT_POSITION: FeedbackCapturePosition = 'top-left';
const SCRIPT_ID = 'crikket-capture-sdk';
const POSITION_STYLE_ID = 'terp-crikket-position';
const POSITION_RETRY_LIMIT = 200;

const launcherPositionStyles: Record<FeedbackCapturePosition, string> = {
  'top-left': 'top: 24px !important; left: 24px !important; right: auto !important; bottom: auto !important;',
  'top-right': 'top: 24px !important; right: 24px !important; left: auto !important; bottom: auto !important;',
  'bottom-left': 'bottom: 24px !important; left: 24px !important; top: auto !important; right: auto !important;',
  'bottom-right': 'bottom: 24px !important; right: 24px !important; top: auto !important; left: auto !important;'
};

let scriptPromise: Promise<void> | null = null;
let didInit = false;

function isEnabled() {
  return import.meta.env.VITE_CRIKKET_ENABLED !== 'false';
}

function normalizePosition(position?: string): FeedbackCapturePosition {
  if (
    position === 'top-left' ||
    position === 'top-right' ||
    position === 'bottom-left' ||
    position === 'bottom-right'
  ) {
    return position;
  }
  return DEFAULT_POSITION;
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

function findCrikketShadowRoot() {
  for (const element of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
    const root = element.shadowRoot;
    if (!root) continue;
    if (root.querySelector('.capture-launcher') || root.textContent?.includes('Report Issue')) {
      return root;
    }
  }
  return null;
}

function applyLauncherPosition(position: FeedbackCapturePosition, attempt = 0) {
  const root = findCrikketShadowRoot();
  if (!root) {
    if (attempt < POSITION_RETRY_LIMIT) {
      window.setTimeout(() => applyLauncherPosition(position, attempt + 1), 50);
    }
    return;
  }

  const existingStyle = root.querySelector<HTMLStyleElement>(`style[data-${POSITION_STYLE_ID}]`);
  const style = existingStyle ?? document.createElement('style');
  style.dataset.terpCrikketPosition = 'true';
  style.textContent = `.capture-launcher { ${launcherPositionStyles[position]} }`;
  if (!existingStyle) root.appendChild(style);
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
        const position = normalizePosition(runtimeConfig.position || import.meta.env.VITE_CRIKKET_POSITION);

        return loadCrikketScript(scriptSrc).then(() => {
          if (cancelled) return;
          const crikket = window.CrikketCapture;
          if (!crikket) return;

          if (!didInit && !crikket.isInitialized?.()) {
            crikket.init({ key, host, zIndex: 2147483000 });
            didInit = true;
          }
          applyLauncherPosition(position);
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

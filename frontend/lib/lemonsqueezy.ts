// Loads Lemon Squeezy's lemon.js on demand and opens their overlay checkout.
// The script is injected lazily so only users who actually start a purchase
// pay its cost — nothing is added to the root layout.

interface LemonSqueezyEvent {
  event?: string;
  data?: Record<string, unknown>;
}

declare global {
  interface Window {
    createLemonSqueezy?: () => void;
    LemonSqueezy?: {
      Setup: (options: { eventHandler: (event: LemonSqueezyEvent) => void }) => void;
      Url: { Open: (url: string) => void; Close: () => void };
    };
  }
}

const LEMON_JS_SRC = 'https://app.lemonsqueezy.com/js/lemon.js';

let loadPromise: Promise<void> | null = null;
let setupDone = false;
// Reassigned per purchase; Setup itself must only run once per page load.
let successCallback: (() => void) | null = null;

function loadLemonJs(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    if (window.LemonSqueezy) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = LEMON_JS_SRC;
    script.defer = true;
    script.onload = () => {
      window.createLemonSqueezy?.();
      resolve();
    };
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load the checkout script. Please try again.'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

export async function openLemonCheckout(
  url: string,
  { onSuccess }: { onSuccess: () => void }
): Promise<void> {
  await loadLemonJs();

  if (!window.LemonSqueezy) {
    throw new Error('Checkout is unavailable right now. Please try again.');
  }

  if (!setupDone) {
    window.LemonSqueezy.Setup({
      eventHandler: (event) => {
        if (event?.event === 'Checkout.Success') {
          successCallback?.();
        }
      },
    });
    setupDone = true;
  }

  successCallback = onSuccess;
  window.LemonSqueezy.Url.Open(url);
}

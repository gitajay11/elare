import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Registers the service worker. New builds install and activate on their own
 * (registerType: autoUpdate) and the page reloads onto the new version, so a
 * refresh always shows the latest deploy.
 */
export function ServiceWorker() {
  useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Also look for a new build every 30 minutes while the app stays open.
      if (registration) setInterval(() => registration.update(), 30 * 60 * 1000);
    },
  });
  return null;
}

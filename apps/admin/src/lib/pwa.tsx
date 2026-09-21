import { useRegisterSW } from 'virtual:pwa-register/react';

/** Registers the service worker; new builds activate automatically (registerType: autoUpdate). */
export function ServiceWorker() {
  useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => registration.update(), 30 * 60 * 1000);
    },
  });
  return null;
}

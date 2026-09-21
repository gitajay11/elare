import { useRegisterSW } from 'virtual:pwa-register/react';
import { UpdatePrompt } from '@elare/ui';

/** Registers the service worker and offers a refresh when a new build is waiting. */
export function ServiceWorker() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Look for a new build every hour while the app stays open.
      if (registration) setInterval(() => registration.update(), 60 * 60 * 1000);
    },
  });
  return <UpdatePrompt needRefresh={needRefresh} onUpdate={() => updateServiceWorker(true)} />;
}

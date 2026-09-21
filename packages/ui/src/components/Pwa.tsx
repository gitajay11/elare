import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { toast } from '../toast-store';

/** Thin banner while the device is offline; the precached shell keeps working, data calls will fail. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-ink px-4 py-2 text-center text-[12.5px] text-white">
      <WifiOff size={14} /> You’re offline — prices, stock and orders will refresh when you’re back.
    </div>
  );
}

export interface UpdatePromptProps {
  /** Whether a new build is waiting (from vite-plugin-pwa's useRegisterSW). */
  needRefresh: boolean;
  /** Activates the waiting service worker and reloads. */
  onUpdate: () => void;
}

/** Shows a one-time toast when a new version has been downloaded. */
export function UpdatePrompt({ needRefresh, onUpdate }: UpdatePromptProps) {
  useEffect(() => {
    if (needRefresh) toast({ title: 'A new version is ready', description: 'Refresh to get the latest.', action: { label: 'Refresh', onClick: onUpdate } });
  }, [needRefresh, onUpdate]);
  return null;
}

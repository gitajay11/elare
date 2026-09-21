import { useEffect, useState } from 'react';
import { Download, WifiOff } from 'lucide-react';
import { cn } from '@elare/utils';
import { Modal } from './Overlay';
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
    if (needRefresh) toast({ title: 'A new version is ready', description: 'Refresh to get the latest.', sticky: true, action: { label: 'Refresh', onClick: onUpdate } });
  }, [needRefresh, onUpdate]);
  return null;
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);
const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * Install state for the current browser. Chromium browsers fire
 * `beforeinstallprompt`, which we hold on to and trigger from our own button;
 * iOS Safari has no prompt API, so there we show the "Add to Home Screen" steps.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const ios = isIos();
  const canInstall = !installed && (deferred !== null || ios);
  const install = async () => {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') setDeferred(null);
    } else if (ios) {
      setShowIosHelp(true);
    }
  };
  return { canInstall, installed, install, ios, showIosHelp, closeIosHelp: () => setShowIosHelp(false) };
}

/** Step-by-step for iOS Safari, which has no install prompt. */
export function IosInstallHelp({ open, onClose, appName }: { open: boolean; onClose: () => void; appName: string }) {
  return (
    <Modal open={open} onClose={onClose} title={`Add ${appName} to your Home Screen`} size="sm">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-soft">
        <li>Tap the <span className="font-semibold text-ink">Share</span> button in Safari’s toolbar.</li>
        <li>Choose <span className="font-semibold text-ink">Add to Home Screen</span>.</li>
        <li>Tap <span className="font-semibold text-ink">Add</span>. {appName} opens like an app from then on.</li>
      </ol>
    </Modal>
  );
}

/**
 * "Install app" control. Renders nothing when the app is already installed or
 * the browser offers no way to install. `variant="icon"` for toolbars,
 * `variant="menu"` for menu rows, `variant="button"` for a pill.
 */
export function InstallButton({ appName, variant = 'menu', className }: { appName: string; variant?: 'icon' | 'menu' | 'button'; className?: string }) {
  const { canInstall, install, showIosHelp, closeIosHelp } = useInstallPrompt();
  if (!canInstall) return null;
  const help = <IosInstallHelp open={showIosHelp} onClose={closeIosHelp} appName={appName} />;
  if (variant === 'icon') {
    return (
      <>
        <button type="button" aria-label="Install app" title="Install app" onClick={install} className={cn('relative inline-grid h-10 w-10 place-items-center rounded-full text-ink transition-colors hover:bg-blush/70 focus-visible:outline-rose', className)}>
          <Download size={20} />
        </button>
        {help}
      </>
    );
  }
  if (variant === 'button') {
    return (
      <>
        <button type="button" onClick={install} className={cn('inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-[12.5px] font-semibold hover:border-rose hover:text-rose', className)}>
          <Download size={14} /> Install app
        </button>
        {help}
      </>
    );
  }
  return (
    <>
      <button type="button" onClick={install} className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-blush/50', className)}>
        <Download size={16} /> Install app
      </button>
      {help}
    </>
  );
}

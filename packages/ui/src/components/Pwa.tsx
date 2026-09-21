import { useEffect, useState, type ReactNode } from 'react';
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

/**
 * Install state for the current browser. Chromium browsers fire
 * `beforeinstallprompt`, which we hold on to and trigger from our own button;
 * everywhere else (iOS Safari, Firefox, or before Chrome decides to offer it)
 * we fall back to instructions.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [showHelp, setShowHelp] = useState(false);

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

  const install = async () => {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') setDeferred(null);
    } else {
      setShowHelp(true);
    }
  };
  return { installed, hasPrompt: deferred !== null, install, showHelp, closeHelp: () => setShowHelp(false) };
}

type Platform = 'ios' | 'android' | 'desktop';
const platform = (): Platform => {
  if (typeof navigator === 'undefined') return 'desktop';
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return 'ios';
  if (/android/i.test(navigator.userAgent)) return 'android';
  return 'desktop';
};

/** How to install when the browser gives us no prompt to trigger. */
export function InstallHelp({ open, onClose, appName }: { open: boolean; onClose: () => void; appName: string }) {
  const os = platform();
  const Step = ({ children }: { children: ReactNode }) => <li>{children}</li>;
  const B = ({ children }: { children: ReactNode }) => <span className="font-semibold text-ink">{children}</span>;
  return (
    <Modal open={open} onClose={onClose} title={`Install ${appName}`} size="sm">
      <p className="mb-3 text-sm text-ink-soft">Installed, {appName} opens from your home screen or desktop like any other app — no browser bars, faster loads.</p>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-soft">
        {os === 'ios' && (
          <>
            <Step>Open this page in <B>Safari</B> and tap the <B>Share</B> button.</Step>
            <Step>Choose <B>Add to Home Screen</B>.</Step>
            <Step>Tap <B>Add</B>.</Step>
          </>
        )}
        {os === 'android' && (
          <>
            <Step>Tap the <B>⋮ menu</B> in Chrome (top right).</Step>
            <Step>Choose <B>Install app</B> or <B>Add to Home screen</B>.</Step>
            <Step>Confirm with <B>Install</B>.</Step>
          </>
        )}
        {os === 'desktop' && (
          <>
            <Step>In <B>Chrome</B> or <B>Edge</B>, look for the <B>install icon</B> at the right end of the address bar.</Step>
            <Step>Or open the browser menu and choose <B>Install {appName}</B> (Edge: <B>Apps → Install this site as an app</B>).</Step>
            <Step>Confirm with <B>Install</B>.</Step>
          </>
        )}
      </ol>
    </Modal>
  );
}

/**
 * "Install app" control. Always visible until the app is running installed.
 * Click triggers the native prompt when the browser has offered one, and
 * otherwise opens step-by-step instructions for this platform.
 * `variant="icon"` for toolbars, `variant="menu"` for menu rows, `variant="button"` for a pill.
 */
export function InstallButton({ appName, variant = 'menu', className }: { appName: string; variant?: 'icon' | 'menu' | 'button'; className?: string }) {
  const { installed, install, showHelp, closeHelp } = useInstallPrompt();
  if (installed) return null;
  const help = <InstallHelp open={showHelp} onClose={closeHelp} appName={appName} />;
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

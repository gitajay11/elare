import { create } from 'zustand';

export interface Toast {
  id: number;
  title: string;
  description?: string;
  variant?: 'default' | 'success' | 'error' | 'gift';
  image?: string | null;
  action?: { label: string; onClick: () => void };
  /** Stays until dismissed (update prompts). */
}

interface ToastState {
  toasts: Toast[];
  toast: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let toastId = 0;

/** App-wide toast queue (max three visible). Shared by the storefront and the admin. */
export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  toast: (t) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.variant === 'error' ? 6000 : 3800);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = (t: Omit<Toast, 'id'>) => useToasts.getState().toast(t);

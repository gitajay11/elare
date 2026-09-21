import { create } from 'zustand';
import type { ProductCard } from '@/lib/types';

export interface Toast {
  id: number;
  title: string;
  description?: string;
  variant?: 'default' | 'success' | 'error' | 'gift';
  image?: string | null;
  action?: { label: string; onClick: () => void };
}

interface UiState {
  cartOpen: boolean;
  menuOpen: boolean;
  searchOpen: boolean;
  quickView: ProductCard | null;
  toasts: Toast[];
  openCart: () => void;
  closeCart: () => void;
  setMenu: (open: boolean) => void;
  setSearch: (open: boolean) => void;
  setQuickView: (p: ProductCard | null) => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let toastId = 0;

export const useUi = create<UiState>((set) => ({
  cartOpen: false,
  menuOpen: false,
  searchOpen: false,
  quickView: null,
  toasts: [],
  openCart: () => set({ cartOpen: true, menuOpen: false, searchOpen: false }),
  closeCart: () => set({ cartOpen: false }),
  setMenu: (menuOpen) => set({ menuOpen, searchOpen: false }),
  setSearch: (searchOpen) => set({ searchOpen, menuOpen: false }),
  setQuickView: (quickView) => set({ quickView }),
  toast: (t) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.variant === 'error' ? 6000 : 3800);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = (t: Omit<Toast, 'id'>) => useUi.getState().toast(t);

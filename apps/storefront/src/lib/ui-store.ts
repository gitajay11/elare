import { create } from 'zustand';
import { type ProductCard } from '@elare/types';

interface UiState {
  cartOpen: boolean;
  menuOpen: boolean;
  searchOpen: boolean;
  quickView: ProductCard | null;
  openCart: () => void;
  closeCart: () => void;
  setMenu: (open: boolean) => void;
  setSearch: (open: boolean) => void;
  setQuickView: (p: ProductCard | null) => void;
}

/** Storefront chrome state (drawers, overlays). Toasts live in @elare/ui. */
export const useUi = create<UiState>((set) => ({
  cartOpen: false,
  menuOpen: false,
  searchOpen: false,
  quickView: null,
  openCart: () => set({ cartOpen: true, menuOpen: false, searchOpen: false }),
  closeCart: () => set({ cartOpen: false }),
  setMenu: (menuOpen) => set({ menuOpen, searchOpen: false }),
  setSearch: (searchOpen) => set({ searchOpen, menuOpen: false }),
  setQuickView: (quickView) => set({ quickView }),
}));

export { toast } from '@elare/ui';

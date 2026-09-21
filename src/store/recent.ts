import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface RecentState {
  ids: string[];
  push: (productId: string) => void;
}

/** Recently viewed product ids, newest first, capped at 12. Lives only in this browser. */
export const useRecent = create<RecentState>()(
  persist(
    (set) => ({
      ids: [],
      push: (id) => set((s) => ({ ids: [id, ...s.ids.filter((x) => x !== id)].slice(0, 12) })),
    }),
    { name: 'elare-recent' },
  ),
);

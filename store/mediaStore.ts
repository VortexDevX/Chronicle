import { create } from "zustand";
import { MediaItem } from "@/types/media";

export interface GlobalStats {
  total: number;
  watching: number;
  completed: number;
  planned: number;
  onHold: number;
  dropped: number;
  avgRating: string | number;
  byType: Record<string, number>;
}

export interface AppState {
  username: string;
  authStatus: "loading" | "authenticated" | "unauthenticated";
  media: MediaItem[];
  mediaRev: number;
  search: string;
  filterType: string;
  filterStatus: string;
  sortBy: string;
  loading: boolean;
  loadingMore: boolean;
  page: number;
  limit: number;
  hasMore: boolean;
  total: number;
  bulkMode: boolean;
  bulkAction: "" | "status" | "increment" | "delete";
  selectedIds: Set<string>;
  pendingActionIds: Set<string>;
  globalStats: GlobalStats | null;
  activeRoute: "library" | "analytics" | "queue" | "droppedyard" | "shelves";
  modalOpen: boolean;
  modalMedia: MediaItem | null;
  settingsOpen: boolean;
  
  // Actions
  setAuth: (status: "loading" | "authenticated" | "unauthenticated", username?: string) => void;
  setMedia: (media: MediaItem[], total: number, hasMore: boolean, replace?: boolean) => void;
  updateFilters: (updates: Partial<AppState>) => void;
  toggleBulkMode: (mode: boolean) => void;
  setBulkAction: (action: "" | "status" | "increment" | "delete") => void;
  toggleSelection: (id: string, select?: boolean) => void;
  clearSelection: () => void;
  setLoading: (loading: boolean, loadingMore?: boolean) => void;
  setPendingAction: (id: string, isPending: boolean) => void;
  setGlobalStats: (stats: GlobalStats | null) => void;
  setActiveRoute: (route: "library" | "analytics" | "queue" | "droppedyard" | "shelves") => void;
  openModal: (media?: MediaItem | null) => void;
  closeModal: () => void;
  refreshMedia: () => void;
  openSettings: () => void;
  closeSettings: () => void;
}

export const useMediaStore = create<AppState>((set, get) => ({
  username: "",
  authStatus: "loading",
  media: [],
  mediaRev: 0,
  search: "",
  filterType: "",
  filterStatus: "",
  sortBy: "last_updated",
  loading: false,
  loadingMore: false,
  page: 1,
  limit: 24,
  hasMore: false,
  total: 0,
  bulkMode: false,
  bulkAction: "",
  selectedIds: new Set<string>(),
  pendingActionIds: new Set<string>(),
  globalStats: null,
  activeRoute: "library",
  modalOpen: false,
  modalMedia: null,
  settingsOpen: false,

  setAuth: (status, username) => {
    set({ authStatus: status, username: username || "" });
  },

  setMedia: (media, total, hasMore, replace = false) => set((state) => ({
    media: replace ? media : [...state.media, ...media],
    total,
    hasMore,
  })),

  updateFilters: (updates) => set((state) => {
    const changed = Object.entries(updates).some(
      ([key, value]) => state[key as keyof AppState] !== value,
    );
    return changed ? { ...state, ...updates } : state;
  }),

  toggleBulkMode: (bulkMode) => set({ bulkMode, selectedIds: new Set(), bulkAction: "" }),
  
  setBulkAction: (bulkAction) => set({ bulkAction }),
  
  toggleSelection: (id: string, forceSelect?: boolean) => set((state) => {
    const newSet = new Set(state.selectedIds);
    if (forceSelect !== undefined) {
      if (forceSelect) newSet.add(id);
      else newSet.delete(id);
    } else {
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
    }
    return { selectedIds: newSet };
  }),
  
  clearSelection: () => set({ selectedIds: new Set() }),

  setLoading: (loading, loadingMore = false) => set((state) => (
    state.loading === loading && state.loadingMore === loadingMore
      ? state
      : { loading, loadingMore }
  )),

  setPendingAction: (id, isPending) => set((state) => {
    const newSet = new Set(state.pendingActionIds);
    if (isPending) newSet.add(id);
    else newSet.delete(id);
    return { pendingActionIds: newSet };
  }),

  setGlobalStats: (globalStats) => set((state) => (
    state.globalStats === globalStats ? state : { globalStats }
  )),
  
  setActiveRoute: (activeRoute) => set((state) => (
    state.activeRoute === activeRoute ? state : { activeRoute }
  )),

  openModal: (media = null) => set({ modalOpen: true, modalMedia: media }),
  
  closeModal: () => set({ modalOpen: false, modalMedia: null }),

  refreshMedia: () => set((state) => ({ mediaRev: state.mediaRev + 1 })),

  openSettings: () => set({ settingsOpen: true }),
  
  closeSettings: () => set({ settingsOpen: false }),
}));

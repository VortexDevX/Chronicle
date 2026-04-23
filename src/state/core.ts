/** Reactive application state store – single source of truth (Phase 1) */
import type { MediaItem } from "../types/media.js";

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
  token: string;
  username: string;
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
  selectedIds: Set<string>;
  globalStats: GlobalStats | null;
}

/** Factory for initial state — single source of truth, no duplication */
export function createInitialState(overrides?: Partial<AppState>): AppState {
  return {
    token: "",
    username: "",
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
    selectedIds: new Set<string>(),
    globalStats: null,
    ...overrides,
  };
}

export class Store {
  private state: AppState;
  private listeners: Array<{
    selector?: (state: AppState) => any;
    listener: (val?: any) => void;
    lastValue?: any;
    isSimple: boolean;
  }> = [];

  constructor(initial: AppState) {
    this.state = { ...initial };
  }

  /** Read current state (never mutate directly) */
  get(): Readonly<AppState> {
    return this.state;
  }

  /** Immutable update – the ONLY way to change state */
  set(updater: (prev: AppState) => AppState): void {
    const newState = updater(this.state);
    if (newState === this.state) return;

    this.state = newState;
    this.notify();
  }

  /** Subscribe to state changes (used by UI) */
  subscribe(listener: () => void): () => void;
  subscribe<T>(
    selector: (state: AppState) => T,
    listener: (newVal: T) => void,
  ): () => void;
  subscribe<T>(
    arg1: ((state: AppState) => T) | (() => void),
    arg2?: (newVal: T) => void,
  ): () => void {
    if (arg2) {
      const selector = arg1 as (state: AppState) => T;
      const listener = arg2;
      const entry = {
        selector,
        listener,
        lastValue: selector(this.state),
        isSimple: false,
      };
      this.listeners.push(entry);
      return () => {
        this.listeners = this.listeners.filter((l) => l !== entry);
      };
    } else {
      const listener = arg1 as () => void;
      const entry = { listener, isSimple: true };
      this.listeners.push(entry);
      return () => {
        this.listeners = this.listeners.filter((l) => l !== entry);
      };
    }
  }

  private notify(): void {
    this.listeners.forEach((entry) => {
      if (entry.isSimple) {
        entry.listener();
      } else if (entry.selector) {
        const newVal = entry.selector(this.state);
        if (!this.isEqual(entry.lastValue, newVal)) {
          entry.lastValue = newVal;
          entry.listener(newVal);
        }
      }
    });
  }

  /** Smart equality: reference check for arrays, JSON for small objects */
  private isEqual(oldVal: any, newVal: any): boolean {
    if (oldVal === newVal) return true;
    if (oldVal == null || newVal == null) return oldVal === newVal;
    if (typeof oldVal !== typeof newVal) return false;
    if (typeof oldVal !== "object") return oldVal === newVal;

    // Arrays: reference equality (media arrays are always new refs on change)
    if (Array.isArray(oldVal) || Array.isArray(newVal)) {
      return oldVal === newVal;
    }

    // Small plain objects: JSON.stringify is fine here
    try {
      return JSON.stringify(oldVal) === JSON.stringify(newVal);
    } catch {
      return false;
    }
  }

  /** Helper for selectedIds Set */
  updateSelectedIds(updater: (set: Set<string>) => void): void {
    this.set((prev) => {
      const newSet = new Set(prev.selectedIds);
      updater(newSet);
      return { ...prev, selectedIds: newSet };
    });
  }
}

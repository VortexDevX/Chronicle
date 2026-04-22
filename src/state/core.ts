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
  subscribe<T>(selector: (state: AppState) => T, listener: (newVal: T) => void): () => void;
  subscribe<T>(
    arg1: ((state: AppState) => T) | (() => void),
    arg2?: (newVal: T) => void
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
        // Deep equality check using JSON.stringify for simple structured selectors
        const newHash = JSON.stringify(newVal);
        const oldHash = JSON.stringify(entry.lastValue);
        
        if (newHash !== oldHash) {
          entry.lastValue = newVal;
          entry.listener(newVal);
        }
      }
    });
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

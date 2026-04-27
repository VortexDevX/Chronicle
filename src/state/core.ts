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
  bulkAction: "" | "status" | "increment" | "delete";
  selectedIds: Set<string>;
  pendingActionIds: Set<string>;
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
    bulkAction: "",
    selectedIds: new Set<string>(),
    pendingActionIds: new Set<string>(),
    globalStats: null,
    ...overrides,
  };
}

function isPrimitive(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function shallowArrayEqual(oldArr: unknown[], newArr: unknown[]): boolean {
  if (oldArr.length !== newArr.length) return false;
  for (let i = 0; i < oldArr.length; i += 1) {
    if (oldArr[i] !== newArr[i]) return false;
  }
  return true;
}

function shallowObjectEqual(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
): boolean {
  const oldKeys = Object.keys(oldObj);
  const newKeys = Object.keys(newObj);
  if (oldKeys.length !== newKeys.length) return false;

  for (const key of oldKeys) {
    if (!(key in newObj)) return false;
    const oldVal = oldObj[key];
    const newVal = newObj[key];

    if (oldVal === newVal) continue;
    if (Array.isArray(oldVal) && Array.isArray(newVal)) {
      if (!shallowArrayEqual(oldVal, newVal)) return false;
      continue;
    }

    if (isPrimitive(oldVal) && isPrimitive(newVal)) {
      if (oldVal !== newVal) return false;
      continue;
    }

    // complex values should use stable references in selector outputs
    return false;
  }

  return true;
}

export class Store {
  private state: AppState;
  private listeners: Array<{
    selector?: (state: AppState) => unknown;
    listener: (val?: unknown) => void;
    lastValue?: unknown;
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
        selector: selector as (state: AppState) => unknown,
        listener: ((newVal?: unknown) => listener(newVal as T)) as (val?: unknown) => void,
        lastValue: selector(this.state) as unknown,
        isSimple: false,
      };
      this.listeners.push(entry);
      return () => {
        this.listeners = this.listeners.filter((l) => l !== entry);
      };
    } else {
      const listener = arg1 as () => void;
      const entry = {
        listener: (() => listener()) as (val?: unknown) => void,
        isSimple: true,
      };
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

  /** Selector equality optimized for primitives, arrays and plain objects */
  private isEqual(oldVal: unknown, newVal: unknown): boolean {
    if (oldVal === newVal) return true;
    if (oldVal == null || newVal == null) return oldVal === newVal;
    if (typeof oldVal !== typeof newVal) return false;

    if (Array.isArray(oldVal) && Array.isArray(newVal)) {
      return shallowArrayEqual(oldVal, newVal);
    }

    if (typeof oldVal === "object" && typeof newVal === "object") {
      return shallowObjectEqual(
        oldVal as Record<string, unknown>,
        newVal as Record<string, unknown>,
      );
    }

    return oldVal === newVal;
  }

  /** Helper for selectedIds Set */
  updateSelectedIds(updater: (set: Set<string>) => void): void {
    this.set((prev) => {
      const newSet = new Set(prev.selectedIds);
      updater(newSet);
      return { ...prev, selectedIds: newSet };
    });
  }

  /** Helper for per-item pending actions. */
  updatePendingActionIds(updater: (set: Set<string>) => void): void {
    this.set((prev) => {
      const newSet = new Set(prev.pendingActionIds);
      updater(newSet);
      return { ...prev, pendingActionIds: newSet };
    });
  }
}

// Tiny external store used by studios so their state survives route changes and is reachable from UiCommands.
import { useSyncExternalStore } from "react";

export type Store<T> = {
  get: () => T;
  set: (patch: Partial<T> | ((s: T) => Partial<T>)) => void;
  replace: (next: T) => void;
  subscribe: (f: () => void) => () => void;
  /** Subscribe to the whole state, or to a slice: the component re-renders only when the selected value changes. */
  use: { (): T; <U>(select: (s: T) => U): U };
};

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());
  const store: Store<T> = {
    get: () => state,
    set: (patch) => {
      const p = typeof patch === "function" ? patch(state) : patch;
      state = { ...state, ...p };
      emit();
    },
    replace: (next) => { state = next; emit(); },
    subscribe: (f) => { subs.add(f); return () => { subs.delete(f); }; },
    use: (<U>(select?: (s: T) => U) => {
      const read = (): unknown => (select ? select(state) : state);
      // eslint-disable-next-line react-hooks/rules-of-hooks
      return useSyncExternalStore(store.subscribe, read, read);
    }) as Store<T>["use"],
  };
  return store;
}

export const uid = (p = "") => p + Math.random().toString(36).slice(2, 9);
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

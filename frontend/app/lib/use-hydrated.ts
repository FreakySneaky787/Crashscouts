import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** true after hydration, false during server rendering (progressive enhancement). */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

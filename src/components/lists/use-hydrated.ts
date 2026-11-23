import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

/** False in the server's HTML, true once React has taken the page over: clicks before that do nothing. */
export const useHydrated = () => useSyncExternalStore(noSubscribe, () => true, () => false);

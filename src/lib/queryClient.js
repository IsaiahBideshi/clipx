import { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

export const QUERY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: QUERY_CACHE_MAX_AGE_MS,
      staleTime: 5 * 60 * 1000,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const queryStorage = typeof globalThis.localStorage === "undefined" ? undefined : globalThis.localStorage;

export const queryPersister = createSyncStoragePersister({
  storage: queryStorage,
  key: "clipx-query-cache",
  throttleTime: 1000,
});

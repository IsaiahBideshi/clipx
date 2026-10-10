import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listClips } from "./clipsApi.js";

const POLL_INTERVAL_MS = 2 * 60 * 1000;
const NEWEST_CLIPS_LIMIT = 100;

async function fetchNewestClipDates(session) {
  const { data, error } = await listClips(session, { scope: "library", limit: NEWEST_CLIPS_LIMIT });
  if (error) {
    throw new Error(error);
  }

  return (data || []).map((clip) => clip.created_at);
}

export function useNewLibraryClips(session) {
  const userId = session?.user?.id;
  const seenKey = `clipx:librarySeenAt:${userId}`;
  const queryClient = useQueryClient();
  const [seenAt, setSeenAt] = useState(undefined);

  const { data: clipDates } = useQuery({
    queryKey: ["library", "newClips", userId],
    queryFn: () => fetchNewestClipDates(session),
    enabled: Boolean(userId),
    staleTime: POLL_INTERVAL_MS,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  function saveSeenAt(value) {
    setSeenAt(value);
    window.clipx?.authStorageSet?.(seenKey, String(value))?.catch((error) => {
      console.error("Failed to save the library seen marker:", error);
    });
  }

  useEffect(() => {
    setSeenAt(undefined);
    if (!userId) {
      return undefined;
    }

    let cancelled = false;
    Promise.resolve(window.clipx?.authStorageGet?.(seenKey))
      .catch(() => null)
      .then((stored) => {
        if (!cancelled) {
          setSeenAt(stored == null ? null : Number(stored));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (seenAt === null && clipDates) {
      saveSeenAt(clipDates.length ? Date.parse(clipDates[0]) : 0);
    }
  }, [seenAt, clipDates]);

  const count = typeof seenAt === "number" && clipDates
    ? clipDates.filter((date) => Date.parse(date) > seenAt).length
    : 0;

  function markSeen() {
    if (count === 0) {
      return;
    }

    saveSeenAt(Date.parse(clipDates[0]));
    queryClient.invalidateQueries({ queryKey: ["library", "clips", "feed"] });
  }

  return { count, markSeen };
}

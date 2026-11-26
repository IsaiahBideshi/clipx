import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase.js";
import { acceptFriendRequest, declineFriendRequest } from "./friendsApi.js";
import { countUnseen, getNewestTime, getNotificationContent } from "./notificationItems.js";

const NOTIFICATIONS_LIMIT = 50;

async function fetchNotifications() {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, actor_id, clip_id, created_at, actor:users!actor_id(username, avatar_url), clip:clips(title)")
    .order("created_at", { ascending: false })
    .limit(NOTIFICATIONS_LIMIT);

  if (error) {
    throw error;
  }
  return data || [];
}

export function useNotifications(session) {
  const userId = session?.user?.id;
  const queryKey = ["notifications", userId];
  const seenKey = `clipx:notificationsSeenAt:${userId}`;
  const queryClient = useQueryClient();
  const [seenAt, setSeenAt] = useState(undefined);

  const { data } = useQuery({
    queryKey,
    queryFn: fetchNotifications,
    enabled: Boolean(userId),
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
  const notifications = userId ? (data || []).filter(getNotificationContent) : [];

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
          setSeenAt(stored == null ? 0 : Number(stored));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      return undefined;
    }

    const refresh = () => queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    const filter = `user_id=eq.${userId}`;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter }, refresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          refresh();
        }
      });

    return () => supabase.removeChannel(channel);
  }, [queryClient, userId]);

  function markSeen() {
    const newest = getNewestTime(notifications);
    if (typeof seenAt !== "number" || newest <= seenAt) {
      return;
    }

    setSeenAt(newest);
    window.clipx?.authStorageSet?.(seenKey, String(newest))?.catch((error) => {
      console.error("Failed to save the notifications seen marker:", error);
    });
  }

  async function remove(ids) {
    if (!ids.length) {
      return;
    }

    queryClient.setQueryData(queryKey, (list) => list?.filter((notification) => !ids.includes(notification.id)));
    const { error } = await supabase.from("notifications").delete().in("id", ids);
    if (error) {
      console.error("Failed to dismiss notifications:", error);
      queryClient.invalidateQueries({ queryKey });
    }
  }

  async function respond(notification, accept) {
    queryClient.setQueryData(queryKey, (list) => accept
      ? list?.map((item) => (item.id === notification.id ? { ...item, type: "friend_accepted" } : item))
      : list?.filter((item) => item.id !== notification.id));

    const { error } = accept
      ? await acceptFriendRequest(userId, notification.actor_id)
      : await declineFriendRequest(userId, notification.actor_id);
    if (error) {
      console.error("Failed to answer the friend request:", error);
    }
  }

  return {
    notifications,
    unseenCount: countUnseen(notifications, seenAt),
    markSeen,
    dismiss: (id) => remove([id]),
    dismissAll: () => remove(notifications.filter((item) => item.type !== "friend_request").map((item) => item.id)),
    respond,
  };
}

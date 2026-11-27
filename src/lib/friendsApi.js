import { supabase } from "./supabase.js";
import { queryClient } from "./queryClient.js";

export function refreshFriendQueries(userId) {
  queryClient.invalidateQueries({ queryKey: ["profile", "friendships", userId], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
  queryClient.invalidateQueries({ queryKey: ["library", "friendsOptions", userId], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["library", "clips", "feed"] });
}

export async function acceptFriendRequest(userId, requesterId) {
  const result = await supabase
    .from("friendships")
    .update({ status: "accepted" })
    .eq("friend_id", userId)
    .eq("user_id", requesterId);
  refreshFriendQueries(userId);
  return result;
}

export async function declineFriendRequest(userId, requesterId) {
  const result = await supabase
    .from("friendships")
    .delete()
    .eq("friend_id", userId)
    .eq("user_id", requesterId);
  refreshFriendQueries(userId);
  return result;
}

import { supabase } from "./supabase.js";
import { queryClient } from "./queryClient.js";

function refreshFriendQueries(userId) {
  queryClient.invalidateQueries({ queryKey: ["profile", "friendships", userId], refetchType: "all" });
  queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
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

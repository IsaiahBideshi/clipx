const CONTENT = {
  friend_request: { before: "", after: " sent you a friend request", link: "/profile", linkLabel: "View in Profile" },
  friend_accepted: { before: "You are now friends with ", after: "", link: "/profile", linkLabel: "View in Profile" },
  friend_removed: { before: "", after: " removed you as a friend" },
};

export function getNotificationContent(notification) {
  const content = CONTENT[notification?.type];
  return content ? { ...content, name: notification.actor?.username || "Someone" } : null;
}

export function countUnseen(notifications, seenAt) {
  if (typeof seenAt !== "number") {
    return 0;
  }
  return notifications.filter((notification) => Date.parse(notification.created_at) > seenAt).length;
}

export function getNewestTime(notifications) {
  return notifications.reduce((newest, notification) => Math.max(newest, Date.parse(notification.created_at)), 0);
}

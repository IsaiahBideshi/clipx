const CONTENT = {
  friend_request: { before: "", after: " sent you a friend request", link: "/profile", linkLabel: "View in Profile" },
  friend_accepted: { before: "You are now friends with ", after: "", link: "/profile", linkLabel: "View in Profile" },
  friend_removed: { before: "", after: " removed you as a friend" },
  clip_tag: { before: "", after: " tagged you in ", clip: true },
  friend_clip: { before: "", after: " uploaded ", clip: true },
};

export function getNotificationContent(notification) {
  const content = CONTENT[notification?.type];
  if (!content) {
    return null;
  }

  const name = notification.actor?.username || "Someone";
  if (!content.clip) {
    return { ...content, name };
  }
  if (notification.count > 1) {
    return { ...content, name, title: `${notification.count} clips`, link: "/library", linkLabel: "View in Library" };
  }
  return {
    ...content,
    name,
    title: notification.clip?.title || "a clip",
    link: `/library?clip=${notification.clip_id}`,
    linkLabel: "View in Library",
  };
}

export function groupNotifications(notifications) {
  const groups = new Map();
  const grouped = [];
  for (const notification of notifications) {
    const key = CONTENT[notification.type]?.clip ? `${notification.type}:${notification.actor_id}` : notification.id;
    const group = groups.get(key);
    if (group) {
      group.ids.push(notification.id);
      group.count += 1;
      continue;
    }

    const item = { ...notification, ids: [notification.id], count: 1 };
    groups.set(key, item);
    grouped.push(item);
  }
  return grouped;
}

export function applyClippingState(items, previousStatus, state, now) {
  const existing = items.find((item) => item.kind === "recording" && item.id === "clipping");
  if (state.status === "error") {
    const wasRecording = previousStatus === "ready" || Boolean(existing && !existing.resolved && existing.wasRecording);
    return [
      ...items.filter((item) => item !== existing),
      {
        kind: "recording",
        id: "clipping",
        title: wasRecording ? "Clipping stopped" : "Clipping couldn't start",
        detail: state.message || "",
        wasRecording,
        createdAt: now,
      },
    ];
  }

  if (state.status === "ready" && existing && !existing.resolved) {
    return existing.wasRecording
      ? items.map((item) => (item === existing ? { ...item, title: "Clipping restarted", resolved: true } : item))
      : items.filter((item) => item !== existing);
  }
  return items;
}

export function addRecordingProblem(items, problem, now) {
  return [
    ...items.filter((item) => !(item.kind === "recording" && item.id === problem.id)),
    { ...problem, kind: "recording", createdAt: now },
  ];
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

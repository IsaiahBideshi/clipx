export function groupClipSessions(clips) {
  const sessions = [];
  for (const clip of clips) {
    const session = sessions[sessions.length - 1];
    const sessionId = clip.sessionId || null;
    if (session && session.id === sessionId) {
      session.clips.push(clip);
      session.gameName ||= clip.gameName || null;
    } else {
      sessions.push({ id: sessionId, gameName: clip.gameName || null, clips: [clip] });
    }
  }
  return sessions;
}

export function formatSessionTime(clips) {
  const start = new Date(clips[clips.length - 1].createdAt);
  const end = new Date(clips[0].createdAt);
  const day = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: start.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
  const time = (date) => date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return clips.length > 1 ? `${day}, ${time(start)} – ${time(end)}` : `${day}, ${time(start)}`;
}

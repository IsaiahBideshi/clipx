import semver from "semver";

const ANNOUNCEMENT_HEADING = /^#\s+(v?\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?)(?:\s+(.+?))?\s*$/i;

export function parseAnnouncements(text) {
  const announcements = [];

  for (const line of String(text || "").split(/\r?\n/)) {
    const headingMatch = line.match(ANNOUNCEMENT_HEADING);
    if (headingMatch) {
      announcements.push({ version: headingMatch[1], title: headingMatch[2] || "", contentLines: [] });
      continue;
    }

    announcements.at(-1)?.contentLines.push(line);
  }

  return announcements.map((announcement) => ({
    version: announcement.version,
    title: announcement.title,
    content: announcement.contentLines.join("\n").trim(),
  }));
}

export function getNewAnnouncements(text, fromVersion, currentVersion) {
  if (!semver.valid(fromVersion) || !semver.valid(currentVersion)) {
    return [];
  }

  return parseAnnouncements(text).filter(
    (announcement) => semver.valid(announcement.version) && semver.gt(announcement.version, fromVersion) && semver.lte(announcement.version, currentVersion)
  );
}

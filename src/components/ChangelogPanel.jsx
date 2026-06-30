export function normalizeVersion(version) {
  return String(version || "").trim().replace(/^v/i, "").toLowerCase();
}

export function parseChangelogSections(changelog, highlightedVersion) {
  const text = String(changelog || "").trim();
  if (!text) {
    return [];
  }

  const lines = text.split(/\r?\n/);
  const sections = [];
  let activeSection = null;

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      if (activeSection) {
        sections.push(activeSection);
      }
      activeSection = {
        version: headingMatch[1].trim(),
        contentLines: [],
      };
      continue;
    }

    if (activeSection) {
      activeSection.contentLines.push(line);
    }
  }

  if (activeSection) {
    sections.push(activeSection);
  }

  if (!sections.length) {
    const version = highlightedVersion ? `v${normalizeVersion(highlightedVersion)}` : "Latest update";
    return [{
      version,
      content: text,
      isHighlighted: true,
    }];
  }

  const targetVersion = normalizeVersion(highlightedVersion);
  return sections.map((section) => ({
    version: section.version,
    content: section.contentLines.join("\n").trim(),
    isHighlighted: targetVersion && normalizeVersion(section.version) === targetVersion,
  }));
}

export default function ChangelogPanel({ changelog, highlightedVersion, highlightedLabel = "Current version" }) {
  const sections = parseChangelogSections(changelog, highlightedVersion);

  if (!sections.length) {
    return null;
  }

  return (
    <div className="update-changelog">
      <h3>Changelog</h3>
      <div className="update-changelog-list" aria-label="Release changelog">
        {sections.map((section) => (
          <article
            className={`update-changelog-entry${section.isHighlighted ? " is-target" : ""}`}
            key={section.version}
          >
            <div className="update-changelog-entry-header">
              <span>{section.version}</span>
              {section.isHighlighted && <strong>{highlightedLabel}</strong>}
            </div>
            {section.content && <div className="update-changelog-entry-body">{section.content}</div>}
          </article>
        ))}
      </div>
    </div>
  );
}

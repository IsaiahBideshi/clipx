export function normalizeVersion(version) {
  return String(version || "").trim().replace(/^v/i, "").toLowerCase();
}

function decodeHtmlEntities(value) {
  const text = String(value || "");

  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value;
  }

  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function hasHtmlMarkup(value) {
  const text = String(value || "");
  return /<\/?[a-z][\s\S]*>/i.test(text) || /&lt;\/?[a-z][\s\S]*?&gt;/i.test(text);
}

function htmlToPlainText(html) {
  return decodeHtmlEntities(String(html || "")
    .replace(/<li[^>]*>\s*/gi, "- ")
    .replace(/<\/li>\s*/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|ul|ol|h[1-6])>\s*/gi, "\n")
    .replace(/<[^>]+>/g, ""))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function isVersionText(value) {
  return /^v?\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i.test(String(value || "").trim());
}

function parseHtmlChangelogSections(text) {
  if (typeof document !== "undefined") {
    const template = document.createElement("template");
    template.innerHTML = text;
    const headings = [...template.content.querySelectorAll("h1, h2, h3, h4, h5, h6")]
      .filter((heading) => isVersionText(heading.textContent));

    if (headings.length) {
      return headings.map((heading) => {
        const contentParts = [];
        let sibling = heading.nextSibling;

        while (sibling) {
          if (sibling.nodeType === Node.ELEMENT_NODE) {
            const tagName = sibling.tagName.toLowerCase();
            if (/^h[1-6]$/.test(tagName) && isVersionText(sibling.textContent)) {
              break;
            }
            contentParts.push(sibling.outerHTML);
          } else if (sibling.nodeType === Node.TEXT_NODE) {
            contentParts.push(sibling.textContent);
          }

          sibling = sibling.nextSibling;
        }

        return {
          version: heading.textContent.trim(),
          content: htmlToPlainText(contentParts.join("\n")),
        };
      });
    }
  }

  const headingPattern = /<h[1-6][^>]*>\s*(v?\d+\.\d+\.\d+(?:[-+][^<\s]+)?)\s*<\/h[1-6]>/gi;
  const headings = [];
  let match;

  while ((match = headingPattern.exec(text)) !== null) {
    headings.push({
      version: decodeHtmlEntities(match[1]).trim(),
      start: match.index,
      end: headingPattern.lastIndex,
    });
  }

  if (!headings.length) {
    return [];
  }

  return headings.map((heading, index) => {
    const nextHeading = headings[index + 1];
    const contentHtml = text.slice(heading.end, nextHeading ? nextHeading.start : text.length);
    return {
      version: heading.version,
      content: htmlToPlainText(contentHtml),
    };
  });
}

function parseMarkdownChangelogSections(text) {
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

  return sections.map((section) => ({
    version: section.version,
    content: section.contentLines.join("\n").trim(),
  }));
}

export function parseChangelogSections(changelog, highlightedVersion) {
  const rawText = String(changelog || "").trim();
  const decodedText = decodeHtmlEntities(rawText).trim();
  const text = hasHtmlMarkup(rawText) || hasHtmlMarkup(decodedText) ? decodedText : rawText;
  if (!text) {
    return [];
  }

  const isHtml = hasHtmlMarkup(text);
  const parsedSections = isHtml ? parseHtmlChangelogSections(text) : [];
  const sections = parsedSections.length ? parsedSections : (isHtml ? [] : parseMarkdownChangelogSections(text));

  if (!sections.length) {
    const version = highlightedVersion ? `v${normalizeVersion(highlightedVersion)}` : "Latest update";
    const content = isHtml ? htmlToPlainText(text) : text;
    return [{
      version,
      content,
      isHighlighted: true,
    }];
  }

  const targetVersion = normalizeVersion(highlightedVersion);
  return sections.map((section) => ({
    version: section.version,
    content: section.content,
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

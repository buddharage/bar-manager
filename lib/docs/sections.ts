export interface Section {
  heading: string; // empty for intro (content before first ##)
  body: string; // content after the heading line
}

/** Split markdown into sections at ## boundaries */
export function splitSections(markdown: string): Section[] {
  const lines = markdown.split("\n");
  const sections: Section[] = [];
  let currentHeading = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^## (.+)/);
    if (match) {
      sections.push({ heading: currentHeading, body: currentLines.join("\n").trim() });
      currentHeading = match[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  sections.push({ heading: currentHeading, body: currentLines.join("\n").trim() });

  return sections;
}

/** Join sections back into a single markdown string */
export function joinSections(sections: Section[]): string {
  return sections
    .map((s) => {
      if (s.heading) {
        return s.body ? `## ${s.heading}\n\n${s.body}` : `## ${s.heading}`;
      }
      return s.body;
    })
    .filter(Boolean)
    .join("\n\n");
}

/** Convert heading text to a URL-friendly ID */
export function headingToId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

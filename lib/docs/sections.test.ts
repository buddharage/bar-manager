import { describe, it, expect } from "vitest";
import { splitSections, joinSections, headingToId } from "./sections";

describe("splitSections", () => {
  it("splits markdown with intro and multiple sections", () => {
    const md = "Intro text\n\n## Section A\n\nBody A\n\n## Section B\n\nBody B";
    const sections = splitSections(md);
    expect(sections).toEqual([
      { heading: "", body: "Intro text" },
      { heading: "Section A", body: "Body A" },
      { heading: "Section B", body: "Body B" },
    ]);
  });

  it("handles no intro content", () => {
    const md = "## First\n\nContent";
    const sections = splitSections(md);
    expect(sections).toEqual([
      { heading: "", body: "" },
      { heading: "First", body: "Content" },
    ]);
  });

  it("handles no headings (single intro section)", () => {
    const md = "Just some text\nwith lines";
    const sections = splitSections(md);
    expect(sections).toEqual([
      { heading: "", body: "Just some text\nwith lines" },
    ]);
  });

  it("handles empty content", () => {
    const sections = splitSections("");
    expect(sections).toEqual([{ heading: "", body: "" }]);
  });

  it("handles heading with no body", () => {
    const md = "## Empty Section\n\n## Another";
    const sections = splitSections(md);
    expect(sections).toEqual([
      { heading: "", body: "" },
      { heading: "Empty Section", body: "" },
      { heading: "Another", body: "" },
    ]);
  });

  it("does not split on h1 or h3", () => {
    const md = "# Title\n\n### Subtitle\n\nContent";
    const sections = splitSections(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBe("");
  });
});

describe("joinSections", () => {
  it("joins sections back into markdown", () => {
    const sections = [
      { heading: "", body: "Intro" },
      { heading: "Section A", body: "Body A" },
      { heading: "Section B", body: "Body B" },
    ];
    const md = joinSections(sections);
    expect(md).toBe("Intro\n\n## Section A\n\nBody A\n\n## Section B\n\nBody B");
  });

  it("handles heading with no body", () => {
    const sections = [
      { heading: "Empty", body: "" },
    ];
    expect(joinSections(sections)).toBe("## Empty");
  });

  it("skips empty intro", () => {
    const sections = [
      { heading: "", body: "" },
      { heading: "First", body: "Content" },
    ];
    expect(joinSections(sections)).toBe("## First\n\nContent");
  });

  it("roundtrips with splitSections", () => {
    const original = "Intro text\n\n## Section A\n\nBody A\n\n## Section B\n\nBody B";
    const result = joinSections(splitSections(original));
    expect(result).toBe(original);
  });
});

describe("headingToId", () => {
  it("converts heading to lowercase slug", () => {
    expect(headingToId("House Cocktails")).toBe("house-cocktails");
  });

  it("removes special characters", () => {
    expect(headingToId("DJ's & Events")).toBe("djs-events");
  });

  it("collapses multiple spaces", () => {
    expect(headingToId("Food  and   Garnishes")).toBe("food-and-garnishes");
  });
});

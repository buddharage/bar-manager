import { describe, it, expect } from "vitest";
import {
  normalizeItemName,
  isBeerOrWineCategory,
  preferredCategory,
  computeCases,
} from "./aggregation";

// ─── normalizeItemName ────────────────────────────────────────────────
describe("normalizeItemName", () => {
  describe("Happy Hour suffix", () => {
    it("strips (Happy Hour) from any category", () => {
      expect(normalizeItemName("Margarita (Happy Hour)", "Cocktails")).toBe("Margarita");
    });

    it("strips (Happy Hour) case-insensitively", () => {
      expect(normalizeItemName("Tecate (happy hour)", "Beer")).toBe("Tecate");
    });

    it("leaves names without (Happy Hour) unchanged", () => {
      expect(normalizeItemName("Old Fashioned", "Cocktails")).toBe("Old Fashioned");
    });
  });

  describe("beer/wine category — shot suffix stripping", () => {
    it('strips "and a Shot" from beer items', () => {
      expect(normalizeItemName("Tecate and a Shot", "Beer")).toBe("Tecate");
    });

    it('strips "and Shot" from beer items', () => {
      expect(normalizeItemName("Tecate and Shot", "Beer")).toBe("Tecate");
    });

    it('strips "& Shot" from beer items', () => {
      expect(normalizeItemName("Tecate & Shot", "Beer")).toBe("Tecate");
    });

    it('strips "and a Shot" from wine items', () => {
      expect(normalizeItemName("Sauvignon Blanc and a Shot", "Wine")).toBe("Sauvignon Blanc");
    });

    it("applies beer aliases after stripping shot suffix", () => {
      expect(normalizeItemName("High Life and a Shot", "Draft Beer")).toBe("Miller High Life");
    });
  });

  describe("non-beer/wine category — alias-based normalization", () => {
    it("normalizes known beer alias even when category is Shots", () => {
      expect(normalizeItemName("High Life and a Shot", "Shots")).toBe("Miller High Life");
    });

    it("normalizes Tecate alias from Shots category", () => {
      expect(normalizeItemName("Tecate and a Shot", "Shots")).toBe("Tecate");
    });

    it("does not strip shot suffix for unknown items outside beer/wine", () => {
      expect(normalizeItemName("Jameson and a Shot", "Shots")).toBe("Jameson and a Shot");
    });
  });

  describe("no category provided", () => {
    it("still applies aliases when matching", () => {
      expect(normalizeItemName("High Life and a Shot")).toBe("Miller High Life");
    });

    it("leaves unknown items unchanged", () => {
      expect(normalizeItemName("Old Fashioned")).toBe("Old Fashioned");
    });
  });

  describe("combined Happy Hour + shot suffix", () => {
    it("strips Happy Hour first, then shot suffix for beer", () => {
      expect(normalizeItemName("High Life and a Shot (Happy Hour)", "Beer")).toBe("Miller High Life");
    });
  });
});

// ─── isBeerOrWineCategory ─────────────────────────────────────────────
describe("isBeerOrWineCategory", () => {
  it("returns true for Beer", () => {
    expect(isBeerOrWineCategory("Beer")).toBe(true);
  });

  it("returns true for Draft Beer", () => {
    expect(isBeerOrWineCategory("Draft Beer")).toBe(true);
  });

  it("returns true for Wine", () => {
    expect(isBeerOrWineCategory("Wine")).toBe(true);
  });

  it("returns true for Wines by the Glass", () => {
    expect(isBeerOrWineCategory("Wines by the Glass")).toBe(true);
  });

  it("returns false for Shots", () => {
    expect(isBeerOrWineCategory("Shots")).toBe(false);
  });

  it("returns false for Cocktails", () => {
    expect(isBeerOrWineCategory("Cocktails")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isBeerOrWineCategory("BEER")).toBe(true);
    expect(isBeerOrWineCategory("wine")).toBe(true);
  });
});

// ─── preferredCategory ────────────────────────────────────────────────
describe("preferredCategory", () => {
  it("keeps existing beer category when incoming is non-beer", () => {
    expect(preferredCategory("Beer", "Shots")).toBe("Beer");
  });

  it("replaces non-beer with incoming beer category", () => {
    expect(preferredCategory("Shots", "Beer")).toBe("Beer");
  });

  it("replaces non-wine with incoming wine category", () => {
    expect(preferredCategory("Cocktails", "Wine")).toBe("Wine");
  });

  it("keeps existing wine category when incoming is non-wine", () => {
    expect(preferredCategory("Wine", "Shots")).toBe("Wine");
  });

  it("keeps existing when both are beer/wine", () => {
    expect(preferredCategory("Beer", "Wine")).toBe("Beer");
  });

  it("keeps existing when neither is beer/wine", () => {
    expect(preferredCategory("Shots", "Cocktails")).toBe("Shots");
  });
});

// ─── computeCases ─────────────────────────────────────────────────────
describe("computeCases", () => {
  it("computes beer cases (24 per case)", () => {
    expect(computeCases(302, "Beer")).toBe(13);
  });

  it("computes wine cases (12 per case)", () => {
    expect(computeCases(40, "Wine")).toBe(4);
  });

  it("rounds up partial cases", () => {
    expect(computeCases(25, "Beer")).toBe(2);
    expect(computeCases(13, "Wine")).toBe(2);
  });

  it("returns null for non-beer/wine categories", () => {
    expect(computeCases(100, "Cocktails")).toBeNull();
    expect(computeCases(100, "Shots")).toBeNull();
  });

  it("returns 1 case for a single unit of beer", () => {
    expect(computeCases(1, "Beer")).toBe(1);
  });

  it("returns 0 cases for zero quantity", () => {
    expect(computeCases(0, "Beer")).toBe(0);
  });

  it("works with subcategories like Draft Beer", () => {
    expect(computeCases(48, "Draft Beer")).toBe(2);
  });
});

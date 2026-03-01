import { describe, it, expect } from "vitest";
import {
  convertUnits,
  toBaseUnit,
  purchaseToBase,
  baseToPurchase,
  formatQuantity,
  parseQuantityInput,
  unitCategory,
} from "./units";

describe("unitCategory", () => {
  it("identifies volume units", () => {
    expect(unitCategory("ml")).toBe("volume");
    expect(unitCategory("oz")).toBe("volume");
    expect(unitCategory("liter")).toBe("volume");
    expect(unitCategory("tbsp")).toBe("volume");
    expect(unitCategory("dash")).toBe("volume");
    expect(unitCategory("gallon")).toBe("volume");
  });

  it("identifies weight units", () => {
    expect(unitCategory("g")).toBe("weight");
    expect(unitCategory("lb")).toBe("weight");
    expect(unitCategory("kg")).toBe("weight");
    expect(unitCategory("pound")).toBe("weight");
  });

  it("identifies count units", () => {
    expect(unitCategory("each")).toBe("count");
    expect(unitCategory("piece")).toBe("count");
    expect(unitCategory("sprig")).toBe("count");
    expect(unitCategory("wedge")).toBe("count");
  });

  it("returns unknown for unrecognized units", () => {
    expect(unitCategory("bottle")).toBe("unknown");
    expect(unitCategory("case")).toBe("unknown");
    expect(unitCategory("foo")).toBe("unknown");
  });

  it("is case-insensitive", () => {
    expect(unitCategory("ML")).toBe("volume");
    expect(unitCategory("Oz")).toBe("volume");
    expect(unitCategory("LB")).toBe("weight");
    expect(unitCategory("Each")).toBe("count");
  });
});

describe("convertUnits", () => {
  it("returns same quantity for identical units", () => {
    expect(convertUnits(100, "ml", "ml")).toBe(100);
  });

  it("converts oz to ml", () => {
    const result = convertUnits(1, "oz", "ml")!;
    expect(result).toBeCloseTo(29.5735, 2);
  });

  it("converts ml to oz", () => {
    const result = convertUnits(29.5735, "ml", "oz")!;
    expect(result).toBeCloseTo(1, 2);
  });

  it("converts liters to ml", () => {
    expect(convertUnits(1, "l", "ml")).toBe(1000);
  });

  it("converts cup to oz", () => {
    const result = convertUnits(1, "cup", "oz")!;
    expect(result).toBeCloseTo(8, 0);
  });

  it("converts lb to g", () => {
    const result = convertUnits(1, "lb", "g")!;
    expect(result).toBeCloseTo(453.592, 1);
  });

  it("converts kg to lb", () => {
    const result = convertUnits(1, "kg", "lb")!;
    expect(result).toBeCloseTo(2.205, 2);
  });

  it("converts between count units (passthrough)", () => {
    expect(convertUnits(5, "each", "piece")).toBe(5);
  });

  it("returns null for incompatible units (volume → weight)", () => {
    expect(convertUnits(100, "ml", "g")).toBeNull();
  });

  it("returns null for incompatible units (weight → count)", () => {
    expect(convertUnits(100, "lb", "each")).toBeNull();
  });

  it("returns null for unknown units", () => {
    expect(convertUnits(1, "bottle", "ml")).toBeNull();
  });

  it("handles case-insensitive unit names", () => {
    const result = convertUnits(1, "OZ", "ML")!;
    expect(result).toBeCloseTo(29.5735, 2);
  });

  it("converts gallon to oz", () => {
    const result = convertUnits(1, "gallon", "oz")!;
    expect(result).toBeCloseTo(128, 0);
  });

  it("converts tsp to tbsp", () => {
    const result = convertUnits(3, "tsp", "tbsp")!;
    expect(result).toBeCloseTo(1, 0);
  });

  it("handles plural unit names", () => {
    const result = convertUnits(2, "ounces", "milliliters")!;
    expect(result).toBeCloseTo(59.147, 1);
  });
});

describe("toBaseUnit", () => {
  it("converts from known unit to base unit", () => {
    const result = toBaseUnit(2, "oz", "ml");
    expect(result).toBeCloseTo(59.147, 1);
  });

  it("returns original quantity for incompatible units", () => {
    expect(toBaseUnit(5, "bottle", "ml")).toBe(5);
  });

  it("returns original quantity when units are the same", () => {
    expect(toBaseUnit(100, "ml", "ml")).toBe(100);
  });
});

describe("purchaseToBase / baseToPurchase", () => {
  it("converts purchase units to base units", () => {
    // 2 bottles * 750ml per bottle = 1500ml
    expect(purchaseToBase(2, 750)).toBe(1500);
  });

  it("converts base units to purchase units", () => {
    // 1500ml / 750ml per bottle = 2 bottles
    expect(baseToPurchase(1500, 750)).toBe(2);
  });

  it("handles fractional purchase amounts", () => {
    expect(baseToPurchase(375, 750)).toBe(0.5);
  });

  it("handles zero purchase unit quantity", () => {
    expect(baseToPurchase(100, 0)).toBe(100);
  });
});

describe("formatQuantity", () => {
  it("formats with base unit only", () => {
    expect(formatQuantity(500, "ml")).toBe("500 ml");
  });

  it("formats with purchase unit conversion", () => {
    const result = formatQuantity(1500, "ml", "bottle", 750);
    expect(result).toBe("2 bottle (1500 ml)");
  });

  it("rounds to 2 decimal places", () => {
    expect(formatQuantity(333.3333, "ml")).toBe("333.33 ml");
  });

  it("formats without purchase unit when not configured", () => {
    expect(formatQuantity(100, "oz", null, null)).toBe("100 oz");
  });
});

describe("parseQuantityInput", () => {
  it("parses plain number as base units", () => {
    const result = parseQuantityInput("500", "ml");
    expect(result).toEqual({ quantity: 500, raw: "500" });
  });

  it("parses number with base unit", () => {
    const result = parseQuantityInput("16 oz", "ml");
    expect(result).not.toBeNull();
    expect(result!.quantity).toBeCloseTo(473.18, 0);
    expect(result!.raw).toBe("16 oz");
  });

  it("parses number with purchase unit", () => {
    const result = parseQuantityInput("2 bottles", "ml", "bottle", 750);
    expect(result).not.toBeNull();
    expect(result!.quantity).toBe(1500);
    expect(result!.raw).toBe("2 bottles");
  });

  it("parses singular purchase unit", () => {
    const result = parseQuantityInput("1 bottle", "ml", "bottle", 750);
    expect(result).not.toBeNull();
    expect(result!.quantity).toBe(750);
  });

  it("parses fractional purchase units", () => {
    const result = parseQuantityInput("0.5 bottle", "ml", "bottle", 750);
    expect(result).not.toBeNull();
    expect(result!.quantity).toBe(375);
  });

  it("returns null for empty input", () => {
    expect(parseQuantityInput("", "ml")).toBeNull();
    expect(parseQuantityInput("  ", "ml")).toBeNull();
  });

  it("returns null for non-numeric input", () => {
    expect(parseQuantityInput("abc", "ml")).toBeNull();
  });

  it("falls back to base units for unknown unit strings", () => {
    const result = parseQuantityInput("10 widgets", "ml");
    expect(result).not.toBeNull();
    expect(result!.quantity).toBe(10);
  });

  it("converts metric to imperial via base unit", () => {
    // User enters 500 ml but base unit is oz
    const result = parseQuantityInput("500 ml", "oz");
    expect(result).not.toBeNull();
    expect(result!.quantity).toBeCloseTo(16.907, 1);
  });

  it("handles case-insensitive units", () => {
    const result = parseQuantityInput("2 Bottles", "ml", "bottle", 750);
    expect(result).not.toBeNull();
    expect(result!.quantity).toBe(1500);
  });

  it("handles each-based purchase units", () => {
    // 1 case = 200 limes
    const result = parseQuantityInput("2 case", "each", "case", 200);
    expect(result).not.toBeNull();
    expect(result!.quantity).toBe(400);
  });
});

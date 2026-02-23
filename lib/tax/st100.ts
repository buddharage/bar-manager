// NYC Sales Tax Calculator (Phase 2)
// ST-100 form pre-computation for NYC jurisdiction

// NYC combined sales tax rate: 8.875%
// - NY State: 4%
// - NYC: 4.5%
// - Metropolitan Commuter Transportation District (MCTD): 0.375%
export const NYC_TAX_RATE = 0.08875;
export const NY_STATE_RATE = 0.04;
export const NYC_CITY_RATE = 0.045;
export const MCTD_RATE = 0.00375;

export interface ST100Worksheet {
  periodStart: string;
  periodEnd: string;
  grossSales: number;
  taxableSales: number;
  taxCollected: number;
  stateTaxDue: number;
  cityTaxDue: number;
  mctdTaxDue: number;
  totalTaxDue: number;
  // Difference between collected and due (positive = overpaid, negative = underpaid)
  variance: number;
}

export function computeST100(
  salesData: Array<{ gross_sales: number; net_sales: number; tax_collected: number }>
): ST100Worksheet {
  const grossSales = salesData.reduce((sum, d) => sum + d.gross_sales, 0);
  const taxableSales = salesData.reduce((sum, d) => sum + d.net_sales, 0);
  const taxCollected = salesData.reduce((sum, d) => sum + d.tax_collected, 0);

  const stateTaxDue = round(taxableSales * NY_STATE_RATE);
  const cityTaxDue = round(taxableSales * NYC_CITY_RATE);
  const mctdTaxDue = round(taxableSales * MCTD_RATE);
  const totalTaxDue = stateTaxDue + cityTaxDue + mctdTaxDue;

  return {
    periodStart: "",
    periodEnd: "",
    grossSales: round(grossSales),
    taxableSales: round(taxableSales),
    taxCollected: round(taxCollected),
    stateTaxDue,
    cityTaxDue,
    mctdTaxDue,
    totalTaxDue,
    variance: round(taxCollected - totalTaxDue),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

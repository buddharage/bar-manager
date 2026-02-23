export interface InventoryItem {
  id: number;
  toast_guid: string | null;
  name: string;
  category: string | null;
  current_stock: number;
  par_level: number | null;
  unit: string;
  cost_per_unit: number | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryAlert {
  id: number;
  item_id: number;
  alert_type: "low_stock" | "out_of_stock" | "overstock";
  threshold: number | null;
  message: string | null;
  resolved: boolean;
  created_at: string;
  resolved_at: string | null;
  // Joined fields
  inventory_items?: Pick<InventoryItem, "name" | "category" | "current_stock" | "par_level" | "unit">;
}

export interface DailySales {
  id: number;
  date: string;
  gross_sales: number;
  net_sales: number;
  tax_collected: number;
  tips: number;
  discounts: number;
  payment_breakdown: Record<string, number>;
  created_at: string;
}

export interface OrderItem {
  id: number;
  date: string;
  menu_item_guid: string | null;
  name: string;
  quantity: number;
  revenue: number;
  created_at: string;
}

export interface TaxPeriod {
  id: number;
  period_start: string;
  period_end: string;
  taxable_sales: number;
  tax_collected: number;
  tax_due: number;
  status: "pending" | "computed" | "filed";
  filed_at: string | null;
  created_at: string;
}

export interface Employee {
  id: number;
  toast_id: string | null;
  sling_id: string | null;
  name: string;
  role: string | null;
  hourly_rate: number | null;
  active: boolean;
  created_at: string;
}

export interface TimeEntry {
  id: number;
  employee_id: number;
  date: string;
  regular_hours: number;
  overtime_hours: number;
  tips: number;
  created_at: string;
}

export interface SyncLog {
  id: number;
  source: string;
  status: "started" | "success" | "error";
  records_synced: number;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface Setting {
  key: string;
  value: unknown;
  updated_at: string;
}

export interface Document {
  id: number;
  source: "google_drive" | "gmail";
  external_id: string;
  title: string;
  mime_type: string | null;
  content: string | null;
  metadata: Record<string, unknown>;
  content_hash: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

// Database table name to type mapping
export interface Database {
  inventory_items: InventoryItem;
  inventory_alerts: InventoryAlert;
  daily_sales: DailySales;
  order_items: OrderItem;
  tax_periods: TaxPeriod;
  employees: Employee;
  time_entries: TimeEntry;
  sync_logs: SyncLog;
  settings: Setting;
  documents: Document;
}

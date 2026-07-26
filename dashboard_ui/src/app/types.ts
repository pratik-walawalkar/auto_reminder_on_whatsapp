// dashboard_ui/src/app/types.ts
export interface MetricData {
  total_outstanding_payable: number;
  total_cleared_current_month: number;
  provider_historical_aggregates: Array<{
    provider: string;
    total_spent: number;
    total_bills_logged: number;
  }>;
}

export interface BillRecord {
  id: number;
  provider_name: string;
  utility_type: string;
  bill_amount: number;
  tax_amount: number;
  due_date: string;
  billing_period_start: string;
  billing_period_end: string;
  billing_year: number;
  billing_month: string;
  units_consumed: number;
  daily_average_usage: number;
  is_paid_status: boolean | number;
  status?: string; // Added optional status property to fix property error
  data_source: string;
}

export interface StagingRecord {
  id: number;
  file_name: string;
  utility_type: string;
  provider_name: string;
  bill_amount: number;
  units_consumed: number;
  due_date: string;
  billing_period_start: string;
  billing_period_end: string;
  billing_year?: number; // Added optional billing_year to support staging records where needed
  billing_month?: string | number; // Added optional billing_month to fix property error
  extraction_status: string;
}

export interface YoYMonthlyData {
  billing_month: string;
  billing_year: number;
  total_amount: number;
  total_units: number;
}
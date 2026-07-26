export type TabKey = 'usage' | 'sites' | 'settings';

export interface MeteringPoint {
  gsrn: string;
  customer_id: string;
  street_address: string | null;
  postal_code: string | null;
  city: string | null;
  product_description: string | null;
  device_name: string | null;
  device_serialnumber: string | null;
  contract_start: string | null;
  contract_end: string | null;
}

/** One measurement interval as returned by the backend. */
export interface ConsumptionPoint {
  start: string | null;
  stop: string | null;
  /** Consumption in kWh for the interval. */
  electricity: number | null;
  electricity_netted: number | null;
  /** Spot price in c/kWh, excluding and including VAT. */
  electricity_spot_prices: number | null;
  electricity_spot_prices_vat: number | null;
}

export interface ConsumptionData {
  gsrn: string | null;
  resolution: string;
  series: ConsumptionPoint[];
}

export interface MeteringPointsResponse {
  metering_points: MeteringPoint[];
  selected_gsrn: string | null;
}

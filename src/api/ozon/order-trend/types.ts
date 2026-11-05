/** 「1.2.订单趋势」数据结构（对应后端 OzonOrderTrendQuery / OzonOrderTrendVo）。 */

export interface OzonOrderTrendQuery {
  scopeShopId?: string | number;
  dateFrom?: string;
  dateTo?: string;
  topN?: number;
  // tansParams 会丢掉空串，这里允许多余字段透传
  [key: string]: unknown;
}

export interface OzonOrderTrendSummary {
  orders: number;
  units: number;
  gmv: number;
  revenue: number;
  discountPoints: number;
  partner: number;
  avgOrder: number | null;
  avgPrice: number | null;
  days: number;
  stockQty: number | null;
  stockTotalQty: number | null;
  stockDate: string | null;
  stockDays: number | null;
  cpcSpent: number;
  drr: number | null;
  returns: number;
}

export interface OzonOrderTrendRow {
  statDate: string;
  shopId: number | null;
  orders: number;
  units: number;
  gmv: number;
  revenue: number;
  discountPoints: number;
  partner: number;
  avgOrder: number | null;
  stockQty: number | null;
  stockTotalQty: number | null;
  skuCount: number | null;
  cpcSpent: number;
  drr: number | null;
  returns: number;
}

export interface OzonOrderTrendProduct {
  shopId: number | null;
  sellerSku: string;
  productName: string;
  units: number;
  orders: number;
  gmv: number;
  revenue: number;
}

export interface OzonOrderTrendOverview {
  summary: OzonOrderTrendSummary;
  prev: OzonOrderTrendSummary;
  rows: OzonOrderTrendRow[];
  topProducts: OzonOrderTrendProduct[];
  stockDays: number;
}

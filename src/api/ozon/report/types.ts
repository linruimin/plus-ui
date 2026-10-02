export type ReportKind = 'monthly' | 'accruals' | 'supply' | 'returns-report';

export interface ReportQuery extends PageQuery {
  groupBy?: 'month' | 'sku' | 'none';
  groupDesc?: boolean;
  orderByColumn?: string;
  isAsc?: string;
  rowId?: string | number;
  productKey?: string;
  sellerSku?: string;
  ozonSku?: string;
  productName?: string;
  reportMonth?: string;
  startDate?: string;
  endDate?: string;
  accrualId?: string;
  serviceGroup?: string;
  accrualType?: string;
  applicationNo?: string;
  status?: string;
  /** 全局店铺范围；仅订单费用明细（accruals）生效。 */
  scopeShopId?: string;
}

export interface ReportRow {
  [field: string]: string | number | null | undefined;
}

export interface OzonMonthlyReportVO extends ReportRow {
  rowId: string | null;
  reportMonth: string | null;
  sellerSku: string | null;
  ozonSku: string | null;
  productName: string | null;
  soldUnits: number | string | null;
  salesRecordCount: number | string | null;
  positiveAccrualTotalRub: number | string | null;
  salesRevenueRub: number | string | null;
  discountPointsRub: number | string | null;
  partnerProgramsRub: number | string | null;
  otherAccrualsRub: number | string | null;
  netSalesIncomeRub: number | string | null;
  taxRub: number | string | null;
  finalTakeHomeRub: number | string | null;
  finalTakeHomeCny: number | string | null;
  importedAt: string | null;
}

export interface OzonAccrualReportVO extends ReportRow {
  rowId: string | null;
  accrualId: string | null;
  accrualDate: string | null;
  serviceGroup: string | null;
  accrualType: string | null;
  sellerSku: string | null;
  ozonSku: string | null;
  productName: string | null;
  quantity: number | string | null;
  sellerPriceRub: number | string | null;
  orderAcceptedOrServiceDate: string | null;
  salesPlatform: string | null;
  fulfillmentScheme: string | null;
  ozonCommissionPct: number | string | null;
  localizationIndexPct: number | string | null;
  averageDeliveryTimeHours: number | string | null;
  totalAmountRub: number | string | null;
  importedAt: string | null;
}

export interface OzonSupplyReportVO extends ReportRow {
  id: string | null;
  orderId: string | null;
  applicationNo: string | null;
  deliveryType: string | null;
  status: string | null;
  shipmentDate: string | null;
  shipmentTime: string | null;
  storageCluster: string | null;
  dispatchPoint: string | null;
  completionDate: string | null;
  deliveryId: string | null;
  productName: string | null;
  itemCode: string | null;
  sku: string | null;
  liquidity: string | null;
  quantity: number | string | null;
  volume: string | null;
  ozonOrderUrl: string | null;
}

/** 当前筛选范围内的产品月度销售额。 */export interface ProductSalesTrend {
  productKey: string;
  productName: string;
  sellerSku?: string;
  reportMonth: string;
  salesAmountRub: number | string;
}

/** 产品选项及当前筛选范围内的销售统计。 */
export interface SalesProduct {
  productKey: string;
  productName: string;
  sellerSku?: string;
  saleCount: number | string;
  salesAmountRub: number | string;
}

/** 同一费用编号与产品合并后的逐笔销售。 */
export interface ProductSale {
  rowId: string | number;
  productKey: string;
  productName: string;
  sellerSku?: string;
  accrualId: string;
  saleDate?: string;
  accrualDate?: string;
  salesAmountRub: number | string;
}

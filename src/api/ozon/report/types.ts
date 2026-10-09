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
  /** 卖家货号；交货报表下钻用，精确匹配 supply 表的 sku。 */
  sku?: string;
  /** 报表月份（YYYY-MM）；退货图表 / 交货图表按月份筛选。 */
  month?: string;
  /** 卖家货号；退货图表下钻用，精确匹配退货表的 article_no。 */
  articleNo?: string;
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
  /** 品名（关联产品库中文名）。 */
  localProductName: string | null;
  itemCode: string | null;
  sku: string | null;
  liquidity: string | null;
  quantity: number | string | null;
  volume: string | null;
  ozonOrderUrl: string | null;
  /** 关联产品货品图片的公开文件信息。 */
  attachmentJson: string | null;
}

/** 交货图表：按卖家货号归并的产品交货数量；点击柱子用 sku 下钻明细行。 */
export interface OzonSupplyStatsVO {
  localProductName: string | null;
  sku: string | null;
  itemCode: string | null;
  orderCount: number | string | null;
  totalQuantity: number | string | null;
  attachmentJson: string | null;
}

/** 交货图表：单个月份的交货汇总（归月口径＝明细完成日期）。 */
export interface OzonSupplyMonthVO {
  month: string;
  totalQuantity: number | string | null;
  orderCount: number | string | null;
}

/** 交货图表：一次查询返回的两个维度汇总。 */
export interface OzonSupplyChartVO {
  months: OzonSupplyMonthVO[];
  products: OzonSupplyStatsVO[];
}

/** 退货图表：单个月份的退货汇总。 */
export interface OzonReturnsMonthVO {
  month: string;
  returnQty: number | string | null;
  shipmentCount: number | string | null;
}

/** 退货图表：按卖家货号归并的产品退货汇总；点击柱子用 articleNo 下钻明细行。 */
export interface OzonReturnsStatsVO {
  localProductName: string | null;
  articleNo: string | null;
  sku: string | null;
  shipmentCount: number | string | null;
  returnQty: number | string | null;
  attachmentJson: string | null;
}

/** 退货图表：一次查询返回的两个维度汇总。 */
export interface OzonReturnsChartVO {
  months: OzonReturnsMonthVO[];
  products: OzonReturnsStatsVO[];
}

/** 订单图表：单个月份的订单费用净额汇总（归月口径＝明细应计日期）。 */
export interface OzonAccrualMonthVO {
  month: string;
  totalAmountRub: number | string | null;
  accrualCount: number | string | null;
}

/** 订单图表：按卖家货号归并的订单费用净额；点击柱子用 sku 下钻明细行。 */
export interface OzonAccrualProductVO {
  /** 卖家货号；明细没有货号时为空串，页面显示为「未标注货号」。 */
  sku: string | null;
  /** 产品库品名（按卖家货号关联 product.article_no）。 */
  productName: string | null;
  /** 明细自带的商品名称，产品库没有对应记录时兜底展示。 */
  ozonProductName: string | null;
  totalAmountRub: number | string | null;
  accrualCount: number | string | null;
  attachmentJson: string | null;
}

/** 订单图表：一次查询返回的两个维度汇总（金额口径＝总计 RUB 净额）。 */
export interface OzonAccrualChartVO {
  months: OzonAccrualMonthVO[];
  products: OzonAccrualProductVO[];
}

/** 汇总图表：单个月份的三个主题汇总（交货 / 退货＝件，订单＝RUB 净额）；缺的主题为空。 */
export interface OzonSummaryMonthVO {
  month: string;
  supplyQty: number | string | null;
  supplyOrders: number | string | null;
  /** 订单数量：产品月报的「售出件数」（sold_units），即该货号当月真实卖出多少件。 */
  accrualQty: number | string | null;
  /** 销售记录数（产品月报 sales_record_count 的合计）。 */
  accrualCount: number | string | null;
  returnQty: number | string | null;
  returnShipments: number | string | null;
}

/** 汇总图表：单个卖家货号的三个主题汇总；点柱子按来源下钻。 */
export interface OzonSummaryProductVO {
  /** 卖家货号；订单侧平台级费用没有货号时为空串，页面显示为「未标注货号」。 */
  sku: string | null;
  /** 产品库中文品名。 */
  productName: string | null;
  attachmentJson: string | null;
  supplyQty: number | string | null;
  supplyOrders: number | string | null;
  /** 订单数量：产品月报的「售出件数」，与交货 / 退货同为「件」。 */
  accrualQty: number | string | null;
  /** 销售记录数（产品月报 sales_record_count 的合计）。 */
  accrualCount: number | string | null;
  returnQty: number | string | null;
  returnShipments: number | string | null;
}

/** 汇总图表：一次查询返回的三个主题两个维度汇总（交货 / 订单 / 退货并在一起）。 */
export interface OzonSummaryChartVO {
  months: OzonSummaryMonthVO[];
  products: OzonSummaryProductVO[];
}

/** 退货图表下钻明细行：与「8.退货」业务视图同源的字段。 */
export interface OzonReturnsRowVO extends ReportRow {
  id: number | string | null;
  shopId: number | string | null;
  shopIdLabel: string | null;
  fulfillmentScheme: string | null;
  shipmentNo: string | null;
  articleNo: string | null;
  sku: string | null;
  orderDate: string | null;
  returnDate: string | null;
  statusDate: string | null;
  returnStatus: string | null;
  returnReason: string | null;
  buyerComment: string | null;
  buyerType: string | null;
  returnQty: number | string | null;
  packageOpened: string | null;
  destination: string | null;
  storageAddress: string | null;
  location: string | null;
  storageDays: number | string | null;
  returnBarcode: string | null;
  storageFeeRub: number | string | null;
  disposalFeeRub: number | string | null;
  maxPriceRub: number | string | null;
  productId: number | string | null;
  productNo: number | string | null;
  productName: string | null;
  attachmentJson: string | null;
}

/** 当前筛选范围内的产品月度销售额。 */
export interface ProductSalesTrend {
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

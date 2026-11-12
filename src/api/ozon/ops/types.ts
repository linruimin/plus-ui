export interface OzonOpsDaily {
  id: number;
  /** 统计日（莫斯科日期），yyyy-MM-dd */
  statDate: string;
  /** 标题：一句话概括当天 */
  title: string;
  /** 一句话结论 */
  digest?: string | null;
  orders: number;
  units: number;
  revenue: number;
  cancelled: number;
  /** 客单价 ₽ */
  aov?: number | null;
  ordersPrev?: number | null;
  revenuePrev?: number | null;
  ordersBase7?: number | null;
  revenueBase7?: number | null;
  shop1Orders?: number | null;
  shop1Revenue?: number | null;
  shop2Orders?: number | null;
  shop2Revenue?: number | null;
  /** 当日调价 SKU 数 */
  priceChanges?: number | null;
  /** 进行中的促销活动数（双店合计） */
  promoActive?: number | null;
  /** 当日广告花费 ₽（双店合计） */
  adSpent?: number | null;
  /** 简报里列出的风险条数 */
  riskCount?: number | null;
  generatedAt?: string | null;
}

export interface OzonOpsDetail extends OzonOpsDaily {
  /** 简报原文（markdown） */
  contentMd?: string | null;
  /** 简报全文（预渲染 HTML） */
  contentHtml?: string | null;
}

export interface OzonOpsQuery {
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

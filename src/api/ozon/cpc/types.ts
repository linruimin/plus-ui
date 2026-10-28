/** 「运营 / 0.cpc广告」数据结构（对应后端 OzonCpcQuery / OzonCpcOverviewVo / OzonCpcDailyVo）。 */

export interface OzonCpcQuery {
  scopeShopId?: string | number;
  dateFrom?: string;
  dateTo?: string;
  /** CPC=按点击 / CPO=按订单 / CAMPAIGN_TYPE_INVALID=博主社群推广；空=全部 */
  paymentType?: string;
  campaignId?: string | number;
  keyword?: string;
  sortBy?: string;
  desc?: boolean;
  // tansParams 会丢掉空串，这里允许多余字段透传
  [key: string]: unknown;
}

export interface OzonCpcSummary {
  campaigns: number;
  days: number;
  views: number;
  clicks: number;
  orders: number;
  spent: number;
  ordersAmount: number;
  ctr: number | null;
  cpc: number | null;
  drr: number | null;
}

export interface OzonCpcTrend {
  statDate: string;
  views: number;
  clicks: number;
  orders: number;
  spent: number;
  ordersAmount: number;
  ctr: number | null;
  cpc: number | null;
  drr: number | null;
}

export interface OzonCpcCampaign {
  shopId: number;
  campaignId: number;
  campaignTitle: string;
  paymentType: string;
  advObjectType: string;
  campaignState: string;
  days: number;
  firstDate: string;
  lastDate: string;
  views: number;
  clicks: number;
  orders: number;
  spent: number;
  ordersAmount: number;
  ctr: number | null;
  cpc: number | null;
  drr: number | null;
}

export interface OzonCpcDaily extends Omit<OzonCpcCampaign, 'days' | 'firstDate' | 'lastDate'> {
  statDate: string;
}

export interface OzonCpcOverview {
  summary: OzonCpcSummary;
  trend: OzonCpcTrend[];
  campaigns: OzonCpcCampaign[];
}

import type { AxiosPromise } from '@/utils/api-types';
import request from '@/utils/request';
import { ALL_SHOPS } from '@/store/modules/ozonShop';
import type { OzonOrderTrendOverview, OzonOrderTrendProduct, OzonOrderTrendQuery } from './types';

/** 汇总 + 上一周期 + 按天明细 + 热销商品，一次查全。 */
export function getOrderTrend(query: OzonOrderTrendQuery): AxiosPromise<OzonOrderTrendOverview> {
  return request({ url: '/ozon/order-trend/overview', method: 'get', params: scopeOrderTrendQuery(query) });
}

/** 某一天按 SKU 的下单明细（表格行展开时懒加载，日期走 dateFrom）。 */
export function listDailySku(query: OzonOrderTrendQuery): AxiosPromise<OzonOrderTrendProduct[]> {
  return request({ url: '/ozon/order-trend/daily-sku', method: 'get', params: scopeOrderTrendQuery(query) });
}

/**
 * 全局店铺范围只随本次请求发送，不写进页面状态：
 * 选「全部」时把 scopeShopId 整条去掉（后端收到 null 就不按店铺过滤）。
 * 不能传空串——若依 tansParams 会把空串参数丢掉，语义会变成"不传"。
 */
export function scopeOrderTrendQuery(query: OzonOrderTrendQuery): OzonOrderTrendQuery {
  const result: OzonOrderTrendQuery = { ...query };
  if (!result.scopeShopId || result.scopeShopId === ALL_SHOPS) delete result.scopeShopId;
  return result;
}

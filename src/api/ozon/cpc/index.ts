import type { AxiosPromise } from '@/utils/api-types';
import request from '@/utils/request';
import { useOzonShopStore, ALL_SHOPS } from '@/store/modules/ozonShop';
import type { OzonCpcDaily, OzonCpcOverview, OzonCpcQuery } from './types';

/** 汇总 + 按天趋势 + 活动排行，一次查全。 */
export function getCpcOverview(query: OzonCpcQuery): AxiosPromise<OzonCpcOverview> {
  return request({ url: '/ozon/cpc/overview', method: 'get', params: scopeCpcQuery(query) });
}

/** 单个活动的按天明细（表格展开行）。 */
export function listCpcDaily(query: OzonCpcQuery): AxiosPromise<OzonCpcDaily[]> {
  return request({ url: '/ozon/cpc/daily', method: 'get', params: scopeCpcQuery(query) });
}

/**
 * 全局店铺范围只随本次请求发送，不写进页面状态：
 * 选「全部」时把 scopeShopId 整条去掉（后端收到 null 就不按店铺过滤）。
 * 不能传空串——若依 tansParams 会把空串参数丢掉，语义会变成"不传"。
 */
export function scopeCpcQuery(query: OzonCpcQuery): OzonCpcQuery {
  const result: OzonCpcQuery = { ...query };
  if (!result.scopeShopId || result.scopeShopId === ALL_SHOPS) delete result.scopeShopId;
  return result;
}

/** 页面用：店铺下拉选项 + 当前店铺（与其它 Ozon 页共享同一个 store）。 */
export function useCpcShopScope() {
  const shopStore = useOzonShopStore();
  return { shopStore, ALL_SHOPS };
}

import type { PageResult } from '@/api/types';
import type { AxiosPromise } from '@/utils/api-types';
import request from '@/utils/request';
import type { ReportKind, ReportQuery, ReportRow, ProductSalesTrend, SalesProduct, ProductSale } from './types';

/** 查询已有 Ozon 报表。 */
export function listReport(kind: ReportKind, query: ReportQuery): AxiosPromise<PageResult<ReportRow>> {
  return request({ url: '/ozon/report/' + kind + '/list', method: 'get', params: query });
}

/** 查询一个费用编号的所有正负原始明细。 */
export function listAccrualLines(query: ReportQuery): AxiosPromise<PageResult<ReportRow>> {
  return request({ url: '/ozon/report/accruals/lines', method: 'get', params: query });
}

/** 查询费用视图全部筛选结果的产品销售趋势。 */
export function listSalesTrend(query: ReportQuery): AxiosPromise<ProductSalesTrend[]> {
  return request({ url: '/ozon/report/accruals/sales-trend', method: 'get', params: query });
}

/** 查询原费用筛选结果中的产品选项。 */
export function listSalesProducts(query: ReportQuery): AxiosPromise<SalesProduct[]> {
  return request({ url: '/ozon/report/accruals/sales-products', method: 'get', params: query });
}

/** 查询一个产品的全部逐笔销售额，不受表格分页影响。 */
export function listSalesTransactions(query: ReportQuery): AxiosPromise<ProductSale[]> {
  return request({ url: '/ozon/report/accruals/sales-transactions', method: 'get', params: query });
}

/** 全局店铺范围覆盖报表查询；scopeShopId 只随本次请求发送，不进入视图快照。 */
export function scopeReportQuery(query: ReportQuery, scopeShopId?: string): ReportQuery {
  const result: ReportQuery = { ...query };
  // 主页「全部」的哨兵值（见 store/modules/ozonShop.ts 的 ALL_SHOPS）：撤掉 scopeShopId，
  // 后端收到 null 就不按店铺过滤，所有店铺的数据都会返回。
  if (scopeShopId && scopeShopId !== 'all') result.scopeShopId = scopeShopId;
  else delete result.scopeShopId;
  return result;
}

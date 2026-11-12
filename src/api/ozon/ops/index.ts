import type { AxiosPromise } from '@/utils/api-types';
import request from '@/utils/request';
import type { OzonOpsDaily, OzonOpsDetail, OzonOpsQuery } from './types';

/** 简报日期列表（倒序，只含摘要，不含正文）。 */
export function listOpsDaily(query?: OzonOpsQuery): AxiosPromise<OzonOpsDaily[]> {
  return request({ url: '/ozon/ops/list', method: 'get', params: query });
}

/** 单日简报全文（含预渲染 HTML）。 */
export function getOpsDetail(id: number): AxiosPromise<OzonOpsDetail> {
  return request({ url: '/ozon/ops/detail', method: 'get', params: { id } });
}

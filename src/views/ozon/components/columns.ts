export interface ReportColumn { prop: string; label: string; width: number; decimal?: boolean; precision?: number; numeric?: boolean; attachment?: boolean; fixed?: 'left' | 'right' }

/** 仅汇总可加的数量和金额；编号、单价、均值和比率没有求和意义。 */
export function canSumColumn(column: ReportColumn): boolean {
  if (!column.numeric || column.attachment || /(^id$|Id$|No$|code|sku|rate|ratio|percent|price|weightPer|perBox|perUnit)/i.test(column.prop)) return false;
  if (/编号|订单|店铺|单个|单箱|每|平均|均价|单价|售价|费率|比率|百分|倍数|密度|价格|单重/.test(column.label)) return false;
  return /数|件|箱|量|合计|总|收入|利润|成本|金额|费用|到手|税额|积分|货款|重量|体积|支付/.test(column.label);
}

export function sumRowValues(rows: Record<string, any>[], columns: ReportColumn[]): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const column of columns.filter(canSumColumn)) {
    let found = false, total = 0;
    for (const row of rows) {
      const raw = row[column.prop];
      if (raw === null || raw === undefined || raw === '') continue;
      const number = Number(raw);
      if (!Number.isFinite(number)) continue;
      total += number;
      found = true;
    }
    if (found) sums[column.prop] = Math.round((total + Number.EPSILON) * 1e8) / 1e8;
  }
  return sums;
}

/** 数字列按字段含义显示精度，分组小计与数据行共用。 */
export function formatNumericColumn(value: unknown, column: ReportColumn): string {
  if (/^(id|.*Id|.*No)$|code|sku/i.test(column.prop) || /编号|编码/.test(column.label)) return String(value);
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  const label = column.label;
  let digits: number;
  if (/数量|总数|件数|箱数|记录数|字节/.test(label)) digits = 0;
  else if (/体积/.test(label)) digits = column.precision ?? 4;
  else if (/重量|箱重|重\/kg/.test(label)) digits = column.precision ?? 3;
  else if (column.precision !== undefined) digits = column.precision;
  else if (/汇率/.test(label)) digits = 4;
  else if (column.decimal || column.prop.startsWith('calc') || /售价|价格|成本|费用|金额|到手|利润|货款|支付|回款|税额|倍数|密度/.test(label)) digits = 2;
  else digits = 0;
  digits = Math.min(Math.max(digits, 0), 6);
  return number.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 多维表格风格的列宽：短数值列紧凑，长字段保留可读空间。 */
export function gridColumnWidth(column: ReportColumn): number {
  const { prop, label } = column;
  if (prop === '__actions') return column.width;
  if (column.attachment) return 124;
  if (prop === 'id') return 80;
  // 店铺是短文本，不适用 name 字段的宽列规则。
  if (prop === 'shopName' || prop === 'shopId') return Math.max(96, Math.min(160, column.width ?? 120));
  if (/No$|Id$|sku/i.test(prop)) return Math.max(150, Math.min(200, column.width));
  const labelWidth = [...label].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 13 : 7), 0) + 30;
  if (column.numeric) return Math.max(112, Math.min(180, labelWidth));
  if (/name|remark|description|url|cosKey|address/i.test(prop)) return Math.max(200, Math.min(260, Math.max(column.width, labelWidth)));
  if (/at$|date$|time$|month$/i.test(prop)) return Math.max(136, Math.min(180, labelWidth));
  return Math.max(150, Math.min(220, Math.max(column.width, labelWidth)));
}

export const reportColumns: Record<string, ReportColumn[]> = {
  "monthly": [
    { prop: 'attachmentJson', label: '货品图片', width: 124, attachment: true },
    { prop: 'recordName', label: '记录名称', width: 160 },
    { prop: 'localProductName', label: '品名', width: 150 },
    { prop: 'unitTakeHomeCny', label: '单个最终到手', width: 87, decimal: true, numeric: true, precision: 2 },
    { prop: 'averageCost', label: '平均合计成本', width: 87, decimal: true, numeric: true, precision: 4 },
    { prop: 'unitMultiple', label: '单个倍数', width: 87, decimal: true, numeric: true, precision: 2 },
    { prop: 'totalCost', label: '总成本', width: 87, decimal: true, numeric: true, precision: 2 },
    { prop: 'totalProfit', label: '总利润', width: 87, decimal: true, numeric: true, precision: 2 },
    {
      "prop": "reportMonth",
      "label": "统计月份",
      "width": 105.0
    },
    {
      "prop": "sellerSku",
      "label": "卖家SKU",
      "width": 101.25
    },
    {
      "prop": "ozonSku",
      "label": "Ozon SKU",
      "width": 101.25
    },
    {
      "prop": "productName",
      "label": "商品名称",
      "width": 225.0
    },
    {
      "prop": "soldUnits",
      "label": "售出件数",
      "width": 67,
      "numeric": true
    },
    {
      "prop": "salesRecordCount",
      "label": "销售记录数",
      "width": 67,
      "numeric": true
    },
    {
      "prop": "positiveAccrualTotalRub",
      "label": "关联应计正合计（RUB）",
      "width": 87,
      "decimal": true,
      "numeric": true
    },
    {
      "prop": "salesRevenueRub",
      "label": "销售收入（RUB）",
      "width": 87,
      "decimal": true,
      "numeric": true
    },
    {
      "prop": "discountPointsRub",
      "label": "折扣积分（RUB）",
      "width": 87,
      "decimal": true,
      "numeric": true
    },
    {
      "prop": "partnerProgramsRub",
      "label": "合作伙伴收入（RUB）",
      "width": 87,
      "decimal": true,
      "numeric": true
    },
    {
      "prop": "otherAccrualsRub",
      "label": "其他应计（RUB）",
      "width": 87,
      "decimal": true,
      "numeric": true
    },
    {
      "prop": "netSalesIncomeRub",
      "label": "净销售收入（RUB）",
      "width": 87,
      "decimal": true,
      "numeric": true
    },
    {
      "prop": "taxRub",
      "label": "税额（RUB）",
      "width": 87,
      "decimal": true,
      "numeric": true
    },
    {
      "prop": "finalTakeHomeRub",
      "label": "最终到手（RUB）",
      "width": 87,
      "decimal": true,
      "numeric": true
    },
    {
      "prop": "finalTakeHomeCny",
      "label": "最终到手（CNY）",
      "width": 87,
      "decimal": true,
      "numeric": true
    },
    {
      "prop": "importedAt",
      "label": "更新时间",
      "width": 135.0
    }
  ],
  "accruals": [
    {
      "prop": "shopName",
      "label": "店铺",
      "width": 120
    },
    {
      "prop": "accrualId",
      "label": "应计费用编号",
      "width": 157.5
    },
    {
      "prop": "productName",
      "label": "商品名称",
      "width": 225.0
    },
    {
      "prop": "accrualDate",
      "label": "最近应计日期",
      "width": 108.75
    },
    {
      "prop": "positiveAmountRub",
      "label": "销售额（RUB）",
      "width": 87,
      "decimal": true,
      "numeric": true
    },
    {
      "prop": "negativeAmountRub",
      "label": "应计费用（RUB）",
      "width": 87,
      "decimal": true,
      "numeric": true
    },
    {
      "prop": "totalAmountRub",
      "label": "总计（RUB）",
      "width": 87,
      "decimal": true,
      "numeric": true
    },
    {
      "prop": "afterTaxAmountRub",
      "label": "总计-税后（RUB）",
      "width": 87,
      "decimal": true,
      "precision": 2,
      "numeric": true
    },
    {
      "prop": "totalAmountCny",
      "label": "总计-人民币（CNY）",
      "width": 87,
      "decimal": true,
      "precision": 2,
      "numeric": true
    },
    {
      "prop": "recordCount",
      "label": "明细条数",
      "width": 67,
      "numeric": true
    },
    {
      "prop": "firstAccrualDate",
      "label": "首次应计日期",
      "width": 108.75
    }
  ],
  "supply": [
    { prop: 'attachmentJson', label: '货品图片', width: 124, attachment: true },
    {
      "prop": "orderId",
      "label": "申请内部ID",
      "width": 101.25
    },
    {
      "prop": "applicationNo",
      "label": "交货申请编号",
      "width": 135.0
    },
    {
      "prop": "deliveryType",
      "label": "配送类型",
      "width": 123.75
    },
    {
      "prop": "status",
      "label": "申请状态",
      "width": 135.0
    },
    {
      "prop": "shipmentDate",
      "label": "发运日期",
      "width": 105.0
    },
    {
      "prop": "shipmentTime",
      "label": "发运时间段",
      "width": 123.75
    },
    {
      "prop": "storageCluster",
      "label": "存储集群",
      "width": 123.75
    },
    {
      "prop": "dispatchPoint",
      "label": "发运点",
      "width": 135.0
    },
    {
      "prop": "completionDate",
      "label": "完成日期",
      "width": 105.0
    },
    {
      "prop": "deliveryId",
      "label": "子交货ID",
      "width": 101.25
    },
    {
      "prop": "productName",
      "label": "商品名称",
      "width": 225.0
    },
    {
      "prop": "itemCode",
      "label": "ItemCode",
      "width": 101.25
    },
    {
      "prop": "sku",
      "label": "SKU",
      "width": 101.25
    },
    {
      "prop": "liquidity",
      "label": "商品流通性",
      "width": 123.75
    },
    {
      "prop": "quantity",
      "label": "商品数量",
      "width": 67,
      "numeric": true
    },
    {
      "prop": "volume",
      "label": "商品体积",
      "width": 82.5
    }
  ],
  "accrualLines": [
    {
      "prop": "shopName",
      "label": "店铺",
      "width": 120
    },
    {
      "prop": "accrualId",
      "label": "应计费用编号",
      "width": 123.75
    },
    {
      "prop": "accrualDate",
      "label": "应计日期",
      "width": 105.0
    },
    {
      "prop": "serviceGroup",
      "label": "服务分组",
      "width": 123.75
    },
    {
      "prop": "accrualType",
      "label": "应计类型",
      "width": 123.75
    },
    {
      "prop": "sellerSku",
      "label": "卖家SKU",
      "width": 101.25
    },
    {
      "prop": "ozonSku",
      "label": "Ozon SKU",
      "width": 101.25
    },
    {
      "prop": "productName",
      "label": "商品名称",
      "width": 225.0
    },
    {
      "prop": "quantity",
      "label": "数量",
      "width": 67,
      "decimal": true,
      "numeric": true
    },
    {
      "prop": "sellerPriceRub",
      "label": "卖家价格（RUB）",
      "width": 87,
      "decimal": true,
      "numeric": true
    },
    {
      "prop": "orderAcceptedOrServiceDate",
      "label": "订单受理或服务日期",
      "width": 105.0
    },
    {
      "prop": "salesPlatform",
      "label": "销售平台",
      "width": 135.0
    },
    {
      "prop": "fulfillmentScheme",
      "label": "履约方案",
      "width": 123.75
    },
    {
      "prop": "ozonCommissionPct",
      "label": "Ozon佣金比例",
      "width": 87,
      "decimal": true,
      "numeric": true
    },
    {
      "prop": "localizationIndexPct",
      "label": "本地化指数比例",
      "width": 87,
      "decimal": true,
      "numeric": true
    },
    {
      "prop": "averageDeliveryTimeHours",
      "label": "平均配送时长（小时）",
      "width": 87,
      "decimal": true,
      "numeric": true
    },
    {
      "prop": "totalAmountRub",
      "label": "应计金额（RUB）",
      "width": 87,
      "decimal": true,
      "numeric": true
    },
    {
      "prop": "importedAt",
      "label": "导入时间",
      "width": 135.0
    }
  ]
};

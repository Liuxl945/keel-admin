import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config } from '../config';
import { logger } from '../utils/logger';
import { encryptSecret } from '../utils/secret';
import { AppDataSource } from './data-source';
import { DevApi, DevDataSource, DevDbTable, DevForm, DevModel } from './entities';
import { introspectTable, type DbTableInfo } from '../modules/dev-db-table/dev-db-table.introspect';
import { tableExists, withDataSource } from '../modules/dev-data-source/data-source.client';
import { generateTableFields, toCamel } from '../modules/dev-form/dev-form.field-mapper';

/**
 * 「在线开发」三个菜单的演示数据：数据建模 / 数据接口 / 表单设计。
 * 部署后随启动自动写入，重复执行不覆盖已有记录（只补缺失），便于线上直接演示。
 */

const CONNECTION_CODE = 'demo_pg';
const OPERATOR = 'demo-seed';
const DEMO_TABLES = ['demo_customer', 'demo_purchase_order', 'demo_purchase_order_item'] as const;

type DemoRow = Record<string, string | number | Date | null>;

// ---------------------------------------------------------------------------
// 数据连接与库表元数据
// ---------------------------------------------------------------------------

async function ensureConnection(): Promise<DevDataSource | null> {
  if (config.DB_TYPE === 'sqlite') {
    logger.warn('演示数据依赖 postgres/mysql 数据连接，当前为 sqlite，跳过');
    return null;
  }
  const repo = AppDataSource.getRepository(DevDataSource);
  const existing = await repo.findOne({ where: { code: CONNECTION_CODE }, withDeleted: true });
  const connection: Pick<
    DevDataSource,
    'name' | 'code' | 'db_type' | 'host' | 'port' | 'database_name' | 'username' | 'password_encrypted' | 'status' | 'remark'
  > = {
    name: '演示数据连接',
    code: CONNECTION_CODE,
    db_type: config.DB_TYPE,
    host: config.DB_HOST,
    port: config.DB_PORT,
    database_name: config.DB_DATABASE,
    username: config.DB_USERNAME,
    password_encrypted: encryptSecret(config.DB_PASSWORD),
    status: 'ENABLED',
    remark: '在线开发演示数据使用，与应用共用同一个库',
  };
  if (!existing) {
    const hasDefault = await repo.exists({ where: { is_default: true } });
    return repo.save(repo.create({ ...connection, is_default: !hasDefault }));
  }
  if (existing.deletedAt) await repo.restore(existing.id);
  Object.assign(existing, connection);
  if (!existing.is_default) {
    existing.is_default = !(await repo.exists({ where: { is_default: true } }));
  }
  return repo.save(existing);
}

async function syncTableMeta(source: DevDataSource, tableName: string): Promise<DbTableInfo | null> {
  if (!(await tableExists(source, tableName))) {
    logger.warn({ tableName }, '演示业务表不存在，跳过该表的元数据同步');
    return null;
  }
  const info = await introspectTable(source, tableName);
  if (!info) return null;
  const repo = AppDataSource.getRepository(DevDbTable);
  const payload = {
    connection_id: source.id,
    table_name: tableName,
    table_comment: info.tableComment || null,
    columns_json: JSON.stringify(info.columns),
    column_count: info.columns.length,
    synced_at: new Date(),
  };
  const existing = await repo.findOne({
    where: { connection_id: source.id, table_name: tableName },
    withDeleted: true,
  });
  if (existing) {
    if (existing.deletedAt) await repo.restore(existing.id);
    Object.assign(existing, payload);
    await repo.save(existing);
  } else {
    await repo.save(repo.create(payload));
  }
  return info;
}

// ---------------------------------------------------------------------------
// 数据建模
// ---------------------------------------------------------------------------

const FIELD_NAMES: Record<string, Record<string, string>> = {
  demo_customer: {
    customer_name: 'customerName',
    contact: 'contact',
    phone: 'phone',
    level: 'level',
    region: 'region',
  },
  demo_purchase_order: {
    order_no: 'orderNo',
    supplier: 'supplier',
    order_date: 'orderDate',
    amount: 'amount',
    status: 'status',
    customer_ref: 'customerRef',
    city: 'city',
    image: 'image',
    attachments: 'attachments',
    remark: 'remark',
  },
  demo_purchase_order_item: {
    order_id: 'orderId',
    product_name: 'productName',
    spec: 'spec',
    qty: 'qty',
    price: 'price',
  },
};

const MODEL_DEFS: Record<string, { name: string; comment: string }> = {
  demo_customer: { name: '客户档案', comment: '演示：客户档案' },
  demo_purchase_order: { name: '采购订单', comment: '演示：采购订单（主表）' },
  demo_purchase_order_item: { name: '采购订单明细', comment: '演示：采购订单明细（从表）' },
};

async function ensureModels(
  source: DevDataSource,
  tables: Map<string, DbTableInfo>,
): Promise<Map<string, DevModel>> {
  const repo = AppDataSource.getRepository(DevModel);
  const result = new Map<string, DevModel>();
  for (const tableName of DEMO_TABLES) {
    const info = tables.get(tableName);
    const def = MODEL_DEFS[tableName];
    if (!info || !def) continue;
    const existing = await repo.findOne({ where: { model_key: tableName }, withDeleted: true });
    if (existing) {
      if (existing.deletedAt) await repo.restore(existing.id);
      result.set(tableName, existing);
      continue;
    }
    const fields = generateTableFields(info.columns, new Map(Object.entries(FIELD_NAMES[tableName] ?? {})));
    const saved = await repo.save(
      repo.create({
        name: def.name,
        model_key: tableName,
        connection_id: source.id,
        table_name: tableName,
        published_table_name: tableName,
        table_comment: def.comment,
        fields_json: JSON.stringify(fields),
        status: 'CREATED',
        created_table_at: new Date(),
        updated_by: OPERATOR,
      }),
    );
    result.set(tableName, saved);
  }
  return result;
}

// ---------------------------------------------------------------------------
// 数据接口
// ---------------------------------------------------------------------------

const CITY_OPTIONS = [
  { city_code: '310100', city_name: '上海市', province: '上海市' },
  { city_code: '320100', city_name: '南京市', province: '江苏省' },
  { city_code: '330100', city_name: '杭州市', province: '浙江省' },
  { city_code: '110100', city_name: '北京市', province: '北京市' },
  { city_code: '440300', city_name: '深圳市', province: '广东省' },
];

const STATIC_PROCESS = {
  returnMode: 'list',
  paging: false,
  pageSize: 20,
  orderBy: '',
  orderDir: 'ASC',
  mappedOnly: true,
  maxRows: 1000,
};

const LIST_PROCESS = {
  returnMode: 'list',
  paging: true,
  pageSize: 10,
  orderBy: 'id',
  orderDir: 'ASC',
  mappedOnly: true,
  maxRows: 1000,
};

async function ensureApis(
  source: DevDataSource,
  models: Map<string, DevModel>,
): Promise<Map<string, DevApi>> {
  const repo = AppDataSource.getRepository(DevApi);
  const customerModel = models.get('demo_customer');
  const orderModel = models.get('demo_purchase_order');

  const defs: Array<{
    api_key: string;
    name: string;
    category: 'STATIC' | 'SQL';
    description: string;
    table_name: string | null;
    action: 'QUERY' | null;
    model: DevModel | undefined;
    config: Record<string, unknown>;
  }> = [
    {
      api_key: 'demo_city_options',
      name: '城市选项（静态数据）',
      category: 'STATIC',
      description: '演示用静态数据，表单「收货城市」弹框选择控件的数据源',
      table_name: null,
      action: null,
      model: undefined,
      config: {
        staticData: JSON.stringify(CITY_OPTIONS, null, 2),
        sql: '',
        params: [],
        fieldMappings: [
          { columnName: 'city_code', outputKey: 'cityCode', label: '城市编码', hidden: false },
          { columnName: 'city_name', outputKey: 'cityName', label: '城市名称', hidden: false },
          { columnName: 'province', outputKey: 'province', label: '所属省份', hidden: false },
        ],
        dataProcess: STATIC_PROCESS,
      },
    },
    {
      api_key: 'demo_customer_query',
      name: '客户模糊查询',
      category: 'SQL',
      description: '演示用 SQL 查询：按客户名称/联系人关键字模糊搜索',
      table_name: 'demo_customer',
      action: 'QUERY',
      model: customerModel,
      config: {
        staticData: '',
        sql:
          'SELECT id, customer_name, contact, phone, level FROM demo_customer ' +
          "WHERE COALESCE(:keyword, '') = '' " +
          "OR customer_name LIKE CONCAT('%', COALESCE(:keyword, ''), '%') " +
          "OR contact LIKE CONCAT('%', COALESCE(:keyword, ''), '%')",
        params: [
          { key: 'keyword', label: '关键词', type: 'string', required: false, defaultValue: '', sampleValue: '' },
        ],
        fieldMappings: [
          { columnName: 'customer_name', outputKey: 'customerName', label: '客户名称', hidden: false },
          { columnName: 'contact', outputKey: 'contact', label: '联系人', hidden: false },
          { columnName: 'phone', outputKey: 'phone', label: '联系电话', hidden: false },
          { columnName: 'level', outputKey: 'level', label: '客户等级', hidden: false },
          { columnName: 'id', outputKey: 'id', label: '主键', hidden: true },
        ],
        dataProcess: LIST_PROCESS,
      },
    },
    {
      api_key: 'demo_order_stats',
      name: '采购订单统计',
      category: 'SQL',
      description: '演示用 SQL 查询：按订单状态统计笔数与金额合计',
      table_name: 'demo_purchase_order',
      action: 'QUERY',
      model: orderModel,
      config: {
        staticData: '',
        sql:
          'SELECT COUNT(*) AS order_count, COALESCE(SUM(amount), 0) AS total_amount ' +
          'FROM demo_purchase_order WHERE status = :status',
        params: [
          { key: 'status', label: '订单状态', type: 'string', required: false, defaultValue: '已完成', sampleValue: '已完成' },
        ],
        fieldMappings: [],
        dataProcess: {
          returnMode: 'one',
          paging: false,
          pageSize: 20,
          orderBy: '',
          orderDir: 'ASC',
          mappedOnly: false,
          maxRows: 1000,
        },
      },
    },
  ];

  const result = new Map<string, DevApi>();
  for (const def of defs) {
    const existing = await repo.findOne({ where: { api_key: def.api_key }, withDeleted: true });
    if (existing) {
      if (existing.deletedAt) await repo.restore(existing.id);
      result.set(def.api_key, existing);
      continue;
    }
    const saved = await repo.save(
      repo.create({
        name: def.name,
        api_key: def.api_key,
        category: def.category,
        description: def.description,
        connection_id: def.category === 'STATIC' ? null : source.id,
        model_id: def.model?.id ?? null,
        table_name: def.table_name,
        action: def.action,
        config_json: JSON.stringify(def.config),
        status: 'PUBLISHED',
        version: 1,
        published_at: new Date(),
        updated_by: OPERATOR,
      }),
    );
    result.set(def.api_key, saved);
  }
  return result;
}

// ---------------------------------------------------------------------------
// 表单设计
// ---------------------------------------------------------------------------

type FieldInput = Record<string, unknown> & { columnName: string; label: string; type: string };

function field(input: FieldInput): Record<string, unknown> {
  const { columnName, ...rest } = input;
  return {
    id: `f_${columnName}`,
    name: toCamel(columnName),
    columnName,
    placeholder: '',
    required: false,
    disabled: false,
    clearable: true,
    span: 12,
    options: [],
    defaultValue: null,
    ...rest,
  };
}

function buildCustomerForm(): Record<string, unknown> {
  const fields = [
    field({ columnName: 'customer_name', label: '客户名称', type: 'input', required: true, placeholder: '请输入客户名称' }),
    field({ columnName: 'contact', label: '联系人', type: 'input', placeholder: '请输入联系人' }),
    field({ columnName: 'phone', label: '联系电话', type: 'input', placeholder: '请输入联系电话' }),
    field({
      columnName: 'level',
      label: '客户等级',
      type: 'select',
      options: [
        { label: '重点客户', value: '重点客户' },
        { label: '普通客户', value: '普通客户' },
        { label: '潜在客户', value: '潜在客户' },
      ],
    }),
    field({ columnName: 'region', label: '所属区域', type: 'input', placeholder: '如 华东' }),
  ];
  return {
    columns: 2,
    labelWidth: 100,
    labelPosition: 'right',
    size: 'default',
    formSize: 'medium',
    dialogType: 'center',
    dialogWidth: null,
    disabled: false,
    labelSuffix: '',
    hideRequiredAsterisk: false,
    showMessage: true,
    statusIcon: false,
    fields,
    list: {
      queryFields: ['customer_name', 'level'],
      listFields: ['customer_name', 'contact', 'phone', 'level', 'region'],
      queryColumns: [
        { columnName: 'customer_name', source: 'master', tableName: null, field: 'customerName', operator: 'like', defaultValue: '', keyword: '', multiple: false, hidden: false },
        { columnName: 'level', source: 'master', tableName: null, field: 'level', operator: 'eq', defaultValue: '', keyword: '', multiple: false, hidden: false },
      ],
      listColumns: [
        { columnName: 'customer_name', source: 'master', tableName: null, field: 'customerName', sortable: true, fixed: '', align: 'left', width: 200 },
        { columnName: 'contact', source: 'master', tableName: null, field: 'contact', sortable: false, fixed: '', align: 'left', width: 140 },
        { columnName: 'phone', source: 'master', tableName: null, field: 'phone', sortable: false, fixed: '', align: 'left', width: 160 },
        { columnName: 'level', source: 'master', tableName: null, field: 'level', sortable: false, fixed: '', align: 'left', width: 120 },
        { columnName: 'region', source: 'master', tableName: null, field: 'region', sortable: false, fixed: '', align: 'left', width: 120 },
      ],
      subtableView: 'merge',
    },
    tables: [],
    subtables: [],
    layout: fields.map((item) => String(item.id)),
  };
}

function buildOrderForm(customerFormId: number, cityApiId: number): Record<string, unknown> {
  const fields = [
    field({ columnName: 'order_no', label: '订单编号', type: 'input', required: true, span: 12, placeholder: '如 PO-2026-0004' }),
    field({
      columnName: 'supplier',
      label: '供应商',
      type: 'select',
      span: 12,
      options: [
        { label: '华东供应链有限公司', value: '华东供应链有限公司' },
        { label: '江南五金厂', value: '江南五金厂' },
        { label: '北方包装材料厂', value: '北方包装材料厂' },
      ],
    }),
    field({ columnName: 'order_date', label: '下单日期', type: 'date', span: 12, dateFormat: 'YYYY-MM-DD' }),
    field({ columnName: 'amount', label: '订单金额', type: 'number', span: 12, min: 0 }),
    field({
      columnName: 'status',
      label: '订单状态',
      type: 'select',
      span: 12,
      defaultValue: '待审核',
      options: [
        { label: '待审核', value: '待审核' },
        { label: '已下单', value: '已下单' },
        { label: '已完成', value: '已完成' },
      ],
    }),
    field({
      columnName: 'customer_ref',
      label: '关联客户',
      type: 'relationForm',
      span: 12,
      sourceId: customerFormId,
      sourceName: '客户档案',
      valueField: 'customerName',
      displayField: 'customerName',
      listFields: [
        { key: 'customerName', label: '客户名称' },
        { key: 'contact', label: '联系人' },
        { key: 'phone', label: '联系电话' },
        { key: 'level', label: '客户等级' },
      ],
      keywordKey: 'customerName',
      pickerTitle: '选择客户',
      multiple: false,
    }),
    field({
      columnName: 'city',
      label: '收货城市',
      type: 'dialogSelect',
      span: 12,
      sourceId: cityApiId,
      sourceName: '城市选项（静态数据）',
      valueField: 'cityName',
      displayField: 'cityName',
      listFields: [
        { key: 'cityName', label: '城市名称' },
        { key: 'cityCode', label: '城市编码' },
        { key: 'province', label: '所属省份' },
      ],
      keywordKey: null,
      pickerTitle: '选择收货城市',
      multiple: false,
    }),
    field({
      columnName: 'image',
      label: '订单图片',
      type: 'image',
      span: 12,
      maxCount: 3,
      maxSize: 5,
      acceptTypes: ['image'],
      tip: '最多 3 张，单张不超过 5MB',
    }),
    field({
      columnName: 'attachments',
      label: '合同附件',
      type: 'file',
      span: 12,
      maxCount: 5,
      maxSize: 20,
      acceptTypes: ['pdf', 'word', 'text'],
      tip: '支持 PDF / Word / 文本，单个不超过 20MB',
    }),
    field({ columnName: 'remark', label: '备注', type: 'textarea', span: 24, rows: 3 }),
  ];

  const subColumns = [
    field({ columnName: 'product_name', label: '商品名称', type: 'input', required: true }),
    field({ columnName: 'spec', label: '规格', type: 'input' }),
    field({ columnName: 'qty', label: '数量', type: 'number', min: 0 }),
    field({ columnName: 'price', label: '单价', type: 'number', min: 0 }),
  ];

  return {
    columns: 2,
    labelWidth: 110,
    labelPosition: 'right',
    size: 'default',
    formSize: 'medium',
    dialogType: 'center',
    dialogWidth: null,
    disabled: false,
    labelSuffix: '',
    hideRequiredAsterisk: false,
    showMessage: true,
    statusIcon: false,
    fields,
    list: {
      queryFields: ['order_no', 'supplier', 'status'],
      listFields: ['order_no', 'customer_ref', 'supplier', 'order_date', 'amount', 'status', 'image'],
      queryColumns: [
        { columnName: 'order_no', source: 'master', tableName: null, field: 'orderNo', operator: 'like', defaultValue: '', keyword: '', multiple: false, hidden: false },
        { columnName: 'supplier', source: 'master', tableName: null, field: 'supplier', operator: 'like', defaultValue: '', keyword: '', multiple: false, hidden: false },
        { columnName: 'status', source: 'master', tableName: null, field: 'status', operator: 'eq', defaultValue: '', keyword: '', multiple: false, hidden: false },
      ],
      listColumns: [
        { columnName: 'order_no', source: 'master', tableName: null, field: 'orderNo', sortable: true, fixed: '', align: 'left', width: 160 },
        { columnName: 'customer_ref', source: 'master', tableName: null, field: 'customerRef', sortable: false, fixed: '', align: 'left', width: 180 },
        { columnName: 'supplier', source: 'master', tableName: null, field: 'supplier', sortable: false, fixed: '', align: 'left', width: 180 },
        { columnName: 'order_date', source: 'master', tableName: null, field: 'orderDate', sortable: true, fixed: '', align: 'left', width: 120 },
        { columnName: 'amount', source: 'master', tableName: null, field: 'amount', sortable: true, fixed: '', align: 'right', width: 120 },
        { columnName: 'status', source: 'master', tableName: null, field: 'status', sortable: false, fixed: '', align: 'left', width: 100 },
        { columnName: 'image', source: 'master', tableName: null, field: 'image', sortable: false, fixed: '', align: 'left', width: 120 },
        { columnName: 'product_name', source: 'subtable', tableName: 'demo_purchase_order_item', field: 'productName', sortable: false, fixed: '', align: 'left', width: 160 },
      ],
      subtableView: 'merge',
    },
    tables: [
      { role: 'MASTER', tableName: 'demo_purchase_order', tableComment: '采购订单', foreignKey: null, masterColumn: null },
      {
        role: 'SLAVE',
        tableName: 'demo_purchase_order_item',
        tableComment: '采购订单明细',
        foreignKey: 'order_id',
        masterColumn: 'id',
      },
    ],
    subtables: [
      {
        id: 'sub_order_items',
        tableName: 'demo_purchase_order_item',
        label: '采购明细',
        foreignKey: 'order_id',
        masterColumn: 'id',
        span: 24,
        mode: 'table',
        columns: subColumns,
        queryFields: ['product_name'],
        listFields: ['product_name', 'spec', 'qty', 'price'],
      },
    ],
    layout: [
      'f_order_no',
      'f_supplier',
      'f_order_date',
      'f_amount',
      'f_status',
      'f_customer_ref',
      'f_city',
      'f_image',
      'f_attachments',
      'sub_order_items',
      'f_remark',
    ],
  };
}

async function ensureForm(
  source: DevDataSource,
  def: { form_key: string; name: string; description: string; table_name: string },
  buildSchema: () => Record<string, unknown>,
): Promise<DevForm | null> {
  const repo = AppDataSource.getRepository(DevForm);
  const existing = await repo.findOne({ where: { form_key: def.form_key }, withDeleted: true });
  if (existing) {
    if (existing.deletedAt) await repo.restore(existing.id);
    return existing;
  }
  return repo.save(
    repo.create({
      name: def.name,
      form_key: def.form_key,
      description: def.description,
      connection_id: source.id,
      table_name: def.table_name,
      schema_json: JSON.stringify(buildSchema()),
      status: 'PUBLISHED',
      version: 1,
      published_at: new Date(),
      updated_by: OPERATOR,
    }),
  );
}

async function ensureForms(source: DevDataSource, apis: Map<string, DevApi>): Promise<void> {
  const cityApi = apis.get('demo_city_options');

  const customerForm = await ensureForm(
    source,
    {
      form_key: 'demo_customer',
      name: '客户档案',
      description: '演示表单：单表 + 下拉选择，同时作为采购订单「关联客户」的选择数据源',
      table_name: 'demo_customer',
    },
    buildCustomerForm,
  );
  if (!customerForm || !cityApi) {
    logger.warn('客户表单或城市接口未就绪，跳过采购订单演示表单');
    return;
  }
  await ensureForm(
    source,
    {
      form_key: 'demo_purchase_order',
      name: '采购订单',
      description: '演示表单：主表 + 采购明细子表，包含图片/文件上传、关联表单、弹框选择等控件',
      table_name: 'demo_purchase_order',
    },
    () => buildOrderForm(customerForm.id, cityApi.id),
  );
}

// ---------------------------------------------------------------------------
// 演示数据行与上传素材
// ---------------------------------------------------------------------------

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/** 生成纯色渐变 PNG，避免演示图片依赖外网 */
function buildDemoPng(width: number, height: number, from: [number, number, number], to: [number, number, number]): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const offset = y * (width * 3 + 1);
    raw[offset] = 0;
    const ratio = y / Math.max(height - 1, 1);
    const rgb = from.map((value, index) => Math.round(value + (to[index] - value) * ratio));
    for (let x = 0; x < width; x += 1) {
      const pixel = offset + 1 + x * 3;
      raw[pixel] = rgb[0];
      raw[pixel + 1] = rgb[1];
      raw[pixel + 2] = rgb[2];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function ensureDemoAssets(): void {
  const dir = config.resolvePath(config.UPLOAD_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const images: Array<[string, [number, number, number], [number, number, number]]> = [
    ['demo_order_1.png', [37, 99, 235], [147, 197, 253]],
    ['demo_order_2.png', [16, 185, 129], [167, 243, 208]],
    ['demo_order_3.png', [234, 88, 12], [253, 186, 116]],
  ];
  for (const [name, from, to] of images) {
    const target = path.join(dir, name);
    if (!fs.existsSync(target)) fs.writeFileSync(target, buildDemoPng(480, 270, from, to));
  }
  const contracts: Array<[string, string]> = [
    ['demo_contract_1.txt', '采购合同 PO-2026-0001\n\n甲方：华东贸易有限公司\n乙方：华东供应链有限公司\n\n本演示合同仅用于在线开发功能展示。\n'],
    ['demo_contract_2.txt', '采购合同 PO-2026-0002\n\n甲方：江南智能制造有限公司\n乙方：江南五金厂\n\n本演示合同仅用于在线开发功能展示。\n'],
    ['demo_contract_3.txt', '采购合同 PO-2026-0003\n\n甲方：北方物流集团\n乙方：北方包装材料厂\n\n本演示合同仅用于在线开发功能展示。\n'],
  ];
  for (const [name, content] of contracts) {
    const target = path.join(dir, name);
    if (!fs.existsSync(target)) fs.writeFileSync(target, content, 'utf8');
  }
}

function quote(source: DevDataSource, name: string): string {
  return source.db_type === 'mysql' ? `\`${name}\`` : `"${name}"`;
}

function placeholder(source: DevDataSource, index: number): string {
  return source.db_type === 'mysql' ? '?' : `$${index}`;
}

/** 按业务唯一键判断是否存在，避免重复执行时插入重复演示数据 */
async function insertRowIfMissing(
  source: DevDataSource,
  table: string,
  matchColumn: string,
  matchValue: string | number,
  row: DemoRow,
): Promise<number | null> {
  const matchSql = `SELECT ${quote(source, 'id')} AS id FROM ${quote(source, table)} WHERE ${quote(source, matchColumn)} = ${placeholder(source, 1)} LIMIT 1`;
  const found = await withDataSource(source, (query) => query(matchSql, [matchValue]));
  if (found.length > 0) return Number(found[0].id);

  const columns = Object.keys(row);
  const values = Object.values(row);
  const insertSql =
    `INSERT INTO ${quote(source, table)} (${columns.map((column) => quote(source, column)).join(', ')}) ` +
    `VALUES (${values.map((_value, index) => placeholder(source, index + 1)).join(', ')})`;
  await withDataSource(source, (query) => query(insertSql, values));
  const created = await withDataSource(source, (query) => query(matchSql, [matchValue]));
  return created.length > 0 ? Number(created[0].id) : null;
}

const now = new Date();

const CUSTOMERS: Array<{ key: string; row: DemoRow }> = [
  {
    key: '华东贸易有限公司',
    row: { customer_name: '华东贸易有限公司', contact: '张伟', phone: '13800000001', level: '重点客户', region: '华东' },
  },
  {
    key: '江南智能制造有限公司',
    row: { customer_name: '江南智能制造有限公司', contact: '李娜', phone: '13800000002', level: '普通客户', region: '华东' },
  },
  {
    key: '北方物流集团',
    row: { customer_name: '北方物流集团', contact: '王强', phone: '13800000003', level: '潜在客户', region: '华北' },
  },
];

const ORDERS: Array<{
  order_no: string;
  row: DemoRow;
  items: Array<DemoRow>;
}> = [
  {
    order_no: 'PO-2026-0001',
    row: {
      order_no: 'PO-2026-0001',
      supplier: '华东供应链有限公司',
      order_date: '2026-11-02',
      amount: 12800,
      status: '已完成',
      customer_ref: JSON.stringify({ v: '华东贸易有限公司', l: '华东贸易有限公司' }),
      city: JSON.stringify({ v: '上海市', l: '上海市' }),
      image: JSON.stringify(['/uploads/demo_order_1.png']),
      attachments: JSON.stringify(['/uploads/demo_contract_1.txt']),
      remark: '办公家具年度集采，含安装与旧家具回收。',
    },
    items: [
      { product_name: '办公桌', spec: '1400×700mm', qty: 12, price: 650 },
      { product_name: '人体工学椅', spec: '网布 / 可调扶手', qty: 12, price: 420 },
    ],
  },
  {
    order_no: 'PO-2026-0002',
    row: {
      order_no: 'PO-2026-0002',
      supplier: '江南五金厂',
      order_date: '2026-11-08',
      amount: 6400.5,
      status: '已下单',
      customer_ref: JSON.stringify({ v: '江南智能制造有限公司', l: '江南智能制造有限公司' }),
      city: JSON.stringify({ v: '南京市', l: '南京市' }),
      image: JSON.stringify(['/uploads/demo_order_2.png']),
      attachments: JSON.stringify(['/uploads/demo_contract_2.txt']),
      remark: '产线易损件补货，分两批交货。',
    },
    items: [
      { product_name: '深沟球轴承', spec: '6204-2RS', qty: 200, price: 18.5 },
      { product_name: '密封圈', spec: '50mm 丁腈', qty: 400, price: 3.2 },
      { product_name: '润滑脂', spec: '2kg / 桶', qty: 20, price: 65 },
    ],
  },
  {
    order_no: 'PO-2026-0003',
    row: {
      order_no: 'PO-2026-0003',
      supplier: '北方包装材料厂',
      order_date: '2026-11-15',
      amount: 9800,
      status: '待审核',
      customer_ref: JSON.stringify({ v: '北方物流集团', l: '北方物流集团' }),
      city: JSON.stringify({ v: '北京市', l: '北京市' }),
      image: JSON.stringify(['/uploads/demo_order_3.png']),
      attachments: JSON.stringify(['/uploads/demo_contract_3.txt']),
      remark: '旺季包装耗材备货，待采购经理审批。',
    },
    items: [
      { product_name: '五层瓦楞纸箱', spec: '600×400×400mm', qty: 500, price: 2.8 },
      { product_name: '缠绕膜', spec: '50cm × 300m', qty: 40, price: 22 },
    ],
  },
];

async function seedBusinessRows(source: DevDataSource): Promise<void> {
  ensureDemoAssets();
  for (const customer of CUSTOMERS) {
    await insertRowIfMissing(source, 'demo_customer', 'customer_name', customer.key, {
      ...customer.row,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
  }
  for (const order of ORDERS) {
    const orderId = await insertRowIfMissing(source, 'demo_purchase_order', 'order_no', order.order_no, {
      ...order.row,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
    if (!orderId) continue;
    for (const item of order.items) {
      await insertRowIfMissing(source, 'demo_purchase_order_item', 'product_name', String(item.product_name), {
        ...item,
        order_id: orderId,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export async function seedDemoData(): Promise<void> {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  const source = await ensureConnection();
  if (!source) return;

  const tables = new Map<string, DbTableInfo>();
  for (const tableName of DEMO_TABLES) {
    const info = await syncTableMeta(source, tableName);
    if (info) tables.set(tableName, info);
  }
  if (tables.size === 0) {
    logger.warn('演示业务表均未就绪，跳过演示数据初始化');
    return;
  }

  const models = await ensureModels(source, tables);
  const apis = await ensureApis(source, models);
  await ensureForms(source, apis);
  await seedBusinessRows(source);
  logger.info({ tables: [...tables.keys()] }, '在线开发演示数据已就绪');
}

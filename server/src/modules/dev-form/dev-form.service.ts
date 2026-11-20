import { In } from 'typeorm';
import { AppDataSource } from '../../db/data-source';
import { DevDataSource, DevForm, SysMenu } from '../../db/entities';
import type { AuthContext } from '../../types/express';
import { AppError, ERROR_CODES } from '../../utils/app-error';
import { buildCodeArchive } from '../../utils/code-archive';
import { parsePagination } from '../../utils/pagination';
import {
  evaluateImportable,
  type DbColumnInfo,
  type DbTableInfo,
} from '../dev-db-table/dev-db-table.introspect';
import { findSyncedTable, tableInfoFromRow } from '../dev-db-table/dev-db-table.service';
import { withDataSource, type DataSourceQuery } from '../dev-data-source/data-source.client';
import { formMenuPerm } from '../menu/menu.constants';
import { generateDevFormCode, generateDevFormTableCode } from './codegen';
import { SYSTEM_COLUMNS, isFormTypeCompatible, toCamel } from './dev-form.field-mapper';
import {
  DISPLAY_ONLY_FIELD_TYPES,
  devFormSchema,
  type CreateDevFormInput,
  type DevFormQuery,
  type DevFormSchemaInput,
  type UpdateDevFormInput,
} from './dev-form.dto';

function repo() {
  return AppDataSource.getRepository(DevForm);
}

const EMPTY_SCHEMA: DevFormSchemaInput = {
  columns: 1,
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
  fields: [],
  list: {
    queryFields: [],
    listFields: [],
    queryColumns: [],
    listColumns: [],
    subtableView: 'merge',
  },
  tables: [],
  subtables: [],
};

function parseSchema(row: DevForm): DevFormSchemaInput {
  try {
    const parsed = devFormSchema.safeParse(JSON.parse(row.schema_json));
    if (!parsed.success) throw new Error('invalid schema');
    return parsed.data;
  } catch {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '表单结构已损坏，请重新编辑后保存');
  }
}

function toSummary(row: DevForm) {
  return {
    id: row.id,
    name: row.name,
    formKey: row.form_key,
    description: row.description,
    connectionId: row.connection_id,
    tableName: row.table_name,
    status: row.status,
    version: row.version,
    publishedAt: row.published_at,
    updatedBy: row.updated_by,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toDetail(row: DevForm) {
  return { ...toSummary(row), schema: parseSchema(row) };
}

async function findOrFail(id: number): Promise<DevForm> {
  const row = await repo().findOneBy({ id });
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, '表单不存在');
  return row;
}

interface AssociationContext {
  source: DevDataSource;
  tableInfo: DbTableInfo;
  businessColumns: DbColumnInfo[];
  columnMap: Map<string, DbColumnInfo>;
}

async function loadAssociation(
  connectionId: number | null | undefined,
  tableName: string | null | undefined,
): Promise<AssociationContext | null> {
  if (!connectionId && !tableName) return null;
  if (!connectionId || !tableName) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '数据连接和数据库表必须同时选择');
  }

  const source = await AppDataSource.getRepository(DevDataSource).findOneBy({ id: connectionId });
  if (!source) throw new AppError(ERROR_CODES.VALIDATION_FAILED, '数据连接不存在');

  const synced = await findSyncedTable(connectionId, tableName);
  if (!synced) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      '该表尚未同步，请先到数据连接测试或手动同步表结构',
    );
  }

  const tableInfo = tableInfoFromRow(synced);
  const compatibility = evaluateImportable(tableInfo);
  if (!compatibility.importable) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      `该表暂不支持作为表单数据源：${compatibility.importMessage ?? '结构不兼容'}`,
    );
  }

  const businessColumns = tableInfo.columns.filter(
    (column) => !SYSTEM_COLUMNS.has(column.columnName),
  );
  return {
    source,
    tableInfo,
    businessColumns,
    columnMap: new Map(businessColumns.map((column) => [column.columnName, column])),
  };
}

function validateAssociation(
  schema: DevFormSchemaInput,
  context: AssociationContext,
  strict: boolean,
): void {
  if (schema.fields.length === 0) {
    if (strict) throw new AppError(ERROR_CODES.VALIDATION_FAILED, '请至少添加一个表单字段');
    return;
  }

  const usedColumns = new Set<string>();
  for (const field of schema.fields) {
    if (!field.columnName) {
      // 二维码/条码为展示型控件，内容不落库，允许不绑定数据库字段
      if (DISPLAY_ONLY_FIELD_TYPES.includes(field.type)) continue;
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `字段「${field.label}」尚未关联数据库字段`,
      );
    }
    const column = context.columnMap.get(field.columnName);
    if (!column) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `数据库字段不存在：${field.columnName}`,
      );
    }
    if (usedColumns.has(field.columnName)) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `数据库字段重复映射：${field.columnName}`,
      );
    }
    usedColumns.add(field.columnName);

    const expectedName = toCamel(column.columnName);
    if (field.name !== expectedName) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `字段「${field.label}」的字段名应为 ${expectedName}`,
      );
    }
    if (!isFormTypeCompatible(column, field.type)) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `字段「${field.label}」的组件类型与数据库字段 ${column.columnName} 不匹配`,
      );
    }
    if (!column.nullable && !field.required) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `非空数据库字段「${column.columnName}」必须设为必填`,
      );
    }
  }

  if (strict) {
    const missingRequired = context.businessColumns.filter(
      (column) => !column.nullable && !usedColumns.has(column.columnName),
    );
    if (missingRequired.length > 0) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `非空数据库字段必须包含在表单中：${missingRequired
          .slice(0, 5)
          .map((column) => column.columnName)
          .join('、')}`,
      );
    }
    if (schema.list.listFields.length === 0) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, '请至少选择一个列表字段');
    }
  }

  for (const columnName of [...schema.list.queryFields, ...schema.list.listFields]) {
    if (!context.columnMap.has(columnName)) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, `查询/列表字段不存在：${columnName}`);
    }
  }
  if (new Set(schema.list.queryFields).size !== schema.list.queryFields.length) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '查询字段存在重复');
  }
  if (new Set(schema.list.listFields).size !== schema.list.listFields.length) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '列表字段存在重复');
  }
}

/**
 * 主从表关系要落到真实库上校验：表已同步、外键列存在、被引用的是主表主键且类型一致。
 * 从表只校验列元数据，不要求满足表单数据源的结构要求（明细表通常没有 created_at 等）。
 */
async function validateTableRelations(
  connectionId: number | null | undefined,
  schema: DevFormSchemaInput,
  masterTableName: string | null | undefined,
): Promise<void> {
  if (schema.tables.length === 0) return;

  const master = schema.tables.find((table) => table.role === 'MASTER');
  if (!master) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '关联多张表时必须指定唯一的主表');
  }
  if (masterTableName && master.tableName !== masterTableName) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '主表与表单关联的数据表不一致，请重新选择');
  }
  if (!connectionId) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '请先选择数据连接');
  }

  const masterSynced = await findSyncedTable(connectionId, master.tableName);
  if (!masterSynced) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      `主表 ${master.tableName} 尚未同步，请先同步表结构`,
    );
  }
  const masterInfo = tableInfoFromRow(masterSynced);

  const slaves = schema.tables.filter((table) => table.role === 'SLAVE');
  for (const slave of slaves) {
    if (!slave.foreignKey || !slave.masterColumn) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `从表 ${slave.tableName} 必须同时指定外键字段和关联的主表字段`,
      );
    }

    const slaveSynced = await findSyncedTable(connectionId, slave.tableName);
    if (!slaveSynced) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `从表 ${slave.tableName} 尚未同步，请先同步表结构`,
      );
    }
    const slaveInfo = tableInfoFromRow(slaveSynced);

    const foreignColumn = slaveInfo.columns.find(
      (column) => column.columnName === slave.foreignKey,
    );
    if (!foreignColumn) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `从表 ${slave.tableName} 不存在外键字段 ${slave.foreignKey}`,
      );
    }

    const masterColumn = masterInfo.columns.find(
      (column) => column.columnName === slave.masterColumn,
    );
    if (!masterColumn) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `主表 ${master.tableName} 不存在字段 ${slave.masterColumn}`,
      );
    }
    if (!masterColumn.primary) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `只能关联主表的主键字段，${master.tableName}.${slave.masterColumn} 不是主键`,
      );
    }
    if (!isKeyTypeCompatible(foreignColumn, masterColumn)) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `外键 ${slave.tableName}.${slave.foreignKey}（${foreignColumn.rawType}）与主键 ` +
          `${master.tableName}.${slave.masterColumn}（${masterColumn.rawType}）类型不一致`,
      );
    }
  }
}

/**
 * 子表设计要落到真实从表上校验：从表已在基础设计声明、
 * 明细字段都存在于该从表、控件类型兼容、非空列必须必填。
 * 外键列由运行时维护，不允许放进明细字段。
 */
async function validateSubTables(
  connectionId: number | null | undefined,
  schema: DevFormSchemaInput,
): Promise<void> {
  if (schema.subtables.length === 0) return;
  if (!connectionId) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '请先选择数据连接');
  }

  for (const subtable of schema.subtables) {
    const relation = schema.tables.find(
      (table) => table.role === 'SLAVE' && table.tableName === subtable.tableName,
    );
    if (!relation) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `子表 ${subtable.tableName} 未在关联从表中声明，请先到基础设计添加该从表`,
      );
    }
    if (subtable.foreignKey && relation.foreignKey && subtable.foreignKey !== relation.foreignKey) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `子表 ${subtable.tableName} 的外键与基础设计不一致，请重新拖入该从表`,
      );
    }

    const synced = await findSyncedTable(connectionId, subtable.tableName);
    if (!synced) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `从表 ${subtable.tableName} 尚未同步，请先同步表结构`,
      );
    }
    const info = tableInfoFromRow(synced);
    if (subtable.columns.length === 0) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `子表「${subtable.label}」还没有明细字段，请从左侧拖入从表字段`,
      );
    }

    const used = new Set<string>();
    for (const column of subtable.columns) {
      if (SYSTEM_COLUMNS.has(column.columnName)) {
        throw new AppError(
          ERROR_CODES.VALIDATION_FAILED,
          `系统字段 ${column.columnName} 不能作为明细字段`,
        );
      }
      if (relation.foreignKey && column.columnName === relation.foreignKey) {
        throw new AppError(
          ERROR_CODES.VALIDATION_FAILED,
          `外键字段 ${column.columnName} 由系统自动维护，不能作为明细字段`,
        );
      }
      const target = info.columns.find((item) => item.columnName === column.columnName);
      if (!target) {
        throw new AppError(
          ERROR_CODES.VALIDATION_FAILED,
          `从表 ${subtable.tableName} 不存在字段 ${column.columnName}`,
        );
      }
      if (used.has(column.columnName)) {
        throw new AppError(
          ERROR_CODES.VALIDATION_FAILED,
          `明细字段重复映射：${column.columnName}`,
        );
      }
      used.add(column.columnName);

      const expectedName = toCamel(target.columnName);
      if (column.name !== expectedName) {
        throw new AppError(
          ERROR_CODES.VALIDATION_FAILED,
          `明细字段「${column.label}」的字段名应为 ${expectedName}`,
        );
      }
      if (!isFormTypeCompatible(target, column.type)) {
        throw new AppError(
          ERROR_CODES.VALIDATION_FAILED,
          `明细字段「${column.label}」的组件类型与 ${target.columnName} 不匹配`,
        );
      }
      if (!target.nullable && !column.required) {
        throw new AppError(
          ERROR_CODES.VALIDATION_FAILED,
          `从表非空字段「${target.columnName}」必须设为必填`,
        );
      }
      // 非空列在录入时必须有入口，隐藏后运行时无法补值
      if (!target.nullable && column.visible === false) {
        throw new AppError(
          ERROR_CODES.VALIDATION_FAILED,
          `从表非空字段「${target.columnName}」不能隐藏，请保持显示`,
        );
      }
    }

    for (const name of [...subtable.queryFields, ...subtable.listFields]) {
      if (!used.has(name)) {
        throw new AppError(
          ERROR_CODES.VALIDATION_FAILED,
          `子表 ${subtable.tableName} 的查询/明细列 ${name} 不在已选明细字段中`,
        );
      }
    }
  }
}

/** 整数族之间允许互通（int/bigint 映射后都是 int），其余必须同类型 */
function isKeyTypeCompatible(left: DbColumnInfo, right: DbColumnInfo): boolean {  if (left.type === right.type) return true;
  const numeric = new Set(['int', 'decimal']);
  return (
    left.type !== null &&
    right.type !== null &&
    numeric.has(left.type) &&
    numeric.has(right.type)
  );
}

/** 表单列表需要展示已生成的菜单路径，批量取一次避免 N+1 */
async function attachMenuInfo<T extends { id: number; formKey: string }>(
  rows: T[],
): Promise<Array<T & { menuId: number | null; menuPath: string | null }>> {
  if (rows.length === 0) return [];
  const menus = await AppDataSource.getRepository(SysMenu).find({
    where: [
      // 运行时菜单（type=FORM，绑定 form_id）
      { type: 'FORM', form_id: In(rows.map((row) => row.id)) },
      // 生成页菜单（type=MENU，路径 /biz/<form_key>，没有 form_id）
      { type: 'MENU', path: In(rows.map((row) => `/biz/${row.formKey}`)) },
    ],
    select: { id: true, form_id: true, path: true },
  });
  const byForm = new Map<number, SysMenu>();
  const byPath = new Map<string, SysMenu>();
  for (const menu of menus) {
    if (menu.form_id) byForm.set(menu.form_id, menu);
    else if (menu.path) byPath.set(menu.path, menu);
  }
  return rows.map((row) => {
    const menu = byForm.get(row.id) ?? byPath.get(`/biz/${row.formKey}`);
    return { ...row, menuId: menu?.id ?? null, menuPath: menu?.path ?? null };
  });
}

export async function listDevForms(query: DevFormQuery) {
  const { page, pageSize, keyword, status } = query;
  const qb = repo()
    .createQueryBuilder('form')
    .orderBy('form.updatedAt', 'DESC')
    .skip((page - 1) * pageSize)
    .take(pageSize);

  if (keyword) {
    qb.andWhere('(form.name LIKE :keyword OR form.form_key LIKE :keyword)', {
      keyword: `%${keyword}%`,
    });
  }
  if (status) qb.andWhere('form.status = :status', { status });

  const [rows, total] = await qb.getManyAndCount();
  const withMenu = await attachMenuInfo(rows.map(toSummary));
  return { list: withMenu, total, page, pageSize };
}

export async function getDevForm(id: number) {
  return toDetail(await findOrFail(id));
}

export async function createDevForm(input: CreateDevFormInput, operator: AuthContext) {
  const exists = await repo().findOne({ where: { form_key: input.formKey }, withDeleted: true });
  if (exists) throw new AppError(ERROR_CODES.VALIDATION_FAILED, '表单编码已存在');

  const schema = input.schema ?? EMPTY_SCHEMA;
  // 主表以 schema 中的 MASTER 为准，table_name 只做冗余列供列表/运行时使用
  const tableName =
    input.tableName ?? schema.tables.find((table) => table.role === 'MASTER')?.tableName ?? null;
  const association = await loadAssociation(input.connectionId, tableName);
  if (association) validateAssociation(schema, association, false);
  await validateTableRelations(input.connectionId, schema, tableName);
  await validateSubTables(input.connectionId, schema);

  const row = repo().create({
    name: input.name,
    form_key: input.formKey,
    description: input.description ?? null,
    connection_id: input.connectionId ?? null,
    table_name: tableName,
    schema_json: JSON.stringify(schema),
    status: 'DRAFT',
    version: 1,
    published_at: null,
    updated_by: operator.username,
  });
  await repo().save(row);
  return toDetail(row);
}

export async function updateDevForm(id: number, input: UpdateDevFormInput, operator: AuthContext) {
  const row = await findOrFail(id);
  const nextConnectionId =
    input.connectionId !== undefined ? input.connectionId : row.connection_id;
  const nextSchema = input.schema ?? parseSchema(row);
  const nextTableName =
    input.tableName ??
    nextSchema.tables.find((table) => table.role === 'MASTER')?.tableName ??
    row.table_name;

  const association = await loadAssociation(nextConnectionId, nextTableName);
  if (association) validateAssociation(nextSchema, association, false);
  await validateTableRelations(nextConnectionId, nextSchema, nextTableName);
  await validateSubTables(nextConnectionId, nextSchema);

  const patch: Partial<DevForm> = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description ?? null } : {}),
    ...(input.connectionId !== undefined ? { connection_id: input.connectionId ?? null } : {}),
    ...(input.tableName !== undefined || nextTableName !== row.table_name
      ? { table_name: nextTableName ?? null }
      : {}),
    ...(input.schema !== undefined ? { schema_json: JSON.stringify(input.schema) } : {}),
    updated_by: operator.username,
  };

  // 已发布表单改了结构/数据源后回到草稿，避免代码和线上版本不一致
  if (
    row.status === 'PUBLISHED' &&
    (input.schema !== undefined ||
      input.connectionId !== undefined ||
      input.tableName !== undefined)
  ) {
    patch.status = 'DRAFT';
  }

  await repo().update(id, patch);
  return toDetail(await findOrFail(id));
}

export async function publishDevForm(id: number, operator: AuthContext) {
  const row = await findOrFail(id);
  const schema = parseSchema(row);

  const association = await loadAssociation(row.connection_id, row.table_name);
  if (!association) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '请先在步骤 1 关联数据表和数据库表');
  }
  validateAssociation(schema, association, true);

  const nextVersion = row.published_at ? row.version + 1 : row.version;
  await repo().update(id, {
    status: 'PUBLISHED',
    version: nextVersion,
    published_at: new Date(),
    updated_by: operator.username,
  });
  return toDetail(await findOrFail(id));
}

export async function deleteDevForm(id: number) {
  await findOrFail(id);
  await repo().delete({ id });
}

/** 生成页菜单的当前状态，供「生成代码」弹窗展示与下载前判断 */
export interface DevFormCodeMenuState {
  exists: boolean;
  menuId: number | null;
  name: string | null;
  path: string;
  component: string;
  /** 已有菜单但组件不是生成页（比如仍指向 biz/runtime/index） */
  componentMismatch: boolean;
  /** 已有菜单当前的组件与路径，用于提示差异 */
  currentComponent: string | null;
  currentPath: string | null;
  perm: string;
  parentId: number | null;
}

async function loadCodeMenuState(row: DevForm): Promise<DevFormCodeMenuState> {
  const path = `/biz/${row.form_key}`;
  const component = `biz/${row.form_key}/index`;
  const menu = await AppDataSource.getRepository(SysMenu).findOne({
    where: [{ form_id: row.id }, { path }],
    order: { id: 'ASC' },
  });
  return {
    exists: Boolean(menu),
    menuId: menu?.id ?? null,
    name: menu?.name ?? null,
    path,
    component,
    componentMismatch: Boolean(menu && menu.component !== component),
    currentComponent: menu?.component ?? null,
    currentPath: menu?.path ?? null,
    perm: formMenuPerm(row.form_key, 'list'),
    parentId: menu?.parent_id ?? null,
  };
}

export async function getDevFormCode(id: number) {
  const row = await findOrFail(id);
  const schema = parseSchema(row);
  if (schema.fields.length === 0) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '请先添加至少一个字段');
  }

  const association = await loadAssociation(row.connection_id, row.table_name);
  let files;
  if (association) {
    validateAssociation(schema, association, true);
    // 加载子表对应的从表元数据（生成明细 entity 与 CRUD 需要真实列类型）
    const subTableInfo: Record<string, NonNullable<Awaited<ReturnType<typeof findSyncedTable>>>> = {};
    for (const sub of schema.subtables) {
      const synced = await findSyncedTable(row.connection_id as number, sub.tableName);
      if (synced) subTableInfo[sub.tableName] = synced;
    }
    files = generateDevFormTableCode(
      row,
      schema,
      association.source,
      association.tableInfo,
      Object.fromEntries(
        Object.entries(subTableInfo).map(([name, synced]) => [name, tableInfoFromRow(synced)]),
      ),
    );
  } else {
    // 兼容未关联数据表的旧表单：按新表生成
    files = generateDevFormCode(row, schema);
  }

  return {
    formId: row.id,
    formKey: row.form_key,
    formName: row.name,
    status: row.status,
    version: row.version,
    generatedAt: new Date(),
    files,
    menu: await loadCodeMenuState(row),
  };
}

/** 生成代码并打包成 zip：包内路径即相对项目根目录，解压后直接落在 server/src/biz 与 admin/src/views/biz */
export async function getDevFormCodeArchive(id: number) {
  const result = await getDevFormCode(id);
  return buildCodeArchive(result.files, result.formKey);
}

/* ---------------- 在线预览（真实数据 CRUD） ---------------- */

interface PreviewContext {
  row: DevForm;
  schema: DevFormSchemaInput;
  association: AssociationContext;
  keyMap: Map<string, string>;
  /** 已落到真实从表上的明细设计，没有子表时为空数组 */
  subtables: SubTableContext[];
}

/** 一张从表的运行时上下文：外键/关联列以基础设计的 SLAVE 声明为准 */
interface SubTableContext {
  schema: DevFormSchemaInput['subtables'][number];
  tableInfo: DbTableInfo;
  columns: DbColumnInfo[];
  columnMap: Map<string, DbColumnInfo>;
  foreignKey: string;
  masterColumn: string;
  hasId: boolean;
  hasDeletedAt: boolean;
  hasCreatedAt: boolean;
  hasUpdatedAt: boolean;
}

function previewQuote(dbType: 'mysql' | 'postgres', name: string): string {
  return dbType === 'mysql'
    ? `\`${name.replace(/`/g, '``')}\``
    : `"${name.replace(/"/g, '""')}"`;
}

function previewBinder(dbType: 'mysql' | 'postgres') {
  const params: unknown[] = [];
  return {
    params,
    bind(value: unknown): string {
      params.push(value);
      return dbType === 'mysql' ? '?' : `$${params.length}`;
    },
  };
}

function previewColumnSet(context: PreviewContext): Set<string> {
  return new Set(context.association.tableInfo.columns.map((column) => column.columnName));
}

function previewNormalizeValue(column: DbColumnInfo, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (column.type === 'boolean') {
    return value === true || value === 1 || value === '1';
  }
  if (column.type === 'int' || column.type === 'decimal') {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  if (column.type === 'date') {
    // 数据库 date 列在国内时区被驱动解析成「本地 00:00」，用 toISOString 会倒退一天
    if (value instanceof Date) {
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${value.getFullYear()}-${month}-${day}`;
    }
    return String(value).slice(0, 10);
  }
  if (column.type === 'datetime') {
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }
  return value;
}

/** 值存 {v,l} JSON 的输入型控件：关联表单 / 弹框选择 / 用户选择 / 角色选择 */
const PICKER_FIELD_TYPES = new Set(['relationForm', 'dialogSelect', 'userSelect', 'roleSelect']);

/**
 * 把 {v,l} / [{v,l}] 还原成回显文本，由预览接口直接返回给列表展示。
 * 只读出 l（无 l 时退化用 v）；原值仍保留在字段本身，编辑回显不受影响。
 */
function pickerDisplayText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  let parsed: unknown = value;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text || (text[0] !== '{' && text[0] !== '[')) return null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const labels: string[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const label = record.l ?? record.label ?? record.v ?? record.value;
    if (label === null || label === undefined) continue;
    labels.push(String(label));
  }
  return labels.length > 0 ? labels.join('、') : null;
}

/** 给关联表单 / 弹框选择字段补 <字段名>Label，供列表/明细只读格直接展示 */
function attachPickerLabels(output: Record<string, unknown>, fields: Array<{ name: string; type: string }>) {
  for (const field of fields) {
    if (!PICKER_FIELD_TYPES.has(field.type)) continue;
    const label = pickerDisplayText(output[field.name]);
    if (label !== null) output[`${field.name}Label`] = label;
  }
}

/**
 * 展开模式下子表列是后端拼好的一段文本（多行的 JSON 以 ', ' 相连），
 * 逐段还原出回显文本，让前端拿到即可展示。
 */
function pickerAggregateLabels(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value);
  const labels: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    if (text[cursor] !== '{' && text[cursor] !== '[') {
      cursor += 1;
      continue;
    }
    let matched = false;
    for (let end = text.length; end > cursor; end -= 1) {
      try {
        const label = pickerDisplayText(JSON.parse(text.slice(cursor, end)));
        if (label !== null) labels.push(label);
        cursor = end;
        matched = true;
        break;
      } catch {
        // 缩短候选片段再试
      }
    }
    if (!matched) cursor += 1;
  }
  return labels.length > 0 ? labels.join('、') : null;
}

function previewRow(context: PreviewContext, raw: Record<string, unknown>) {
  const output: Record<string, unknown> = { id: Number(raw.id) };
  for (const column of context.association.businessColumns) {
    const key = context.keyMap.get(column.columnName);
    if (key) output[key] = previewNormalizeValue(column, raw[column.columnName]);
  }
  if ('created_at' in raw) output.createdAt = raw.created_at;
  if ('updated_at' in raw) output.updatedAt = raw.updated_at;
  attachPickerLabels(output, context.schema.fields);
  return output;
}

/**
 * 把子表设计翻译成真实从表上下文：校验从表存在、外键列存在、关联列在从表/主表都对得上。
 * 预览/运行时都从这里取明细结构，避免各处重复解释 schema。
 */
async function loadSubTableContexts(
  schema: DevFormSchemaInput,
  master: AssociationContext,
): Promise<SubTableContext[]> {
  if (schema.subtables.length === 0) return [];
  const connectionId = master.source.id;

  const contexts: SubTableContext[] = [];
  for (const subtable of schema.subtables) {
    const relation = schema.tables.find(
      (table) => table.role === 'SLAVE' && table.tableName === subtable.tableName,
    );
    if (!relation) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `子表 ${subtable.tableName} 未在关联从表中声明`,
      );
    }

    const foreignKey = subtable.foreignKey || relation.foreignKey;
    const masterColumn = subtable.masterColumn || relation.masterColumn;
    if (!foreignKey || !masterColumn) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `子表 ${subtable.tableName} 缺少外键或关联主表字段`,
      );
    }

    const synced = await findSyncedTable(connectionId, subtable.tableName);
    if (!synced) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `从表 ${subtable.tableName} 尚未同步，请先同步表结构`,
      );
    }
    const tableInfo = tableInfoFromRow(synced);
    const columnMap = new Map(tableInfo.columns.map((column) => [column.columnName, column]));

    const foreignColumn = columnMap.get(foreignKey);
    if (!foreignColumn) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `从表 ${subtable.tableName} 不存在外键列 ${foreignKey}`,
      );
    }
    const masterTarget = master.tableInfo.columns.find(
      (column) => column.columnName === masterColumn,
    );
    if (!masterTarget) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `主表 ${master.tableInfo.tableName} 不存在关联列 ${masterColumn}`,
      );
    }
    if (!isKeyTypeCompatible(foreignColumn, masterTarget)) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `子表 ${subtable.tableName}.${foreignKey} 与主表 ${masterColumn} 类型不兼容`,
      );
    }

    const columns: DbColumnInfo[] = [];
    for (const field of subtable.columns) {
      const column = columnMap.get(field.columnName);
      if (!column) {
        throw new AppError(
          ERROR_CODES.VALIDATION_FAILED,
          `子表 ${subtable.tableName} 不存在明细字段 ${field.columnName}`,
        );
      }
      columns.push(column);
    }

    contexts.push({
      schema: subtable,
      tableInfo,
      columns,
      columnMap,
      foreignKey,
      masterColumn,
      hasId: columnMap.has('id'),
      hasDeletedAt: columnMap.has('deleted_at'),
      hasCreatedAt: columnMap.has('created_at'),
      hasUpdatedAt: columnMap.has('updated_at'),
    });
  }

  return contexts;
}

async function loadPreviewContext(id: number): Promise<PreviewContext> {
  const row = await findOrFail(id);
  const schema = parseSchema(row);
  const association = await loadAssociation(row.connection_id, row.table_name);
  if (!association) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '该表单未关联数据表，暂不能在线预览');
  }
  validateAssociation(schema, association, false);

  const keyMap = new Map<string, string>();
  for (const field of schema.fields) {
    if (field.columnName) keyMap.set(field.columnName, field.name);
  }
  for (const column of association.businessColumns) {
    if (!keyMap.has(column.columnName)) keyMap.set(column.columnName, toCamel(column.columnName));
  }

  for (const columnName of [...schema.list.queryFields, ...schema.list.listFields]) {
    if (!association.columnMap.has(columnName)) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, `查询/列表字段不存在：${columnName}`);
    }
  }

  const subtables = await loadSubTableContexts(schema, association);

  // 查询/列表明细可能引用子表字段，校验落到真实从表上
  const subTableMap = new Map(subtables.map((sub) => [sub.schema.tableName, sub]));
  const assertListColumns = (
    items: Array<{ columnName: string; source: 'master' | 'subtable'; tableName?: string | null }>,
    label: string,
  ) => {
    for (const item of items) {
      if (item.source === 'subtable') {
        const sub = item.tableName ? subTableMap.get(item.tableName) : null;
        if (!sub) {
          throw new AppError(
            ERROR_CODES.VALIDATION_FAILED,
            `${label}引用的子表不存在：${item.tableName ?? '-'}`,
          );
        }
        if (!sub.columnMap.has(item.columnName)) {
          throw new AppError(
            ERROR_CODES.VALIDATION_FAILED,
            `${label}引用的子表字段不存在：${item.tableName}.${item.columnName}`,
          );
        }
        continue;
      }
      if (!association.columnMap.has(item.columnName)) {
        throw new AppError(
          ERROR_CODES.VALIDATION_FAILED,
          `${label}不存在：${item.columnName}`,
        );
      }
    }
  };
  assertListColumns(schema.list.queryColumns, '查询字段');
  assertListColumns(schema.list.listColumns, '列表字段');

  return { row, schema, association, keyMap, subtables };
}

function previewSelectColumns(context: PreviewContext): string[] {
  const available = previewColumnSet(context);
  const names = [
    'id',
    ...context.association.businessColumns.map((column) => column.columnName),
    'created_at',
    'updated_at',
  ];
  return [...new Set(names)].filter((name) => available.has(name));
}

interface PreviewSubListColumn {
  /** 前端列 prop，与查询参数键同构：sub_<表名>_<列名> */
  prop: string;
  sql: string;
}

/**
 * 列表里展示子表字段：一对多没法直接平铺，用相关子查询把明细值拼成一段文本
 * （最多取 20 条，按 id 升序），列表单元格直接展示。
 */
function previewSubListColumns(
  context: PreviewContext,
  dbType: 'mysql' | 'postgres',
  q: (name: string) => string,
): PreviewSubListColumn[] {
  const configured = context.schema.list.listColumns.filter(
    (item) => item.source === 'subtable',
  );
  if (configured.length === 0) return [];

  const subs = new Map(context.subtables.map((sub) => [sub.schema.tableName, sub]));
  const masterTable = context.row.table_name as string;
  const result: PreviewSubListColumn[] = [];

  for (const item of configured) {
    const sub = item.tableName ? subs.get(item.tableName) : null;
    if (!sub) continue;
    const column = sub.columnMap.get(item.columnName);
    if (!column) continue;

    // postgres 的 string_agg 只接受 text，日期/数字要显式转换；布尔转成中文
    const expr =
      column.type === 'boolean'
        ? `CASE WHEN ${q(item.columnName)} THEN '是' ELSE '否' END`
        : dbType === 'postgres'
          ? `CAST(${q(item.columnName)} AS TEXT)`
          : q(item.columnName);
    const orderColumn = sub.hasId ? 'id' : item.columnName;
    const where = [
      `${q(sub.foreignKey)} = ${q(masterTable)}.${q(sub.masterColumn)}`,
    ];
    if (sub.hasDeletedAt) where.push(`${q('deleted_at')} IS NULL`);
    const inner = `SELECT ${expr} AS v, ${q(orderColumn)} AS ord FROM ${q(sub.schema.tableName)} WHERE ${where.join(' AND ')} ORDER BY ${q(orderColumn)} LIMIT 20`;
    const aggregate =
      dbType === 'mysql'
        ? `GROUP_CONCAT(v ORDER BY ord SEPARATOR ', ')`
        : `string_agg(v, ', ' ORDER BY ord)`;

    result.push({
      prop: `sub_${sub.schema.tableName}_${item.columnName}`,
      sql: `(SELECT ${aggregate} FROM (${inner}) AS s)`,
    });
  }
  return result;
}

/** 列表排序：只允许主表已存在的列，避免拼进未校验的标识符 */
function previewOrderBy(
  context: PreviewContext,
  query: Record<string, unknown>,
  q: (name: string) => string,
): string {
  const available = previewColumnSet(context);
  const defaultOrder = available.has('created_at')
    ? `${q('created_at')} DESC, ${q('id')} DESC`
    : `${q('id')} DESC`;

  const rawBy = Array.isArray(query.sortBy) ? query.sortBy[0] : query.sortBy;
  const rawOrder = Array.isArray(query.sortOrder) ? query.sortOrder[0] : query.sortOrder;
  const columnName = typeof rawBy === 'string' ? rawBy.trim() : '';
  const order = String(rawOrder ?? '').toUpperCase();
  if (!columnName || (order !== 'ASC' && order !== 'DESC')) return defaultOrder;
  if (!available.has(columnName)) return defaultOrder;
  return `${q(columnName)} ${order}`;
}

/** 明细查询字段在前端参数里的键：sub_<表名>_<列名> */
export function previewSubQueryKey(tableName: string, columnName: string): string {
  return `sub_${tableName}_${columnName}`;
}

type PreviewOperator = 'like' | 'eq' | 'gt' | 'gte' | 'lt' | 'lte';

const PREVIEW_OPERATOR_SQL: Record<Exclude<PreviewOperator, 'like' | 'eq'>, string> = {
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

/** 单个值 + 条件类型 → SQL 片段；主表查询与子表 EXISTS 子查询共用 */
function previewScalarCondition(
  dbType: 'mysql' | 'postgres',
  column: DbColumnInfo,
  columnName: string,
  value: unknown,
  binder: ReturnType<typeof previewBinder>,
  operator: PreviewOperator,
): string | null {
  const quoted = previewQuote(dbType, columnName);
  const compare = operator === 'like' || operator === 'eq' ? '=' : PREVIEW_OPERATOR_SQL[operator];

  if (column.type === 'int' || column.type === 'decimal') {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    // 数字列不区分「包含」，一律按比较处理
    return `${quoted} ${compare} ${binder.bind(number)}`;
  }
  if (column.type === 'boolean') {
    const bool = value === true || value === 'true' || value === '1' || value === 1;
    return `${quoted} = ${binder.bind(dbType === 'mysql' ? (bool ? 1 : 0) : bool)}`;
  }
  if (column.type === 'date' || column.type === 'datetime') {
    const start = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(start.getTime())) return null;
    if (operator === 'gt') return `${quoted} > ${binder.bind(start)}`;
    if (operator === 'gte') return `${quoted} >= ${binder.bind(start)}`;
    if (operator === 'lt') return `${quoted} < ${binder.bind(start)}`;
    const end = new Date(start);
    if (operator === 'lte') {
      end.setDate(end.getDate() + 1);
      return `${quoted} < ${binder.bind(end)}`;
    }
    // 等于 / 包含：按当天区间匹配
    end.setDate(end.getDate() + 1);
    return `${quoted} >= ${binder.bind(start)} AND ${quoted} < ${binder.bind(end)}`;
  }

  const text = String(value);
  if (operator === 'eq') return `${quoted} = ${binder.bind(text)}`;
  if (operator !== 'like') return `${quoted} ${compare} ${binder.bind(text)}`;
  return `${quoted} LIKE ${binder.bind(`%${text}%`)}`;
}

/** 支持多值（多选）：多值时按 OR 组合，文本多选即「包含任意一个」 */
function previewValueCondition(
  dbType: 'mysql' | 'postgres',
  column: DbColumnInfo,
  columnName: string,
  value: unknown,
  binder: ReturnType<typeof previewBinder>,
  operator: PreviewOperator = 'like',
): string | null {
  const values = (Array.isArray(value) ? value : [value]).filter(
    (item) => item !== undefined && item !== null && item !== '',
  );
  if (values.length === 0) return null;

  const parts = values
    .map((item) => previewScalarCondition(dbType, column, columnName, item, binder, operator))
    .filter((part): part is string => Boolean(part));
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `(${parts.join(' OR ')})`;
}

function previewWhere(
  context: PreviewContext,
  query: Record<string, unknown>,
  binder: ReturnType<typeof previewBinder>,
): string {
  const dbType = context.association.source.db_type;
  const q = (name: string) => previewQuote(dbType, name);
  const available = previewColumnSet(context);
  const conditions: string[] = [];
  const configured = context.schema.list.queryColumns;
  const useConfigured = configured.length > 0;

  if (available.has('deleted_at')) conditions.push(`${q('deleted_at')} IS NULL`);

  // 主表条件：优先使用第 3 步的详细配置（条件类型/多选/隐藏默认值），旧表单回落到 queryFields
  const masterColumns = useConfigured
    ? configured
        .filter((item) => item.source !== 'subtable')
        .map((item) => ({
          columnName: item.columnName,
          operator: item.operator as PreviewOperator,
          hidden: item.hidden,
          defaultValue: item.defaultValue,
        }))
    : context.schema.list.queryFields.map((columnName) => ({
        columnName,
        operator: 'like' as PreviewOperator,
        hidden: false,
        defaultValue: undefined as string | number | boolean | null | undefined,
      }));

  for (const item of masterColumns) {
    const column = context.association.columnMap.get(item.columnName);
    if (!column) continue;
    const key = context.keyMap.get(item.columnName) ?? toCamel(item.columnName);
    let raw = query[key];
    // 隐藏条件不在页面上出现，用设计时的默认值兜底
    if (
      (raw === undefined || raw === null || raw === '') &&
      item.hidden &&
      item.defaultValue !== undefined &&
      item.defaultValue !== null
    ) {
      raw = item.defaultValue;
    }
    if (raw === undefined || raw === null || raw === '') continue;
    const condition = previewValueCondition(
      dbType,
      column,
      item.columnName,
      raw,
      binder,
      item.operator,
    );
    if (condition) conditions.push(condition);
  }

  // 明细查询：同一子表的多个条件要求命中同一条明细（一个 EXISTS 里 AND 起来）
  for (const sub of context.subtables) {
    const subItems = useConfigured
      ? configured
          .filter(
            (item) => item.source === 'subtable' && item.tableName === sub.schema.tableName,
          )
          .map((item) => ({
            columnName: item.columnName,
            operator: item.operator as PreviewOperator,
            hidden: item.hidden,
            defaultValue: item.defaultValue,
          }))
      : sub.schema.queryFields.map((columnName) => ({
          columnName,
          operator: 'like' as PreviewOperator,
          hidden: false,
          defaultValue: undefined as string | number | boolean | null | undefined,
        }));
    if (subItems.length === 0) continue;

    const inner = [
      `${q(sub.foreignKey)} = ${q(context.row.table_name as string)}.${q(sub.masterColumn)}`,
    ];
    let matched = false;
    for (const item of subItems) {
      const column = sub.columnMap.get(item.columnName);
      if (!column) continue;
      const key = previewSubQueryKey(sub.schema.tableName, item.columnName);
      let raw = query[key];
      if (
        (raw === undefined || raw === null || raw === '') &&
        item.hidden &&
        item.defaultValue !== undefined &&
        item.defaultValue !== null
      ) {
        raw = item.defaultValue;
      }
      if (raw === undefined || raw === null || raw === '') continue;
      const matcher = previewValueCondition(
        dbType,
        column,
        item.columnName,
        raw,
        binder,
        item.operator,
      );
      if (!matcher) continue;
      inner.push(matcher);
      matched = true;
    }
    if (!matched) continue;
    if (sub.hasDeletedAt) inner.push(`${q('deleted_at')} IS NULL`);
    conditions.push(
      `EXISTS (SELECT 1 FROM ${q(sub.schema.tableName)} WHERE ${inner.join(' AND ')})`,
    );
  }

  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}

/**
 * 批量取明细：一次 IN 查询覆盖当前页所有主记录，避免逐行请求。
 * 返回 { 主记录 id: { 从表名: rows[] } }。
 */
async function previewDetailMap(
  context: PreviewContext,
  rows: Record<string, unknown>[],
  run: DataSourceQuery,
): Promise<Record<string, Record<string, Record<string, unknown>[]>>> {
  const map: Record<string, Record<string, Record<string, unknown>[]>> = {};
  for (const row of rows) map[String(row.id)] = {};
  if (context.subtables.length === 0 || rows.length === 0) return map;

  const dbType = context.association.source.db_type;
  const q = (name: string) => previewQuote(dbType, name);

  for (const sub of context.subtables) {
    // 主表关联列 → 主记录 id：主键通常就是 id，取不到时直接按 id 兜底
    const idByValue = new Map<string, string>();
    for (const row of rows) {
      const value = row[sub.masterColumn] ?? row.id;
      idByValue.set(String(value), String(row.id));
    }

    const binder = previewBinder(dbType);
    const placeholders = [...idByValue.keys()].map((value) => binder.bind(value)).join(', ');
    if (!placeholders) continue;

    const where = [`${q(sub.foreignKey)} IN (${placeholders})`];
    if (sub.hasDeletedAt) where.push(`${q('deleted_at')} IS NULL`);
    // 外键列不在明细字段里，但分组要用，必须显式选出
    const select = [...new Set([...previewSubSelectColumns(sub), sub.foreignKey])].map(q).join(', ');
    const orderColumn = sub.hasId ? 'id' : sub.hasCreatedAt ? 'created_at' : null;
    const order = orderColumn ? ` ORDER BY ${q(orderColumn)} ASC` : '';
    const detailRows = await run(
      `SELECT ${select} FROM ${q(sub.schema.tableName)} WHERE ${where.join(' AND ')}${order} LIMIT ${PREVIEW_DETAIL_MAX_ROWS * Math.max(rows.length, 1)}`,
      binder.params,
    );

    for (const detail of detailRows) {
      const masterId = idByValue.get(String(detail[sub.foreignKey]));
      if (!masterId) continue;
      const bucket = map[masterId];
      if (!bucket) continue;
      const list = bucket[sub.schema.tableName] ?? (bucket[sub.schema.tableName] = []);
      list.push(previewSubRow(sub, detail));
    }
  }

  return map;
}

export async function previewDevFormList(id: number, query: Record<string, unknown>) {
  const context = await loadPreviewContext(id);
  const { page, pageSize } = parsePagination(query);
  /** withDetails=1：主表列与子表列合并展示，明细随列表返回而不是聚合列 */
  const withDetails =
    query.withDetails === '1' || query.withDetails === 'true' || query.withDetails === true;
  const dbType = context.association.source.db_type;
  const q = (name: string) => previewQuote(dbType, name);
  const selectColumns = previewSelectColumns(context);
  if (selectColumns.length === 0) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '目标表没有可读取的字段');
  }
  const subColumns = withDetails ? [] : previewSubListColumns(context, dbType, q);
  const select = [
    ...selectColumns.map(q),
    // 子表列（列表里聚合展示明细值）
    ...subColumns.map((item) => `${item.sql} AS ${q(item.prop)}`),
  ].join(', ');
  const order = previewOrderBy(context, query, q);

  const listBinder = previewBinder(dbType);
  const where = previewWhere(context, query, listBinder);
  const limit = listBinder.bind(pageSize);
  const offset = listBinder.bind((page - 1) * pageSize);
  const listSql = `SELECT ${select} FROM ${q(context.row.table_name as string)} ${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`;

  const countBinder = previewBinder(dbType);
  const countWhere = previewWhere(context, query, countBinder);
  const countSql = `SELECT COUNT(*) AS total FROM ${q(context.row.table_name as string)} ${countWhere}`;

  try {
    const result = await withDataSource(context.association.source, async (run) => {
      const rows = await run(listSql, listBinder.params);
      const countRows = await run(countSql, countBinder.params);
      // 主表列与子表列合并展示时，明细随列表一起返回，前端按主记录拍平
      const detailMap = withDetails ? await previewDetailMap(context, rows, run) : null;
      return { rows, total: Number(countRows[0]?.total ?? 0), detailMap };
    });
    return {
      list: result.rows.map((row) => {
        const output = previewRow(context, row);
        for (const item of subColumns) {
          const value = row[item.prop];
          output[item.prop] = value === null || value === undefined || value === '' ? null : value;
          // 展开列若来自关联表单/弹框选择，补一份显示文本
          const listItem = context.schema.list.listColumns.find(
            (entry) =>
              entry.source === 'subtable' &&
              `sub_${entry.tableName}_${entry.columnName}` === item.prop,
          );
          const sub = listItem
            ? context.subtables.find((entry) => entry.schema.tableName === listItem.tableName)
            : undefined;
          const subColumn = sub?.schema.columns.find(
            (entry) => entry.columnName === listItem?.columnName,
          );
          if (subColumn && PICKER_FIELD_TYPES.has(subColumn.type)) {
            const label = pickerAggregateLabels(value);
            if (label !== null) output[`${item.prop}Label`] = label;
          }
        }
        if (result.detailMap) output.details = result.detailMap[String(row.id)] ?? {};
        return output;
      }),
      total: result.total,
      page,
      pageSize,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/\s+/g, ' ').slice(0, 300) : '未知错误';
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, `预览查询失败：${message}`);
  }
}

/** 主表字段与明细字段的公共形态，只依赖必填与标签 */
interface PreviewFieldLike {
  label: string;
  required?: boolean;
}

function previewCoerceValue(
  field: PreviewFieldLike,
  column: DbColumnInfo,
  raw: unknown,
): unknown {
  const empty =
    raw === undefined ||
    raw === null ||
    (typeof raw === 'string' && raw.trim() === '') ||
    (Array.isArray(raw) && raw.length === 0);
  const required = field.required || !column.nullable;
  if (required && empty) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, `请填写${field.label}`);
  }
  if (empty) return null;

  if (column.type === 'int' || column.type === 'decimal') {
    const number = Number(raw);
    if (!Number.isFinite(number)) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, `${field.label}必须是数字`);
    }
    return number;
  }
  if (column.type === 'boolean') {
    return raw === true || raw === 'true' || raw === '1' || raw === 1;
  }
  if (column.type === 'date' || column.type === 'datetime') {
    return String(raw);
  }
  if (Array.isArray(raw)) return raw.join(',');
  return String(raw);
}

function previewWriteValues(context: PreviewContext, body: Record<string, unknown>) {
  const columns: string[] = [];
  const values: unknown[] = [];
  for (const field of context.schema.fields) {
    if (!field.columnName) continue;
    const column = context.association.columnMap.get(field.columnName);
    if (!column) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, `数据库字段不存在：${field.columnName}`);
    }
    columns.push(field.columnName);
    values.push(previewCoerceValue(field, column, body[field.name]));
  }
  if (columns.length === 0) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '表单没有可写入的字段');
  }
  return { columns, values };
}

/* ---------------- 明细运行时（子表读写） ---------------- */

const PREVIEW_DETAIL_MAX_ROWS = 200;

/** 明细字段名映射：数据库列 -> camelCase 字段名（与设计器保存的 name 一致） */
function previewSubNameMap(sub: SubTableContext): Map<string, string> {
  return new Map(sub.schema.columns.map((column) => [column.columnName, column.name]));
}

function previewSubSelectColumns(sub: SubTableContext): string[] {
  const names = sub.columns.map((column) => column.columnName);
  if (sub.hasId) names.unshift('id');
  if (sub.hasCreatedAt) names.push('created_at');
  if (sub.hasUpdatedAt) names.push('updated_at');
  return [...new Set(names)];
}

function previewSubRow(sub: SubTableContext, raw: Record<string, unknown>): Record<string, unknown> {
  const nameMap = previewSubNameMap(sub);
  const output: Record<string, unknown> = {};
  if (sub.hasId && raw.id !== undefined && raw.id !== null) output.id = Number(raw.id);
  for (const column of sub.columns) {
    const key = nameMap.get(column.columnName) ?? toCamel(column.columnName);
    output[key] = previewNormalizeValue(column, raw[column.columnName]);
  }
  if (sub.hasCreatedAt && 'created_at' in raw) output.createdAt = raw.created_at;
  if (sub.hasUpdatedAt && 'updated_at' in raw) output.updatedAt = raw.updated_at;
  attachPickerLabels(output, sub.schema.columns);
  return output;
}

function previewSubRows(sub: SubTableContext, payload: unknown): Record<string, unknown>[] {
  if (payload === undefined || payload === null) return [];
  if (!Array.isArray(payload)) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, `明细「${sub.schema.label}」数据格式不正确`);
  }
  if (payload.length > PREVIEW_DETAIL_MAX_ROWS) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      `明细「${sub.schema.label}」最多 ${PREVIEW_DETAIL_MAX_ROWS} 行`,
    );
  }
  return payload.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `明细「${sub.schema.label}」第 ${index + 1} 行数据格式不正确`,
      );
    }
    return item as Record<string, unknown>;
  });
}

function previewSubWriteValues(
  sub: SubTableContext,
  row: Record<string, unknown>,
  rowIndex: number,
): { columns: string[]; values: unknown[] } {
  const columns: string[] = [];
  const values: unknown[] = [];
  for (const field of sub.schema.columns) {
    const column = sub.columnMap.get(field.columnName);
    if (!column) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `从表 ${sub.schema.tableName} 不存在字段 ${field.columnName}`,
      );
    }
    try {
      values.push(previewCoerceValue(field, column, row[field.name]));
    } catch (error) {
      const message = error instanceof AppError ? error.message : '数据不正确';
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `明细「${sub.schema.label}」第 ${rowIndex + 1} 行：${message}`,
      );
    }
    columns.push(field.columnName);
  }
  return { columns, values };
}

/** 明细关联值：关联列通常就是主键 id，非 id 时回查主表 */
async function previewMasterValue(
  run: DataSourceQuery,
  context: PreviewContext,
  masterRowId: number,
  masterColumn: string,
): Promise<unknown> {
  if (masterColumn === 'id') return masterRowId;
  const dbType = context.association.source.db_type;
  const q = (name: string) => previewQuote(dbType, name);
  const binder = previewBinder(dbType);
  const idPlaceholder = binder.bind(masterRowId);
  const rows = await run(
    `SELECT ${q(masterColumn)} AS value FROM ${q(context.row.table_name as string)} WHERE ${q('id')} = ${idPlaceholder} LIMIT 1`,
    binder.params,
  );
  const value = rows[0]?.value;
  if (value === undefined || value === null) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, `主表关联字段 ${masterColumn} 取值为空`);
  }
  return value;
}

/**
 * 明细写入：前端提交了哪个子表就同步哪个子表，没提交的保持原样。
 * 有 id 的按行 upsert（缺省的删除），没有 id 主键的从表按整组替换处理。
 */
async function previewWriteDetails(
  run: DataSourceQuery,
  context: PreviewContext,
  masterRowId: number,
  payload: Record<string, unknown> | undefined,
): Promise<void> {
  if (!payload || context.subtables.length === 0) return;
  const dbType = context.association.source.db_type;
  const q = (name: string) => previewQuote(dbType, name);

  for (const sub of context.subtables) {
    if (!(sub.schema.tableName in payload)) continue;
    const table = q(sub.schema.tableName);
    const rows = previewSubRows(sub, payload[sub.schema.tableName]);
    const masterValue = await previewMasterValue(run, context, masterRowId, sub.masterColumn);

    if (!sub.hasId) {
      const binder = previewBinder(dbType);
      const fkPlaceholder = binder.bind(masterValue);
      await run(`DELETE FROM ${table} WHERE ${q(sub.foreignKey)} = ${fkPlaceholder}`, binder.params);
      for (const [index, row] of rows.entries()) {
        const { columns, values } = previewSubWriteValues(sub, row, index);
        const insertBinder = previewBinder(dbType);
        const allColumns = [sub.foreignKey, ...columns];
        const allValues = [masterValue, ...values];
        const placeholders = allValues.map((value) => insertBinder.bind(value)).join(', ');
        await run(
          `INSERT INTO ${table} (${allColumns.map(q).join(', ')}) VALUES (${placeholders})`,
          insertBinder.params,
        );
      }
      continue;
    }

    const selectBinder = previewBinder(dbType);
    const existingWhere = [`${q(sub.foreignKey)} = ${selectBinder.bind(masterValue)}`];
    if (sub.hasDeletedAt) existingWhere.push(`${q('deleted_at')} IS NULL`);
    const existingRows = await run(
      `SELECT ${q('id')} AS id FROM ${table} WHERE ${existingWhere.join(' AND ')}`,
      selectBinder.params,
    );
    const existingIds = new Set(existingRows.map((row) => Number(row.id)));
    const keptIds = new Set<number>();

    for (const [index, row] of rows.entries()) {
      const { columns, values } = previewSubWriteValues(sub, row, index);
      const rowId = Number(row.id);
      if (Number.isInteger(rowId) && rowId > 0 && existingIds.has(rowId)) {
        const binder = previewBinder(dbType);
        const sets = columns.map((column, columnIndex) => `${q(column)} = ${binder.bind(values[columnIndex])}`);
        if (sub.hasUpdatedAt) sets.push(`${q('updated_at')} = CURRENT_TIMESTAMP`);
        const idPlaceholder = binder.bind(rowId);
        const fkPlaceholder = binder.bind(masterValue);
        await run(
          `UPDATE ${table} SET ${sets.join(', ')} WHERE ${q('id')} = ${idPlaceholder} AND ${q(sub.foreignKey)} = ${fkPlaceholder}`,
          binder.params,
        );
        keptIds.add(rowId);
        continue;
      }

      const binder = previewBinder(dbType);
      const allColumns = [sub.foreignKey, ...columns];
      const allValues = [masterValue, ...values];
      const placeholders = allValues.map((value) => binder.bind(value)).join(', ');
      await run(
        `INSERT INTO ${table} (${allColumns.map(q).join(', ')}) VALUES (${placeholders})`,
        binder.params,
      );
    }

    const removedIds = [...existingIds].filter((rowId) => !keptIds.has(rowId));
    if (removedIds.length === 0) continue;
    const binder = previewBinder(dbType);
    const idPlaceholders = removedIds.map((rowId) => binder.bind(rowId)).join(', ');
    const fkPlaceholder = binder.bind(masterValue);
    if (sub.hasDeletedAt) {
      const sets = [`${q('deleted_at')} = CURRENT_TIMESTAMP`];
      if (sub.hasUpdatedAt) sets.push(`${q('updated_at')} = CURRENT_TIMESTAMP`);
      await run(
        `UPDATE ${table} SET ${sets.join(', ')} WHERE ${q('id')} IN (${idPlaceholders}) AND ${q(sub.foreignKey)} = ${fkPlaceholder}`,
        binder.params,
      );
    } else {
      await run(
        `DELETE FROM ${table} WHERE ${q('id')} IN (${idPlaceholders}) AND ${q(sub.foreignKey)} = ${fkPlaceholder}`,
        binder.params,
      );
    }
  }
}

/** 主表 + 明细放在一个事务里，明细失败时主表回滚 */
async function previewTransaction<T>(
  source: DevDataSource,
  handler: (run: DataSourceQuery) => Promise<T>,
): Promise<T> {
  return withDataSource(source, async (run) => {
    await run('BEGIN');
    try {
      const result = await handler(run);
      await run('COMMIT');
      return result;
    } catch (error) {
      await run('ROLLBACK').catch(() => undefined);
      throw error;
    }
  });
}

async function previewFindRaw(context: PreviewContext, id: number): Promise<Record<string, unknown> | null> {
  const dbType = context.association.source.db_type;
  const q = (name: string) => previewQuote(dbType, name);
  const available = previewColumnSet(context);
  const select = previewSelectColumns(context).map(q).join(', ');
  const binder = previewBinder(dbType);
  const idPlaceholder = binder.bind(id);
  const where = [
    `${q('id')} = ${idPlaceholder}`,
    available.has('deleted_at') ? `${q('deleted_at')} IS NULL` : '',
  ]
    .filter(Boolean)
    .join(' AND ');
  const rows = await withDataSource(context.association.source, (run) =>
    run(`SELECT ${select} FROM ${q(context.row.table_name as string)} WHERE ${where} LIMIT 1`, binder.params),
  );
  return rows[0] ?? null;
}

function previewAssertRowId(raw: string | number): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '数据 id 不正确');
  }
  return id;
}

function previewDetailsPayload(body: Record<string, unknown>): Record<string, unknown> | undefined {
  const raw = body.details;
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '明细数据格式不正确');
  }
  return raw as Record<string, unknown>;
}

/** 读取一条主记录的全部明细，按子表表名为键 */
export async function previewDevFormDetails(id: number, rowIdRaw: string | number) {
  const context = await loadPreviewContext(id);
  const rowId = previewAssertRowId(rowIdRaw);
  const master = await previewFindRaw(context, rowId);
  if (!master) throw new AppError(ERROR_CODES.NOT_FOUND, '数据不存在');

  const details: Record<string, Record<string, unknown>[]> = {};
  if (context.subtables.length === 0) return { details };

  const dbType = context.association.source.db_type;
  const q = (name: string) => previewQuote(dbType, name);
  try {
    await withDataSource(context.association.source, async (run) => {
      for (const sub of context.subtables) {
        const value = master[sub.masterColumn] ?? rowId;
        const binder = previewBinder(dbType);
        const where = [`${q(sub.foreignKey)} = ${binder.bind(value)}`];
        if (sub.hasDeletedAt) where.push(`${q('deleted_at')} IS NULL`);
        const select = previewSubSelectColumns(sub).map(q).join(', ');
        const orderColumn = sub.hasId ? 'id' : sub.hasCreatedAt ? 'created_at' : null;
        const order = orderColumn ? ` ORDER BY ${q(orderColumn)} ASC` : '';
        const rows = await run(
          `SELECT ${select} FROM ${q(sub.schema.tableName)} WHERE ${where.join(' AND ')}${order}`,
          binder.params,
        );
        details[sub.schema.tableName] = rows.map((row) => previewSubRow(sub, row));
      }
    });
    return { details };
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/\s+/g, ' ').slice(0, 300) : '未知错误';
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, `明细查询失败：${message}`);
  }
}

export async function previewDevFormCreate(id: number, body: Record<string, unknown>) {
  const context = await loadPreviewContext(id);
  const missingRequired = context.association.businessColumns.filter(
    (column) =>
      !column.nullable &&
      !context.schema.fields.some((field) => field.columnName === column.columnName),
  );
  if (missingRequired.length > 0) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      `表单缺少非空字段：${missingRequired.slice(0, 5).map((column) => column.columnName).join('、')}`,
    );
  }

  const dbType = context.association.source.db_type;
  const q = (name: string) => previewQuote(dbType, name);
  const { columns, values } = previewWriteValues(context, body);
  const details = previewDetailsPayload(body);
  const binder = previewBinder(dbType);
  const placeholders = values.map((value) => binder.bind(value)).join(', ');
  const insert = `INSERT INTO ${q(context.row.table_name as string)} (${columns
    .map(q)
    .join(', ')}) VALUES (${placeholders})`;

  try {
    let rowId = 0;
    await previewTransaction(context.association.source, async (run) => {
      if (dbType === 'mysql') {
        await run(insert, binder.params);
        const rows = await run('SELECT LAST_INSERT_ID() AS id');
        rowId = Number(rows[0]?.id ?? 0);
      } else {
        const rows = await run(`${insert} RETURNING ${q('id')}`, binder.params);
        rowId = Number(rows[0]?.id ?? 0);
      }
      if (!rowId) {
        throw new AppError(ERROR_CODES.VALIDATION_FAILED, '新增失败：未获取到记录 id');
      }
      await previewWriteDetails(run, context, rowId, details);
    });
    const raw = await previewFindRaw(context, rowId);
    if (!raw) throw new AppError(ERROR_CODES.VALIDATION_FAILED, '新增后读取记录失败');
    return previewRow(context, raw);
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? error.message.replace(/\s+/g, ' ').slice(0, 300) : '未知错误';
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, `新增失败：${message}`);
  }
}

export async function previewDevFormUpdate(id: number, rowIdRaw: string | number, body: Record<string, unknown>) {
  const context = await loadPreviewContext(id);
  const rowId = previewAssertRowId(rowIdRaw);
  const existed = await previewFindRaw(context, rowId);
  if (!existed) throw new AppError(ERROR_CODES.NOT_FOUND, '数据不存在');

  const dbType = context.association.source.db_type;
  const q = (name: string) => previewQuote(dbType, name);
  const available = previewColumnSet(context);
  const { columns, values } = previewWriteValues(context, body);
  const details = previewDetailsPayload(body);
  const binder = previewBinder(dbType);
  const sets = columns.map((column, index) => `${q(column)} = ${binder.bind(values[index])}`);
  if (available.has('updated_at')) sets.push(`${q('updated_at')} = CURRENT_TIMESTAMP`);
  const idPlaceholder = binder.bind(rowId);
  const deletedWhere = available.has('deleted_at') ? ` AND ${q('deleted_at')} IS NULL` : '';
  const update = `UPDATE ${q(context.row.table_name as string)} SET ${sets.join(', ')} WHERE ${q('id')} = ${idPlaceholder}${deletedWhere}`;

  try {
    await previewTransaction(context.association.source, async (run) => {
      await run(update, binder.params);
      await previewWriteDetails(run, context, rowId, details);
    });
    const raw = await previewFindRaw(context, rowId);
    if (!raw) throw new AppError(ERROR_CODES.NOT_FOUND, '数据不存在');
    return previewRow(context, raw);
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? error.message.replace(/\s+/g, ' ').slice(0, 300) : '未知错误';
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, `更新失败：${message}`);
  }
}

export async function previewDevFormDelete(id: number, rowIdRaw: string | number) {
  const context = await loadPreviewContext(id);
  const rowId = previewAssertRowId(rowIdRaw);
  const existed = await previewFindRaw(context, rowId);
  if (!existed) throw new AppError(ERROR_CODES.NOT_FOUND, '数据不存在');

  const dbType = context.association.source.db_type;
  const q = (name: string) => previewQuote(dbType, name);
  const available = previewColumnSet(context);

  try {
    await previewTransaction(context.association.source, async (run) => {
      // 先按子表设计回收明细，避免主记录删除后留下孤儿明细
      for (const sub of context.subtables) {
        const value = existed[sub.masterColumn] ?? rowId;
        const binder = previewBinder(dbType);
        const fkPlaceholder = binder.bind(value);
        const table = q(sub.schema.tableName);
        if (sub.hasDeletedAt) {
          const sets = [`${q('deleted_at')} = CURRENT_TIMESTAMP`];
          if (sub.hasUpdatedAt) sets.push(`${q('updated_at')} = CURRENT_TIMESTAMP`);
          await run(
            `UPDATE ${table} SET ${sets.join(', ')} WHERE ${q(sub.foreignKey)} = ${fkPlaceholder} AND ${q('deleted_at')} IS NULL`,
            binder.params,
          );
        } else {
          await run(
            `DELETE FROM ${table} WHERE ${q(sub.foreignKey)} = ${fkPlaceholder}`,
            binder.params,
          );
        }
      }

      const binder = previewBinder(dbType);
      const idPlaceholder = binder.bind(rowId);
      if (available.has('deleted_at')) {
        const sets = [`${q('deleted_at')} = CURRENT_TIMESTAMP`];
        if (available.has('updated_at')) sets.push(`${q('updated_at')} = CURRENT_TIMESTAMP`);
        const sql = `UPDATE ${q(context.row.table_name as string)} SET ${sets.join(', ')} WHERE ${q('id')} = ${idPlaceholder} AND ${q('deleted_at')} IS NULL`;
        await run(sql, binder.params);
      } else {
        const sql = `DELETE FROM ${q(context.row.table_name as string)} WHERE ${q('id')} = ${idPlaceholder}`;
        await run(sql, binder.params);
      }
    });
    return { id: rowId };
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? error.message.replace(/\s+/g, ' ').slice(0, 300) : '未知错误';
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, `删除失败：${message}`);
  }
}

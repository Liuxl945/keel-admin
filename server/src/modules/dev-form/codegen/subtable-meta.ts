/**
 * 把表单 schema 的子表设计 + 从表元数据，编译成后端代码生成所需的明细上下文。
 *
 * 字段归属以「从表元数据」为准（entity 列类型来自真实表结构），
 * 字段名（camelCase）优先取设计器里配置的明细列 name，保证接口字段与前端控件绑定一致。
 */

import type { DbTableInfo } from '../../dev-db-table/dev-db-table.introspect';
import type { DevModelFieldInput } from '../../dev-model/dev-model.dto';
import type { DetailsCodegenInput, DetailCodegenMeta } from '../../dev-model/dev-model.codegen';
import type { DevFormSchemaInput } from '../dev-form.dto';
import { generateTableFields, toCamel } from '../dev-form.field-mapper';
import { toPascal } from './shared';

/** 从表列元数据按表名索引：{ [tableName]: DbTableInfo } */
export type SubTableInfoMap = Record<string, DbTableInfo>;

/**
 * 构建明细生成上下文。
 * @param schema 表单 schema（含 subtables 设计）
 * @param infoMap 从表元数据（由调用方通过 findSyncedTable 加载）
 * @param formKey 主表表单 key，用于拼从表实体类名（避免多表单互相冲突）
 */
export function buildDetailsMeta(
  schema: DevFormSchemaInput,
  infoMap: SubTableInfoMap,
  formKey: string,
): DetailsCodegenInput {
  const result: DetailsCodegenInput = [];
  const masterPascal = toPascal(formKey);

  for (const sub of schema.subtables) {
    const info = infoMap[sub.tableName];
    if (!info) continue; // 从表没同步时跳过（正常路径在发布时已校验，这里只是兜底）

    const subPascal = toPascal(sub.tableName);
    const entityName = `${masterPascal}${subPascal}`;
    // 明细 entity 文件名带 .entity 后缀，便于将来业务模块按需直接引用；
    // 主 entity 文件会 re-export 它，保证 biz 启动扫描能注册到 DataSource。
    const entityFile = `${formKey}_${sub.tableName}.entity`;

    // 设计器里配置的列名 → 前端字段名（camelCase）
    const nameByColumn = new Map<string, string>();
    for (const column of sub.columns) {
      if (column.columnName) nameByColumn.set(column.columnName, column.name || toCamel(column.columnName));
    }

    // 从表全部业务列（含外键）→ entity 字段
    const entityFields: DevModelFieldInput[] = generateTableFields(info.columns, nameByColumn);
    // 外键列若被 generateTableFields 过滤（通常不会），补进来
    if (sub.foreignKey && !entityFields.some((field) => field.columnName === sub.foreignKey)) {
      const fkColumn = info.columns.find((column) => column.columnName === sub.foreignKey);
      if (fkColumn) {
        entityFields.unshift({
          label: sub.foreignKey,
          columnName: sub.foreignKey,
          fieldName: nameByColumn.get(sub.foreignKey) ?? toCamel(sub.foreignKey),
          type: (fkColumn.type ?? 'int') as DevModelFieldInput['type'],
          length: fkColumn.length || 255,
          precision: fkColumn.precision || 10,
          scale: fkColumn.scale ?? 2,
          nullable: false,
          unique: false,
          listVisible: false,
          formVisible: false,
          searchable: false,
        });
      }
    }

    // 明细录入字段：去掉外键列，只保留设计器里拖入的明细列，且顺序按设计器配置
    const fieldColumns = sub.columns
      .map((column) => ({
        column,
        field: entityFields.find((item) => item.columnName === column.columnName),
      }))
      .filter((item): item is { column: (typeof sub.columns)[number]; field: DevModelFieldInput } => Boolean(item.field));
    const fields = fieldColumns.map((item) => ({
      ...item.field,
      label: item.column.label || item.field.label,
      fieldName: item.column.name || item.field.fieldName,
    }));

    // 列表里聚合展示的明细列：优先按 listColumns(source=subtable) 配置，
    // 否则回落到子表设计里 listFields 指定的列。
    const subListConfigs = schema.list.listColumns.filter(
      (config) => config.source === 'subtable' && config.tableName === sub.tableName,
    );
    const listColumnNames = subListConfigs.length > 0
      ? subListConfigs.map((config) => config.columnName)
      : sub.listFields;
    const listColumns: Array<{ columnName: string; fieldName: string; label: string; type: string }> = [];
    for (const columnName of listColumnNames) {
      const field = entityFields.find((item) => item.columnName === columnName);
      if (!field) continue;
      const designed = sub.columns.find((column) => column.columnName === columnName);
      listColumns.push({
        columnName,
        fieldName: field.fieldName,
        label: designed?.label || field.label,
        type: field.type,
      });
    }

    const meta: DetailCodegenMeta = {
      tableName: sub.tableName,
      entityName,
      entityFile,
      label: sub.label,
      foreignKey: sub.foreignKey ?? `${sub.tableName}_id`,
      masterColumn: sub.masterColumn ?? 'id',
      entityFields,
      fields,
      listColumns,
    };
    result.push(meta);
  }
  return result;
}

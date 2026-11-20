/**
 * 代码生成入口。
 *
 * 两条链路：
 * - 关联了数据表：后端 CRUD 复用 dev-model 的生成器（列来自数据库元数据），
 *   前端页面走模板化生成，控件/列表/查询都与在线预览同一套规则；
 * - 未关联数据表：整站从字段模板推导（实体列、校验、接口类型、页面）。
 */

import type { DevDataSource, DevForm } from '../../../db/entities';
import type { DbTableInfo } from '../../dev-db-table/dev-db-table.introspect';
import type { DevFormSchemaInput } from '../dev-form.dto';
import { buildDetailsMeta, type SubTableInfoMap } from './subtable-meta';
import {
  generateTableBackendFiles,
  generateTableFrontendApiFile,
  type TableCodegenModel,
} from '../../dev-model/dev-model.codegen';
import { generateTableFields } from '../dev-form.field-mapper';
import { generateFormApi } from './api';
import {
  generateFormController,
  generateFormDto,
  generateFormEntity,
  generateFormRoute,
  generateFormService,
} from './backend';
import { generateTableGuide, generateFormGuide } from './guide';
import { generateMenuSql } from './menu-sql';
import { generateFormPage } from './page-form';
import { generateTablePage } from './page-table';
import {
  generateSubTableEditor,
  generateSubTableFieldControl,
} from './subtable-page';
import { toCamel, toPascal, type GeneratedFile } from './shared';

export type { GeneratedFile } from './shared';

export interface TableCodegenInput {
  form: DevForm;
  schema: DevFormSchemaInput;
  tableInfo: DbTableInfo;
  /** 从表元数据（含子表时必传），用于生成明细 entity 与 CRUD */
  subTableInfo?: SubTableInfoMap;
}

/** 关联数据表：后端复用建模生成器，前端页面用模板生成 */
export function generateDevFormTableCode(
  form: DevForm,
  schema: DevFormSchemaInput,
  _connection: DevDataSource,
  tableInfo: DbTableInfo,
  subTableInfo: SubTableInfoMap = {},
): GeneratedFile[] {
  const fieldByColumn = new Map(
    schema.fields
      .filter((field) => field.columnName)
      .map((field) => [field.columnName as string, field.name]),
  );
  const tableFields = generateTableFields(tableInfo.columns, fieldByColumn);
  const queryFields = tableFields.filter((field) =>
    schema.list.queryColumns.length > 0
      ? schema.list.queryColumns.some(
          (config) => config.source === 'master' && config.columnName === field.columnName,
        )
      : schema.list.queryFields.includes(field.columnName),
  );

  const model: TableCodegenModel = {
    name: form.name,
    model_key: form.form_key,
    table_name: form.table_name as string,
    table_comment: tableInfo.tableComment || null,
  };

  // 子表明细上下文：从表元数据 + 设计器配置
  const details = buildDetailsMeta(schema, subTableInfo, form.form_key);
  const hasSubTables = details.length > 0;

  const files: GeneratedFile[] = [
    ...generateTableBackendFiles(model, tableFields, queryFields, details),
    generateTableFrontendApiFile(model, tableFields, queryFields, details),
    {
      name: `admin/src/views/biz/${form.form_key}/index.vue`,
      language: 'vue',
      content: generateTablePage(form, schema, tableInfo, details),
    },
    {
      name: `server/src/biz/${form.form_key}/README.md`,
      language: 'markdown',
      content: generateTableGuide(form, schema, tableInfo),
    },
    {
      name: `server/src/biz/${form.form_key}/menu.sql`,
      language: 'sql',
      content: generateMenuSql(form),
    },
  ];

  if (hasSubTables) {
    files.push(
      {
        name: `admin/src/views/biz/${form.form_key}/SubTableFieldControl.vue`,
        language: 'vue',
        content: generateSubTableFieldControl(schema),
      },
      {
        name: `admin/src/views/biz/${form.form_key}/SubTableEditor.vue`,
        language: 'vue',
        content: generateSubTableEditor(schema, details),
      },
    );
  }

  return files;
}

/** 未关联数据表：整站按字段模板生成 */
export function generateDevFormCode(form: DevForm, schema: DevFormSchemaInput): GeneratedFile[] {
  const key = form.form_key;
  return [
    { name: `server/src/biz/${key}/${key}.entity.ts`, language: 'ts', content: generateFormEntity(form, schema) },
    { name: `server/src/biz/${key}/${key}.dto.ts`, language: 'ts', content: generateFormDto(form, schema) },
    { name: `server/src/biz/${key}/${key}.service.ts`, language: 'ts', content: generateFormService(form, schema) },
    { name: `server/src/biz/${key}/${key}.controller.ts`, language: 'ts', content: generateFormController(form) },
    { name: `server/src/biz/${key}/${key}.route.ts`, language: 'ts', content: generateFormRoute(form) },
    { name: `admin/src/views/biz/${key}/index.vue`, language: 'vue', content: generateFormPage(form, schema) },
    { name: `admin/src/views/biz/${key}/api.ts`, language: 'ts', content: generateFormApi(form, schema) },
    { name: `server/src/biz/${key}/README.md`, language: 'markdown', content: generateFormGuide(form, schema) },
    { name: `server/src/biz/${key}/menu.sql`, language: 'sql', content: generateMenuSql(form) },
  ];
}

export function devFormClassNames(formKey: string) {
  return { className: toPascal(formKey), camelName: toCamel(formKey) };
}

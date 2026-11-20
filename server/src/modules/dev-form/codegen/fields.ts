/**
 * 把表单字段批量编译成页面需要的片段：
 * 控件标记、类型、初始值、回填、提交值、校验规则，以及控件模板自带的
 * 常量声明 / import / setup 片段。
 */

import type { DevFormFieldInput } from '../dev-form.dto';
import type { DbColumnInfo } from '../../dev-db-table/dev-db-table.introspect';
import { controlTemplateOf, ruleOf, type CodegenMode } from './control-templates';
import { DECODE_MULTI_SETUP } from './column-templates';
import { js, unique, type ImportSpec } from './shared';

export interface FieldBuild {
  field: DevFormFieldInput;
  /** 关联表模式下字段对应的数据库列（独立表单模式为 null） */
  column: DbColumnInfo | null;
  control: string;
  formType: string;
  initial: string;
  assign: string;
  payload: string;
  rule: string | null;
}

export interface FieldsBuild {
  items: FieldBuild[];
  declarations: string[];
  imports: ImportSpec[];
  setups: string[];
  /** 是否用到了选项常量（列表列的回显也要用） */
  usesOptions: boolean;
  /** 是否用到了多选解码（可能来自控件回填，也可能来自列表列） */
  usesDecodeMulti: boolean;
  /** 二维码/条码联动需要的字段标题映射 */
  codeLabels: string | null;
}

export interface BuildFieldsOptions {
  mode: CodegenMode;
  /** 关联表模式：字段对应的数据库列 */
  columnOf?: (field: DevFormFieldInput) => DbColumnInfo | null;
}

export function buildFields(
  fields: DevFormFieldInput[],
  { mode, columnOf }: BuildFieldsOptions,
): FieldsBuild {
  const items: FieldBuild[] = [];
  const declarations: string[] = [];
  const imports: ImportSpec[] = [];
  const setups: string[] = [];
  let usesOptions = false;
  let usesDecodeMulti = false;

  for (const field of fields) {
    const template = controlTemplateOf(field.type);
    const ctx = { field, mode, column: columnOf?.(field) ?? null };

    items.push({
      field,
      column: ctx.column,
      control: template.control(ctx),
      formType: template.formType(ctx),
      initial: template.initial(ctx),
      assign: template.assign(ctx),
      payload: template.payload(ctx),
      rule: ruleOf(field),
    });

    declarations.push(template.declarations?.(ctx) ?? '');
    imports.push(...(template.imports?.(ctx) ?? []));
    setups.push(...(template.setup?.(ctx) ?? []));
    if (['select', 'radio', 'checkbox'].includes(field.type) && field.options.length > 0) {
      usesOptions = true;
    }
    if (field.type === 'checkbox') usesDecodeMulti = true;
  }

  // 上传/弹框控件的声明与 setup 片段有重复（同一个 uploadHandler），这里统一去重
  const codeFields = fields.filter((field) => ['qrcode', 'barcode'].includes(field.type));
  const codeLabels =
    codeFields.length > 0
      ? [
          '/** 二维码/条码联动模式可选的字段标题 */',
          'const codeLabels: Record<string, string> = {',
          ...fields
            .filter((field) => field.name !== '')
            .map((field) => `  ${field.name}: ${js(field.label)},`),
          '};',
        ].join('\n')
      : null;

  return {
    items,
    declarations: unique(declarations),
    imports,
    setups: unique(setups),
    usesOptions,
    usesDecodeMulti,
    codeLabels,
  };
}

/** 选项映射：列表列把 value 还原成 label 时用 */
export function optionMapsDeclaration(fields: DevFormFieldInput[]): string | null {
  const withOptions = fields.filter(
    (field) => ['select', 'radio', 'checkbox'].includes(field.type) && field.options.length > 0,
  );
  if (withOptions.length === 0) return null;
  return [
    '/** 字段名 → 选项：列表列把 value 还原成 label */',
    'const optionMaps: Record<string, Array<{ label: string; value: string }>> = {',
    ...withOptions.map((field) => `  ${field.name}: ${field.name}Options,`),
    '};',
  ].join('\n');
}

/** 多选解码帮助函数（列表列与多选框回填共用） */
export function decodeMultiSetup(): string {
  return DECODE_MULTI_SETUP;
}

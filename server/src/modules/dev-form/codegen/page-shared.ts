/**
 * 页面生成器共用片段：表单模型、校验规则、重置、表单项。
 * 独立表单页与 CRUD 列表页只在「怎么保存」上不同，其余都走这里。
 */

import type { DevFormSchemaInput } from '../dev-form.dto';
import type { FieldsBuild } from './fields';
import { html, indent } from './shared';

/** 表单尺寸档位 → el-form 的控件尺寸（与前端 form-dialog.ts 保持一致） */
const FORM_SIZE_EL_SIZE: Record<string, string> = {
  small: 'small',
  medium: 'default',
  large: 'large',
};

/** 未显式设置宽度时的默认弹窗宽度（表单尺寸只管控件大小，与前端 form-dialog.ts 保持一致） */
const DEFAULT_DIALOG_WIDTH = 900;

export function elFormSize(schema: DevFormSchemaInput): string {
  const preset = schema.formSize ?? (schema.size === 'small' ? 'small' : schema.size === 'large' ? 'large' : 'medium');
  return FORM_SIZE_EL_SIZE[preset] ?? 'default';
}

/** 实际弹窗宽度（CSS 值）：显式配置优先（px 数字或 '80%' 百分比），否则默认宽度；与表单尺寸无关 */
export function formDialogWidth(schema: DevFormSchemaInput): string {
  const width = schema.dialogWidth;
  if (typeof width === 'string' && width.trim()) return width.trim();
  if (typeof width === 'number' && Number.isFinite(width) && width > 0) return `${width}px`;
  return `${DEFAULT_DIALOG_WIDTH}px`;
}

/**
 * 生成 AppDialog 的属性串：
 * 居中弹窗 → width；右侧抽屉 → variant="drawer" direction="rtl" width；全屏 → fullscreen。
 */
export function dialogAttrsOf(schema: DevFormSchemaInput): string {
  const type = schema.dialogType ?? 'center';
  if (type === 'fullscreen') return 'fullscreen';
  const width = `width="${formDialogWidth(schema)}"`;
  if (type === 'right') return `variant="drawer" direction="rtl" ${width}`;
  return width;
}

/** 全屏弹窗的操作按钮在顶部 header，普通弹窗继续用 footer */
export function fullscreenDialogActions(schema: DevFormSchemaInput): string {
  return schema.dialogType === 'fullscreen' ? ' @confirm="handleSave" :confirm-loading="saving"' : '';
}

/** FormModel 接口 + reactive 初始化 + 时间控件 computed */
export function formModelLines(build: FieldsBuild, interfaceName: string): string[] {
  const lines: string[] = [
    '/** 表单模型：控件需要更宽松的类型（多选是数组、数字可为空），提交前再收敛成接口类型 */',
    `interface ${interfaceName} {`,
    ...build.items.map((item) => `  ${item.field.name}: ${item.formType};`),
    '}',
    '',
    `const form = reactive<${interfaceName}>({`,
    ...build.items.map((item) => `  ${item.field.name}: ${item.initial},`),
    '});',
  ];

  for (const setup of build.setups) {
    lines.push('', setup);
  }
  return lines;
}

export function rulesLines(build: FieldsBuild): string[] {
  const rules = build.items.map((item) => item.rule).filter(Boolean) as string[];
  if (rules.length === 0) return ['const rules: FormRules = {};'];
  return ['const rules: FormRules = {', ...rules, '};'];
}

export function resetLines(build: FieldsBuild): string[] {
  return [
    'function resetForm(): void {',
    ...build.items.map((item) => `  form.${item.field.name} = ${item.initial};`),
    '  formRef.value?.clearValidate();',
    '}',
  ];
}

/** 单个 el-col + el-form-item 区块 */
export function formItemLines(
  build: FieldsBuild,
  controlAttrOf?: (field: FieldsBuild['items'][number]['field']) => string,
): string[] {
  const lines: string[] = [];
  for (const item of build.items) {
    const field = item.field;
    let control = item.control;
    const extra = controlAttrOf?.(field);
    if (extra) {
      // 只在根控件的开始标签上追加属性，保持多行模板的缩进不变
      const root = control.match(/<[A-Za-z][^>]*?\/?>/);
      if (root) control = control.replace(root[0], root[0].replace(/\/?>$/, ` ${extra}$&`));
    }
    lines.push(
      `          <el-col :span="${field.span || 24}">`,
      `            <el-form-item label="${html(field.label)}" prop="${field.name}">`,
      indent(control, 14),
      '            </el-form-item>',
      '          </el-col>',
    );
  }
  return lines;
}

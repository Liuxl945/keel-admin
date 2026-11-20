/**
 * 表单弹窗外观：表单尺寸档位、弹窗类型、表单宽度。
 * 设计器（属性面板 / 画布）与在线预览共用，避免两边各写一份映射。
 */
import type { DevFormDialogType, DevFormSize, DevFormSizePreset } from '@/types/dev';

/** 表单尺寸档位：控件尺寸 + 默认弹窗宽度一一对应，避免两个参数互相打架 */
export const FORM_SIZE_OPTIONS: Array<{
  value: DevFormSizePreset;
  label: string;
  elSize: DevFormSize;
}> = [
  { value: 'small', label: '小（紧凑）', elSize: 'small' },
  { value: 'medium', label: '中（标准）', elSize: 'default' },
  { value: 'large', label: '大（宽松）', elSize: 'large' },
];

export const DIALOG_TYPE_OPTIONS: Array<{
  value: DevFormDialogType;
  label: string;
  hint: string;
}> = [
  { value: 'center', label: '居中弹窗', hint: '弹窗浮层，适合常规增删改' },
  { value: 'right', label: '右侧抽屉', hint: '从右侧滑出，不遮挡列表' },
  { value: 'fullscreen', label: '全屏', hint: '铺满主内容区（保留侧边栏与顶栏），适合字段多或含明细' },
];

/**
 * 弹窗宽度下拉：px 精简 + 百分比（相对主内容区宽度）。
 * schema.dialogWidth 存 `'600px'` / `'80%'` / null（null 走默认宽度）。
 */
export const DIALOG_WIDTH_OPTIONS: string[] = [
  '600px',
  '800px',
  '1000px',
  '1200px',
  '1400px',
  '1600px',
  '50%',
  '60%',
  '70%',
  '80%',
  '90%',
  '100%',
];

/** 未显式设置宽度时的默认弹窗宽度（表单尺寸只管控件大小，不再影响宽度） */
export const DEFAULT_DIALOG_WIDTH = 900;

/** 旧 schema 的 dialogWidth 是纯数字，直接视为 px */
export function normalizeDialogWidth(value: number | string | null | undefined): string {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return `${value}px`;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return `${DEFAULT_DIALOG_WIDTH}px`;
}

/** 实际弹窗宽度（CSS 值）：显式配置优先，否则默认宽度；与表单尺寸无关 */
export function formWidthOf(dialogWidth: number | string | null | undefined): string {
  return normalizeDialogWidth(dialogWidth);
}

/** 表单尺寸 → el-form 的控件尺寸 */
export function elSizeOf(formSize: DevFormSizePreset): DevFormSize {
  return FORM_SIZE_OPTIONS.find((item) => item.value === formSize)?.elSize ?? 'default';
}

/** 旧 schema 只有 size，没有 formSize 时按控件尺寸反推档位 */
export function normalizeFormSize(schema: {
  formSize?: DevFormSizePreset | null;
  size?: DevFormSize | null;
}): DevFormSizePreset {
  if (schema.formSize) return schema.formSize;
  if (schema.size === 'small') return 'small';
  if (schema.size === 'large') return 'large';
  return 'medium';
}

/** 旧 schema 没有弹窗类型时回落居中弹窗 */
export function normalizeDialogType(value?: DevFormDialogType | null): DevFormDialogType {
  return value === 'right' || value === 'fullscreen' ? value : 'center';
}

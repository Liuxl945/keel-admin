import type { DevFormField } from '@/types/dev';

/**
 * 字段级样式（schema.fields[] 的 labelWidth / controlWidth）统一在这里读，
 * 设计器画布与真实预览页共用，避免两处渲染规则不一致。
 *
 * controlWidth 存的是 CSS 长度字符串：
 * - `100%` 百分比（相对所在栅格），未设置时的默认值；
 * - `320px` 固定像素。
 */

/** 控件宽度默认值：100%，即撑满所在栅格 */
export const DEFAULT_CONTROL_WIDTH = '100%';

/** 像素宽度上限，避免一个控件把整行撑爆 */
const MAX_PX_WIDTH = 4000;

/** 标题宽度：未设置时返回 undefined，交给 el-form 的表单级 labelWidth */
export function labelWidthOf(field: DevFormField): string | undefined {
  const width = Number(field.labelWidth ?? 0);
  return width > 0 ? `${width}px` : undefined;
}

/**
 * 把宽度输入规范成 CSS 长度：
 * - `50%` → `50%`（clamp 1-100）
 * - `320` / `320px` → `320px`
 * - 老 schema 里的数字（如 100）按百分比理解
 * - 空值/非法值返回 null
 */
export function normalizeControlWidth(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0) return null;
    return `${Math.min(100, Math.round(input))}%`;
  }
  const raw = String(input).trim().toLowerCase();
  if (!raw) return null;
  const percent = raw.match(/^(\d+(?:\.\d+)?)%$/);
  if (percent) {
    const value = Number(percent[1]);
    if (!Number.isFinite(value) || value <= 0) return null;
    return `${Math.min(100, Math.round(value))}%`;
  }
  const px = raw.match(/^(\d+(?:\.\d+)?)(?:px)?$/);
  if (px) {
    const value = Number(px[1]);
    if (!Number.isFinite(value) || value <= 0) return null;
    return `${Math.min(MAX_PX_WIDTH, Math.round(value))}px`;
  }
  return null;
}

/** 控件宽度：未设置/非法值一律按 100% */
export function controlWidthOf(field: DevFormField): string {
  return normalizeControlWidth(field.controlWidth) ?? DEFAULT_CONTROL_WIDTH;
}

/** 控件宽度样式：外层按 px/% 限宽，内部控件自身始终跟随外层 */
export function controlBoxStyle(field: DevFormField): Record<string, string> {
  return { width: controlWidthOf(field), maxWidth: '100%' };
}

/**
 * 主内容区内边距工具。
 *
 * 全屏弹窗（AppDialog / BasicDialog）按 `.layout__main` 的矩形定位，
 * 并扣除这里的 padding，落在内容区内部，不贴边。
 * padding 以 CSS 变量 `--app-main-padding` 为准，支持四边单独覆盖：
 *   --app-main-padding-top / -right / -bottom / -left
 * 变量缺失时回落到元素实际计算出的 padding。
 */

export interface ContentBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING_PROPS = {
  top: 'paddingTop',
  right: 'paddingRight',
  bottom: 'paddingBottom',
  left: 'paddingLeft',
} as const;

export type PaddingSide = keyof typeof PADDING_PROPS;

/** 读取 CSS 变量并转成 px 数值；未定义或非数值返回 null */
function readVarPx(style: CSSStyleDeclaration | null, name: string): number | null {
  const raw = style?.getPropertyValue(name).trim();
  if (!raw) return null;
  const value = Number.parseFloat(raw);
  return Number.isNaN(value) ? null : value;
}

/** 某一边实际生效的 padding：单侧变量 > 公共变量 > 元素计算值 */
export function mainPadding(style: CSSStyleDeclaration | null, side: PaddingSide): number {
  const single = readVarPx(style, `--app-main-padding-${side}`);
  if (single !== null) return single;
  const shared = readVarPx(style, '--app-main-padding');
  if (shared !== null) return shared;
  const fallback = Number.parseFloat(style?.[PADDING_PROPS[side]] ?? '0');
  return Number.isNaN(fallback) ? 0 : fallback;
}

/**
 * 计算元素扣除 padding 后的内容矩形，供全屏弹窗定位使用。
 * 元素不存在时回落到整个视口。
 */
export function mainContentBox(el: HTMLElement | null): ContentBox {
  const box = el?.getBoundingClientRect();
  const style = el ? getComputedStyle(el) : null;
  const padTop = mainPadding(style, 'top');
  const padRight = mainPadding(style, 'right');
  const padBottom = mainPadding(style, 'bottom');
  const padLeft = mainPadding(style, 'left');
  return {
    top: (box?.top ?? 0) + padTop,
    left: (box?.left ?? 0) + padLeft,
    width: (box?.width ?? window.innerWidth) - padLeft - padRight,
    height: (box?.height ?? window.innerHeight) - padTop - padBottom,
  };
}

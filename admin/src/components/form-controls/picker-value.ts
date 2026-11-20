import { decodePickerItems } from './useDataPicker';
import { formatDate, formatDateTime } from '@/utils/datetime';

/** 值存 {v,l} JSON 的输入型控件：关联表单 / 弹框选择 / 用户选择 / 角色选择 */
const DATA_PICKER_TYPES = new Set(['relationForm', 'dialogSelect', 'userSelect', 'roleSelect']);

export function isDataPickerType(type?: string | null): boolean {
  return Boolean(type && DATA_PICKER_TYPES.has(type));
}

/**
 * 列表单元格展示：把 {v,l} / [{v,l}] 还原成回显文本，避免直接显示 JSON 串。
 * 返回 null 表示不属于这类控件，调用方按原逻辑格式化。
 */
export function formatDataPickerCell(value: unknown, type?: string | null): string | null {
  if (!isDataPickerType(type)) return null;
  if (value === null || value === undefined || value === '') return '-';

  const items = decodePickerItems(String(value));
  return items.length > 0 ? items.map((item) => item.l || item.v).join('、') : '-';
}

/**
 * 展开模式下子表列由后端把多行值拼成一个文本（如 `[{..}], [{..}]`）。
 * 逐个扫描出合法的 JSON 片段再取回显文本，避免整串 parse 失败后暴露原始 JSON。
 */
export function formatDataPickerAggregatedCell(
  value: unknown,
  type?: string | null,
): string | null {
  if (!isDataPickerType(type)) return null;
  if (value === null || value === undefined || value === '') return '-';

  const text = String(value);
  const labels: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    if (text[cursor] !== '{' && text[cursor] !== '[') {
      cursor += 1;
      continue;
    }
    let matched = false;
    // 从长到短试探，优先取出完整 JSON 片段（片段之间由 ", " 分隔）
    for (let end = text.length; end > cursor; end -= 1) {
      try {
        const parsed = JSON.parse(text.slice(cursor, end));
        for (const item of decodePickerItems(JSON.stringify(parsed))) {
          labels.push(item.l || item.v);
        }
        cursor = end;
        matched = true;
        break;
      } catch {
        // 继续缩短候选片段
      }
    }
    if (!matched) cursor += 1;
  }
  return labels.length > 0 ? labels.join('、') : text;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/**
 * 无字段类型信息时的兜底格式化（数据接口试运行、选值弹框的数据表等）：
 * 值本身是 {v,l} JSON 就还原回显文本，是 ISO 时间就按本地时区格式化，其余原样。
 */
export function formatSmartCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const trimmed = text.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = decodePickerItems(trimmed);
    const labels = parsed.map((item) => item.l || item.v).filter(Boolean);
    // 仅当确实解析出 {v,l} 结构（文本与原文不同）时才替换，避免误伤普通 JSON
    if (labels.length > 0 && labels.join('、') !== trimmed) return labels.join('、');
  }

  if (ISO_DATETIME.test(trimmed)) return formatDateTime(trimmed);
  if (ISO_DATE.test(trimmed)) return formatDate(trimmed);
  return text;
}

/**
 * 上传允许类型的预置分组。
 * 设计器用 `acceptTypes`（多选 key）配置，运行时由 `resolveAccept` 拼成 accept 字符串；
 * `accept` 仍保留自定义后缀（如 .dwg），旧数据只有 accept 时会自动反解成类型。
 */

export interface UploadTypeOption {
  value: string;
  label: string;
  /** 展开成 accept 规则（扩展名列表） */
  accept: string;
}

export const UPLOAD_TYPE_OPTIONS: UploadTypeOption[] = [
  { value: 'image', label: '图片', accept: '.jpg,.jpeg,.png,.gif,.webp,.bmp,.avif' },
  { value: 'video', label: '视频', accept: '.mp4,.mov,.avi,.wmv,.flv,.mkv' },
  { value: 'audio', label: '音频', accept: '.mp3,.wav,.ogg,.flac,.aac,.m4a' },
  { value: 'excel', label: 'Excel', accept: '.xls,.xlsx,.csv' },
  { value: 'word', label: 'Word', accept: '.doc,.docx' },
  { value: 'ppt', label: 'PPT', accept: '.ppt,.pptx' },
  { value: 'pdf', label: 'PDF', accept: '.pdf' },
  { value: 'text', label: '文本', accept: '.txt,.md,.json,.xml' },
  { value: 'archive', label: '压缩包', accept: '.zip,.rar,.7z,.tar,.gz' },
];

/** mime 通配规则 → 预置类型（兼容旧的 accept="image/*" 写法） */
const MIME_ALIAS: Record<string, string> = {
  'image/*': 'image',
  'video/*': 'video',
  'audio/*': 'audio',
};

const OPTION_OF_VALUE = new Map(UPLOAD_TYPE_OPTIONS.map((option) => [option.value, option]));

/** 规则 → 所属类型（.xlsx 与 .xls 都归到 excel） */
const TYPE_OF_RULE = new Map<string, string>();
for (const option of UPLOAD_TYPE_OPTIONS) {
  for (const rule of option.accept.split(',')) {
    TYPE_OF_RULE.set(rule.trim().toLowerCase(), option.value);
  }
}

export interface UploadAcceptField {
  accept?: string | null;
  acceptTypes?: string[] | null;
}

/** 类型 key 数组 → accept 字符串（按选项顺序展开、去重） */
export function acceptOfTypes(types?: string[] | null): string {
  const picked = new Set(types ?? []);
  const rules: string[] = [];
  for (const option of UPLOAD_TYPE_OPTIONS) {
    if (!picked.has(option.value)) continue;
    for (const rule of option.accept.split(',')) {
      const text = rule.trim().toLowerCase();
      if (text && !rules.includes(text)) rules.push(text);
    }
  }
  return rules.join(',');
}

/** accept 字符串 → { types, rest }：能归纳成预置类型的收进 types，其余作为自定义后缀留在 rest */
export function parseAcceptTypes(accept?: string | null): { types: string[]; rest: string[] } {
  const rules = String(accept ?? '')
    .split(',')
    .map((rule) => rule.trim())
    .filter(Boolean);
  const types: string[] = [];
  const rest: string[] = [];
  for (const rule of rules) {
    const lower = rule.toLowerCase();
    const type =
      MIME_ALIAS[lower] ??
      TYPE_OF_RULE.get(lower.startsWith('.') ? lower : `.${lower}`) ??
      (OPTION_OF_VALUE.has(lower) ? lower : undefined);
    if (type && OPTION_OF_VALUE.has(type)) {
      if (!types.includes(type)) types.push(type);
    } else {
      rest.push(rule);
    }
  }
  return { types, rest };
}

/** 运行时最终 accept：预置类型 + 自定义后缀 */
export function resolveAccept(field: UploadAcceptField): string {
  const fromTypes = acceptOfTypes(field.acceptTypes);
  const custom = String(field.accept ?? '').trim();
  if (fromTypes && custom) return `${fromTypes},${custom}`;
  return fromTypes || custom;
}

/** 提示文案用的类型说明，如「图片、PDF」 */
export function typeLabelsOf(types?: string[] | null): string {
  const picked = new Set(types ?? []);
  return UPLOAD_TYPE_OPTIONS.filter((option) => picked.has(option.value))
    .map((option) => option.label)
    .join('、');
}

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif']);

function extensionOf(name: string): string {
  const path = String(name ?? '').split('?')[0].split('#')[0];
  const base = path.split('/').pop() ?? '';
  const index = base.lastIndexOf('.');
  return index >= 0 ? base.slice(index + 1).toLowerCase() : '';
}

/** 判断 URL/文件名是否图片，用于上传列表与列表单元格选择渲染方式 */
export function isImageUrl(url?: string | null): boolean {
  const text = String(url ?? '').trim();
  if (!text) return false;
  if (/^data:image\//i.test(text)) return true;
  return IMAGE_EXTENSIONS.has(extensionOf(text));
}

/** 文件选择阶段判断图片，优先用 mime */
export function isImageFile(file: { name?: string; type?: string } | null | undefined): boolean {
  if (!file) return false;
  if (String(file.type ?? '').toLowerCase().startsWith('image/')) return true;
  return IMAGE_EXTENSIONS.has(extensionOf(String(file.name ?? '')));
}

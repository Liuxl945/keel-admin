import { computed } from 'vue';
import { ElMessage } from 'element-plus';
import type { UploadProgressEvent, UploadRequestOptions, UploadUserFile } from 'element-plus';
import type { CommonField, UploadHandler, UploadResult } from './types';
import { decodeUploadUrls, encodeUploadUrls, fileNameOf } from './upload-value';
import { resolveAccept, typeLabelsOf } from './upload-accept';

interface UploadAjaxError extends Error {
  status: number;
  method: string;
  url: string;
}

interface UploadControlProps {
  field: CommonField;
  modelValue: string | null | undefined;
  upload?: UploadHandler;
  disabled?: boolean;
}

export const DEFAULT_UPLOAD_MAX_COUNT = 9;
export const DEFAULT_UPLOAD_MAX_SIZE = 10;

/** accept 语法匹配：支持 .ext、image/*、具体 mime，逗号分隔 */
function acceptMatch(file: File, accept: string): boolean {
  const rules = accept
    .split(',')
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean);
  if (rules.length === 0) return true;
  const name = file.name.toLowerCase();
  const mime = (file.type || '').toLowerCase();
  return rules.some((rule) => {
    if (rule.startsWith('.')) return name.endsWith(rule);
    if (rule.endsWith('/*')) return mime.startsWith(rule.slice(0, -1));
    return mime === rule;
  });
}

/**
 * 文件 / 图片上传控件共用逻辑：
 * 单文件存 URL 字符串、多文件存 JSON 数组（见 upload-value.ts）；
 * 统一处理数量上限、单文件大小、允许类型与提示文案。
 */
export function useUploadControl(
  props: UploadControlProps,
  emit: (event: 'update:modelValue', value: string) => void,
) {
  const maxCount = computed(() =>
    Math.max(1, Number(props.field.maxCount) || DEFAULT_UPLOAD_MAX_COUNT),
  );
  const maxSize = computed(() => {
    const value = Number(props.field.maxSize);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_UPLOAD_MAX_SIZE;
  });
  const accept = computed(() => resolveAccept(props.field));
  /** 允许类型的可读名称，用于提示与错误文案 */
  const acceptLabels = computed(() => typeLabelsOf(props.field.acceptTypes));
  const urls = computed(() => decodeUploadUrls(props.modelValue));
  const fileList = computed<UploadUserFile[]>(() =>
    urls.value.map((url) => ({ name: fileNameOf(url) || '已上传文件', url })),
  );
  /** 上传提示：优先用配置文案，否则按数量/大小/类型自动生成 */
  const tipText = computed(() => {
    const custom = String(props.field.tip ?? '').trim();
    if (custom) return custom;
    const types = acceptLabels.value ? `，支持 ${acceptLabels.value}` : '';
    return `最多上传 ${maxCount.value} 个，单个不超过 ${maxSize.value}MB${types}`;
  });
  /** 已达上限时隐藏上传按钮，避免继续点击 */
  const reachedLimit = computed(() => fileList.value.length >= maxCount.value);

  function emitUrls(next: string[]): void {
    emit('update:modelValue', encodeUploadUrls(next));
  }

  function toUploadError(message: string, options: UploadRequestOptions): UploadAjaxError {
    const error = new Error(message) as UploadAjaxError;
    error.status = 0;
    error.method = 'POST';
    error.url = '';
    // 保留原始请求上下文，便于调用方排查
    void options;
    return error;
  }

  function beforeUpload(file: File): boolean {
    if (!acceptMatch(file, accept.value)) {
      const allowed = acceptLabels.value || accept.value;
      ElMessage.error(allowed ? `只允许上传 ${allowed} 类型文件` : '文件类型不符合要求');
      return false;
    }
    if (file.size > maxSize.value * 1024 * 1024) {
      ElMessage.error(`${file.name} 超过 ${maxSize.value}MB，无法上传`);
      return false;
    }
    return true;
  }

  async function request(options: UploadRequestOptions): Promise<void> {
    if (!props.upload) {
      options.onError(toUploadError('未配置上传接口', options));
      return;
    }
    try {
      // 分片上传的进度透传给 el-upload，列表项会显示百分比进度条
      const response = await props.upload(options.file, (percent) => {
        options.onProgress?.({ percent } as UploadProgressEvent);
      });
      options.onSuccess(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : '上传失败';
      ElMessage.error(message);
      options.onError(toUploadError(message, options));
    }
  }

  function onSuccess(response: UploadResult): void {
    const next = [...urls.value];
    if (!next.includes(response.url)) next.push(response.url);
    emitUrls(next);
  }

  function onRemove(file?: UploadUserFile): void {
    const target = file?.url;
    // 被 before-upload 拦截的临时文件没有 url，el-upload 也会走 on-remove，不能当成「清空全部」
    if (!target) return;
    emitUrls(urls.value.filter((url) => url !== target));
  }

  function onExceed(): void {
    ElMessage.warning(`最多上传 ${maxCount.value} 个文件`);
  }

  return {
    fileList,
    urls,
    maxCount,
    maxSize,
    accept,
    acceptLabels,
    tipText,
    reachedLimit,
    beforeUpload,
    request,
    onSuccess,
    onRemove,
    onExceed,
  };
}

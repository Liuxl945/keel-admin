import { computed, watch } from 'vue';
import type { CommonField } from './types';

interface CodeControlProps {
  field: CommonField;
  modelValue: string | null | undefined;
  /** 同一表单的所有字段当前值，联动模式从这里取数 */
  values?: Record<string, any>;
  /** 字段名 → 显示标题，联动模式展示用 */
  codeLabels?: Record<string, string>;
}

/**
 * 二维码 / 条码是展示型控件，内容来源统一在这里解析：
 * - fixed：取字段配置里的固定值；
 * - link：按配置关联本表单其它字段的当前值拼接；
 * - manual：历史数据兼容，按已存 modelValue 显示（UI 已移除手填入口）。
 * 解析结果会回写到自身 modelValue，保证保存时内容落库；控件本身只读、不显示输入框。
 */
export function useCodeContent(
  props: CodeControlProps,
  emit: (event: 'update:modelValue', value: string) => void,
) {
  const source = computed(() => props.field.codeSource ?? 'fixed');
  const isManual = computed(() => source.value === 'manual');

  const linkNames = computed(() => props.field.codeFields ?? []);
  const linkLabels = computed(() =>
    linkNames.value.map((name) => props.codeLabels?.[name] || name),
  );

  const linkedContent = computed(() =>
    linkNames.value
      .map((name) => props.values?.[name])
      .filter((item) => item !== null && item !== undefined && String(item) !== '')
      .map((item) => String(item))
      .join(props.field.codeSeparator ?? ''),
  );

  const content = computed(() => {
    if (source.value === 'fixed') return String(props.field.codeValue ?? '').trim();
    if (source.value === 'link') return linkedContent.value.trim();
    return String(props.modelValue ?? '');
  });

  const model = computed({
    get: () => props.modelValue ?? '',
    set: (next: string) => emit('update:modelValue', next),
  });

  watch(
    content,
    (text) => {
      if (isManual.value) return;
      if (String(props.modelValue ?? '') === text) return;
      emit('update:modelValue', text);
    },
    { immediate: true },
  );

  return { source, isManual, content, model, linkLabels };
}

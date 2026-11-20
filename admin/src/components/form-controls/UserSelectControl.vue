<script setup lang="ts">
/**
 * 用户选择：弹框选择系统用户，值以 `{v,l}` JSON 写入字段（v=用户 id，l=昵称）。
 * 数据由业务侧注入（用户列表接口），控件本身不引用任何业务 API。
 */
import { computed } from 'vue';
import DataPickerControl from './DataPickerControl.vue';
import type { CommonField, DataFetchHandler } from './types';

const props = defineProps<{
  field: CommonField;
  modelValue: string | null | undefined;
  disabled?: boolean;
  fetch?: DataFetchHandler;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const DEFAULT_COLUMNS: CommonField['listFields'] = [
  { key: 'username', label: '账号' },
  { key: 'nickname', label: '昵称' },
  { key: 'phone', label: '手机号' },
];

/** 内置数据源：只保留「多选 / 标题 / 占位」等可配置项，关键列用默认值兜底 */
const mergedField = computed<CommonField>(() => ({
  ...props.field,
  // schema 里可能存着空串（旧数据 / 手工改过类型），这里统一兜底，避免回显成 id
  valueField: props.field.valueField || 'id',
  displayField: props.field.displayField || 'nickname',
  keywordKey: props.field.keywordKey || 'keyword',
  keywordPlaceholder: props.field.keywordPlaceholder || '搜索账号 / 昵称',
  pickerTitle: props.field.pickerTitle || '选择用户',
  listFields: props.field.listFields?.length ? props.field.listFields : DEFAULT_COLUMNS,
  builtinSource: 'user',
}));
</script>

<template>
  <DataPickerControl
    :field="mergedField"
    :model-value="modelValue"
    :disabled="disabled"
    :fetch="fetch"
    source-label="用户"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

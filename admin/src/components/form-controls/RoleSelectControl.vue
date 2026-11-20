<script setup lang="ts">
/**
 * 角色选择：弹框选择系统角色，值以 `{v,l}` JSON 写入字段（v=角色 id，l=角色名称）。
 * 数据由业务侧注入（角色列表接口），控件本身不引用任何业务 API。
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
  { key: 'name', label: '角色名称' },
  { key: 'code', label: '角色编码' },
  { key: 'description', label: '描述' },
];

/** 内置数据源：只保留「多选 / 标题 / 占位」等可配置项，关键列用默认值兜底 */
const mergedField = computed<CommonField>(() => ({
  ...props.field,
  // schema 里可能存着空串（旧数据 / 手工改过类型），这里统一兜底，避免回显成 id
  valueField: props.field.valueField || 'id',
  displayField: props.field.displayField || 'name',
  keywordKey: props.field.keywordKey || 'keyword',
  keywordPlaceholder: props.field.keywordPlaceholder || '搜索角色名称 / 编码',
  pickerTitle: props.field.pickerTitle || '选择角色',
  listFields: props.field.listFields?.length ? props.field.listFields : DEFAULT_COLUMNS,
  builtinSource: 'role',
}));
</script>

<template>
  <DataPickerControl
    :field="mergedField"
    :model-value="modelValue"
    :disabled="disabled"
    :fetch="fetch"
    source-label="角色"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

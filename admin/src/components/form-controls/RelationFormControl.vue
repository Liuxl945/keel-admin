<script setup lang="ts">
/**
 * 关联表单：弹出已发布表单的数据列表，选一条/多条回填。
 * 数据来源由业务侧注入（表单预览接口）；控件本身不引用任何业务 API。
 */
import DataPickerControl from './DataPickerControl.vue';
import type { CommonField, DataFetchHandler } from './types';

defineProps<{
  field: CommonField;
  modelValue: string | null | undefined;
  disabled?: boolean;
  fetch?: DataFetchHandler;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <DataPickerControl
    :field="field"
    :model-value="modelValue"
    :disabled="disabled"
    :fetch="fetch"
    source-label="关联表单"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

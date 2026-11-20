<script setup lang="ts">
import { computed } from 'vue';
import type { CommonField } from './types';

const props = defineProps<{
  field: CommonField;
  modelValue: string | null | undefined;
  disabled?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const value = computed({
  get: () => props.modelValue || '',
  set: (next: string) => emit('update:modelValue', next),
});
</script>

<template>
  <div class="common-color-control">
    <el-color-picker
      v-model="value"
      :disabled="disabled || field.disabled"
      :clearable="field.clearable !== false"
      show-alpha
      color-format="hex"
    />
    <span class="common-color-control__value">{{ value || field.placeholder || '请选择颜色' }}</span>
  </div>
</template>

<style scoped>
.common-color-control {
  display: flex;
  gap: 8px;
  align-items: center;
}

.common-color-control__value {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>

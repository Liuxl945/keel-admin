<script setup lang="ts">
import type { CommonField } from './types';

defineProps<{
  field: CommonField;
  modelValue: any;
  disabled?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: any] }>();
</script>

<template>
  <el-switch
    :model-value="modelValue"
    :disabled="disabled || field.disabled"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

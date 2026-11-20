<script setup lang="ts">
import { computed } from 'vue';
import type { CommonField } from './types';

const props = defineProps<{
  field: CommonField;
  modelValue: number | null | undefined;
  disabled?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: number] }>();

const min = computed(() => props.field.min ?? 0);
const max = computed(() => (props.field.max ?? 100) <= min.value ? min.value + 100 : (props.field.max ?? 100));
const step = computed(() => (props.field.step ?? 1) > 0 ? props.field.step ?? 1 : 1);
const value = computed({
  get: () => {
    const current = props.modelValue ?? min.value;
    return Math.min(max.value, Math.max(min.value, current));
  },
  set: (next: number) => emit('update:modelValue', next),
});
</script>

<template>
  <el-slider
    v-model="value"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled || field.disabled"
    show-input
    :show-input-controls="false"
  />
</template>

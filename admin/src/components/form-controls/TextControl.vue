<script setup lang="ts">
import { computed } from 'vue';
import type { CommonField } from './types';

const props = defineProps<{
  field: CommonField;
  modelValue: any;
  disabled?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: any] }>();

const model = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});
const isDisabled = computed(() => Boolean(props.disabled || props.field.disabled));
const isClearable = computed(() => props.field.clearable !== false);
const placeholder = computed(() => props.field.placeholder || `请输入${props.field.label ?? ''}`);
</script>

<template>
  <el-input
    v-if="field.type === 'input'"
    v-model="model"
    :placeholder="placeholder"
    :clearable="isClearable"
    :disabled="isDisabled"
  />

  <el-input
    v-else-if="field.type === 'textarea'"
    v-model="model"
    type="textarea"
    :rows="field.rows ?? 4"
    :placeholder="placeholder"
    :disabled="isDisabled"
  />

  <el-input-number
    v-else-if="field.type === 'number'"
    v-model="model"
    :min="field.min ?? undefined"
    :max="field.max ?? undefined"
    :placeholder="placeholder"
    :disabled="isDisabled"
    style="width: 100%"
  />
</template>

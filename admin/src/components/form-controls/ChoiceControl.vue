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
const options = computed(() => props.field.options ?? []);
const placeholder = computed(() => props.field.placeholder || `请选择${props.field.label ?? ''}`);
</script>

<template>
  <el-select
    v-if="field.type === 'select'"
    v-model="model"
    :placeholder="placeholder"
    :clearable="field.clearable !== false"
    :disabled="isDisabled"
    style="width: 100%"
  >
    <el-option v-for="option in options" :key="option.value" :label="option.label" :value="option.value" />
  </el-select>

  <el-radio-group v-else-if="field.type === 'radio'" v-model="model" :disabled="isDisabled">
    <el-radio v-for="option in options" :key="option.value" :value="option.value">
      {{ option.label }}
    </el-radio>
  </el-radio-group>

  <el-checkbox-group v-else-if="field.type === 'checkbox'" v-model="model" :disabled="isDisabled">
    <el-checkbox v-for="option in options" :key="option.value" :value="option.value">
      {{ option.label }}
    </el-checkbox>
  </el-checkbox-group>
</template>

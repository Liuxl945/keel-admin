<script setup lang="ts">
import { computed } from 'vue';
import type { CommonField } from './types';
import { dateFormatOf, datePickerTypeOf, isTimeFormat } from './date-format';
import { formatByPattern } from '@/utils/datetime';

const props = defineProps<{
  field: CommonField;
  modelValue: any;
  disabled?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: any] }>();

const isDisabled = computed(() => Boolean(props.disabled || props.field.disabled));
const placeholder = computed(() => props.field.placeholder || `请选择${props.field.label ?? ''}`);

const dateFormat = computed(() => dateFormatOf(props.field));
const pickerType = computed(() => datePickerTypeOf(dateFormat.value));

/** datetime 现在是「时间」控件：用 el-time-picker 只选时分秒，仅两档格式 */
const isTime = computed(() => props.field.type === 'datetime' && isTimeFormat(dateFormat.value));

/** date 控件：显示格式与存储格式一致 */
const dateModel = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

/**
 * 时间控件对外仍输出完整时间戳（沿用 datetime 数据库列，后端存储逻辑不变）。
 * - get：从完整时间戳 / ISO 里用本地时区提取 HH:mm:ss 给 el-time-picker；
 * - set：把选中的时分秒拼回锚定日期的完整时间戳；编辑时保留原值日期部分。
 * 这样交互是纯时间选择，落库仍是 `YYYY-MM-DD HH:mm:ss`，PostgreSQL timestamp 可正常接收。
 */
const TIME_ANCHOR_DATE = '2000-01-01';
const timeModel = computed({
  get: () => {
    if (!props.modelValue) return '';
    const text = formatByPattern(props.modelValue, 'HH:mm:ss');
    return text === '-' ? '' : text;
  },
  set: (value: string) => {
    if (!value) {
      emit('update:modelValue', '');
      return;
    }
    const time = value.length === 5 ? `${value}:00` : value; // HH:mm -> HH:mm:ss
    let datePart = TIME_ANCHOR_DATE;
    if (props.modelValue) {
      const day = formatByPattern(props.modelValue, 'YYYY-MM-DD');
      if (day !== '-') datePart = day;
    }
    emit('update:modelValue', `${datePart} ${time}`);
  },
});
</script>

<template>
  <el-time-picker
    v-if="isTime"
    v-model="timeModel"
    :format="dateFormat"
    value-format="HH:mm:ss"
    :placeholder="placeholder"
    :clearable="field.clearable !== false"
    :disabled="isDisabled"
    style="width: 100%"
  />
  <el-date-picker
    v-else
    v-model="dateModel"
    :type="pickerType"
    :format="dateFormat"
    :value-format="dateFormat"
    :placeholder="placeholder"
    :clearable="field.clearable !== false"
    :disabled="isDisabled"
    style="width: 100%"
  />
</template>

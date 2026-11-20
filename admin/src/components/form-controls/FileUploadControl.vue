<script setup lang="ts">
import { computed } from 'vue';
import type { CommonField, UploadHandler } from './types';
import { useUploadControl } from './useUploadControl';

const props = defineProps<{
  field: CommonField;
  modelValue: string | null | undefined;
  upload?: UploadHandler;
  disabled?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
/** 禁用（含查看模式）时隐藏「选择文件」按钮，只展示已上传的文件列表 */
const isDisabled = computed(() => Boolean(props.disabled || props.field.disabled));
const {
  fileList,
  maxCount,
  accept,
  tipText,
  reachedLimit,
  beforeUpload,
  request,
  onSuccess,
  onRemove,
  onExceed,
} = useUploadControl(props, emit);
</script>

<template>
  <el-upload
    class="common-file-control"
    :file-list="fileList"
    :http-request="request"
    :on-success="onSuccess"
    :on-remove="onRemove"
    :before-upload="beforeUpload"
    :on-exceed="onExceed"
    :accept="accept"
    :disabled="isDisabled"
    :limit="maxCount"
  >
    <el-button v-if="!reachedLimit && !isDisabled" type="primary" plain :disabled="isDisabled">
      选择文件
    </el-button>
    <template #tip>
      <div v-if="tipText" class="common-file-control__tip">{{ tipText }}</div>
    </template>
  </el-upload>
</template>

<style scoped>
.common-file-control__tip {
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
</style>

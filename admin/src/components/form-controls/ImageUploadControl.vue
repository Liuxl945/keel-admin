<script setup lang="ts">
import { computed } from 'vue';
import { Delete, Document, Plus } from '@element-plus/icons-vue';
import type { CommonField, UploadHandler } from './types';
import { useUploadControl } from './useUploadControl';
import { isImageUrl } from './upload-accept';

const props = defineProps<{
  field: CommonField;
  modelValue: string | null | undefined;
  upload?: UploadHandler;
  disabled?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
/** 禁用（含查看模式）时隐藏「+」上传框，只展示已上传的图片 */
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
  <div class="common-image-control">
    <el-upload
      class="common-image-control__uploader"
      :class="{
        'common-image-control__uploader--full': reachedLimit,
        'common-image-control__uploader--disabled': isDisabled,
      }"
      list-type="picture-card"
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
      <div class="common-image-control__trigger">
        <el-icon><Plus /></el-icon>
      </div>
      <template #file="{ file }">
        <img
          v-if="isImageUrl(file.url)"
          class="common-image-control__img"
          :src="file.url"
          :alt="file.name"
        />
        <!-- 允许类型里包含非图片（PDF/Excel 等）时用文件卡片展示，避免破图 -->
        <div v-else class="common-image-control__file" :title="file.name">
          <el-icon class="common-image-control__file-icon"><Document /></el-icon>
          <span class="common-image-control__file-name">{{ file.name }}</span>
        </div>
        <span
          v-if="!isDisabled"
          class="common-image-control__actions"
          title="移除"
          @click.stop="onRemove(file)"
        >
          <el-icon><Delete /></el-icon>
        </span>
      </template>
      <template #tip>
        <div v-if="tipText" class="common-image-control__tip">{{ tipText }}</div>
      </template>
    </el-upload>
  </div>
</template>

<style scoped>
.common-image-control :deep(.el-upload-list__item) {
  width: 104px;
  height: 104px;
}

.common-image-control :deep(.el-upload--picture-card) {
  width: 104px;
  height: 104px;
}

/* 达到上限后连「+」空框一起去掉：Element Plus 即使没有插槽内容也会保留上传框外壳 */
/* 禁用（查看模式 / 字段禁用）时同样隐藏「+」上传框 */
.common-image-control__uploader--full :deep(.el-upload--picture-card),
.common-image-control__uploader--disabled :deep(.el-upload--picture-card) {
  display: none;
}

.common-image-control__trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 24px;
  color: var(--el-text-color-secondary);
}

.common-image-control__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.common-image-control__file {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 100%;
  padding: 0 6px;
  background: var(--el-fill-color-light);
}

.common-image-control__file-icon {
  font-size: 24px;
  color: var(--el-text-color-secondary);
}

.common-image-control__file-name {
  display: -webkit-box;
  overflow: hidden;
  font-size: 11px;
  line-height: 1.3;
  color: var(--el-text-color-regular);
  text-align: center;
  word-break: break-all;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.common-image-control__actions {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  cursor: pointer;
  background: rgb(0 0 0 / 50%);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.common-image-control :deep(.el-upload-list__item:hover) .common-image-control__actions {
  opacity: 1;
}

.common-image-control__tip {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
</style>

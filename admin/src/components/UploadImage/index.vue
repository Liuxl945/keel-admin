<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage, type UploadRequestOptions } from 'element-plus';
import { uploadFile } from '@/api/upload';

const props = withDefaults(
  defineProps<{
    modelValue: string | null;
    width?: string;
    height?: string;
    tip?: string;
  }>(),
  {
    width: '96px',
    height: '96px',
    tip: '上传图片',
  },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const loading = ref(false);
/** 分片上传进度，显示在遮罩上，避免大图上传时只有一个转圈 */
const percent = ref(0);

async function handleUpload(options: UploadRequestOptions): Promise<void> {
  loading.value = true;
  percent.value = 0;
  try {
    const result = await uploadFile(options.file, {
      onProgress: (value) => {
        percent.value = value;
      },
    });
    emit('update:modelValue', result.url);
    ElMessage.success('上传成功');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '上传失败');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <el-upload
    class="upload-image"
    :show-file-list="false"
    :http-request="handleUpload"
    accept="image/*"
    :disabled="loading"
  >
    <div class="upload-image__box" :style="{ width: props.width, height: props.height }">
      <img v-if="modelValue" :src="modelValue" alt="uploaded" class="upload-image__img" />
      <div v-else class="upload-image__placeholder">
        <el-icon><Plus /></el-icon>
        <span>{{ tip }}</span>
      </div>
      <div v-if="loading" class="upload-image__loading">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span class="upload-image__percent">{{ percent }}%</span>
      </div>
    </div>
  </el-upload>
</template>

<style scoped lang="scss">
.upload-image__box {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: pointer;
  background: #f7f9fc;
  border: 1px dashed #c8d4e4;
  border-radius: 10px;
  transition: border-color 0.2s ease;
}

.upload-image__box:hover {
  border-color: #409eff;
}

.upload-image__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.upload-image__placeholder {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  color: #8a94a6;
}

.upload-image__loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #fff;
  background: rgba(0, 0, 0, 0.35);
}

.upload-image__percent {
  font-size: 12px;
  line-height: 1;
}
</style>

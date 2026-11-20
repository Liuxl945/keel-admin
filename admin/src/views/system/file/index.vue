<script setup lang="ts">
defineOptions({ name: 'SystemFile' });

import { ref } from 'vue';
import { ElMessage, ElMessageBox, type UploadRequestOptions } from 'element-plus';
import ProTable from '@/components/ProTable/index.vue';
import type { ProTableColumn, SearchItem } from '@/components/ProTable/types';
import AppDialog from '@/components/AppDialog/index.vue';
import { deleteFile, listFiles, type FileQuery } from '@/api/file';
import { uploadFile } from '@/api/upload';
import { formatDateTime } from '@/utils/datetime';
import type { UploadedFileItem } from '@/types/entities';

const tableRef = ref<any>(null);
const uploading = ref(false);
/** 分片上传进度文案：合并阶段单独提示，避免 100% 后长时间没反应 */
const uploadingText = ref('');

const columns: ProTableColumn[] = [
  { type: 'index', label: '序号', width: 70 },
  { prop: 'originalName', label: '文件', minWidth: 260, slot: 'file' },
  { prop: 'mimeType', label: '类型', width: 140, slot: 'mimeType' },
  { prop: 'size', label: '大小', width: 100, slot: 'size' },
  { prop: 'uploaderName', label: '上传人', width: 120, slot: 'uploader' },
  { prop: 'createdAt', label: '上传时间', width: 170, slot: 'createdAt' },
  { label: '操作', width: 190, fixed: 'right', slot: 'actions' },
];

const searchItems: SearchItem[] = [
  { prop: 'keyword', label: '关键字', placeholder: '文件名 / 上传人' },
  {
    prop: 'mimeType',
    label: '类型',
    type: 'select',
    options: [
      { label: '图片', value: 'image' },
      { label: '全部', value: '' },
    ],
  },
];

function loadData(params: Record<string, unknown>) {
  return listFiles(params as FileQuery);
}

function isImage(row: UploadedFileItem): boolean {
  return row.mimeType.startsWith('image/');
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

async function handleUpload(options: UploadRequestOptions): Promise<void> {
  uploading.value = true;
  try {
    await uploadFile(options.file, {
      onProgress: (percent) => {
        uploadingText.value = percent < 100 ? `上传中 ${percent}%` : '合并中…';
      },
    });
    ElMessage.success('上传成功');
    tableRef.value?.reload();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '上传失败');
  } finally {
    uploading.value = false;
    uploadingText.value = '';
  }
}

function preview(row: UploadedFileItem): void {
  if (isImage(row)) {
    previewImage.value = row;
    previewVisible.value = true;
    return;
  }
  window.open(row.url, '_blank');
}

async function copyLink(row: UploadedFileItem): Promise<void> {
  const url = `${window.location.origin}${row.url}`;
  try {
    await navigator.clipboard.writeText(url);
    ElMessage.success('链接已复制');
  } catch {
    ElMessage.warning(`复制失败，请手动复制：${url}`);
  }
}

async function handleDelete(row: UploadedFileItem): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除文件「${row.originalName}」吗？删除后链接将失效。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger',
    });
  } catch {
    return;
  }
  try {
    await deleteFile(row.id);
    ElMessage.success('文件已删除');
    tableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  }
}

const previewVisible = ref(false);
const previewImage = ref<UploadedFileItem | null>(null);
</script>

<template>
  <div class="page">
    <ProTable ref="tableRef" :columns="columns" :search-items="searchItems" :request="loadData" row-key="id">
      <template #toolbar>
        <el-upload
          v-permission="'system:upload'"
          :show-file-list="false"
          :http-request="handleUpload"
          :disabled="uploading"
        >
          <el-button type="primary" :loading="uploading">
            {{ uploadingText || '上传文件' }}
          </el-button>
        </el-upload>
        <span class="text-muted">分片上传，支持断点续传；单文件上限见服务端 UPLOAD_MAX_FILE_SIZE_MB</span>
      </template>

      <template #file="{ row }">
        <div class="file-cell">
          <el-image
            v-if="isImage(row)"
            :src="row.url"
            class="file-cell__thumb"
            fit="cover"
            :preview-src-list="[row.url]"
            preview-teleported
          />
          <div v-else class="file-cell__thumb file-cell__thumb--file">
            <el-icon><Document /></el-icon>
          </div>
          <div class="file-cell__info">
            <span class="file-cell__name">{{ row.originalName }}</span>
            <span class="file-cell__url">{{ row.url }}</span>
          </div>
        </div>
      </template>

      <template #mimeType="{ row }">{{ row.mimeType }}</template>
      <template #size="{ row }">{{ formatSize(row.size) }}</template>
      <template #uploader="{ row }">{{ row.uploaderName || '-' }}</template>
      <template #createdAt="{ row }">{{ formatDateTime(row.createdAt) }}</template>

      <template #actions="{ row }">
        <el-button link type="primary" @click="preview(row)">预览</el-button>
        <el-button link type="primary" @click="copyLink(row)">复制链接</el-button>
        <el-button v-permission="'file:delete'" link type="danger" @click="handleDelete(row)">删除</el-button>
      </template>
    </ProTable>

    <AppDialog v-model="previewVisible" :title="previewImage?.originalName || '图片预览'" width="720px">
      <div class="preview-box">
        <img v-if="previewImage" :src="previewImage.url" alt="preview" class="preview-box__img" />
      </div>
    </AppDialog>
  </div>
</template>

<style scoped lang="scss">
.file-cell {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
}

.file-cell__thumb {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 6px;
}

.file-cell__thumb--file {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #8a94a6;
  background: #f2f5f9;
}

.file-cell__info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.file-cell__name {
  overflow: hidden;
  font-size: 14px;
  color: #303133;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-cell__url {
  overflow: hidden;
  font-size: 12px;
  color: #a0a9b8;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-box {
  display: flex;
  justify-content: center;
}

.preview-box__img {
  max-width: 100%;
  max-height: 60vh;
  object-fit: contain;
}

.page :deep(.el-upload) {
  display: inline-flex;
}
</style>

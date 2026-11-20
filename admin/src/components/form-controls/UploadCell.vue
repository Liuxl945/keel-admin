<script setup lang="ts">
/**
 * 图片/文件上传字段的只读展示单元格：图片出缩略图（可点开大图），文件出可下载链接。
 * 值协议见 upload-value.ts：单文件是 URL 字符串，多文件是 JSON 数组字符串。
 */
import { computed } from 'vue';
import { Document } from '@element-plus/icons-vue';
import { decodeUploadUrls, fileNameOf } from './upload-value';
import { isImageUrl } from './upload-accept';

const props = withDefaults(
  defineProps<{
    type: 'image' | 'file';
    value?: unknown;
    /** 聚合列（子表展开视图）的值是后端用 ', ' 拼接的多段文本，需要逐段解析 */
    aggregated?: boolean;
    /** 图片最多并排显示几张，超出用 +N 表示 */
    visibleCount?: number;
  }>(),
  { aggregated: false, visibleCount: 3 },
);

const urls = computed<string[]>(() => {
  const parts = props.aggregated
    ? String(props.value ?? '').split(', ')
    : [props.value == null ? '' : String(props.value)];
  const result: string[] = [];
  for (const part of parts) {
    for (const url of decodeUploadUrls(part)) {
      if (!result.includes(url)) result.push(url);
    }
  }
  return result;
});

const images = computed(() => urls.value.slice(0, props.visibleCount));
const restCount = computed(() => Math.max(urls.value.length - images.value.length, 0));
/** 大图预览只放图片，避免翻页时出现 PDF/视频 */
const imageUrls = computed(() => urls.value.filter((url) => isImageUrl(url)));

function nameOf(url: string): string {
  return fileNameOf(url) || url;
}

/** 只有 URL 才做下载链接，历史脏数据（纯文本）保持文本展示，避免生成无效链接 */
function isLink(url: string): boolean {
  return /^(https?:\/\/|\/|data:)/i.test(url);
}
</script>

<template>
  <div v-if="urls.length > 0" class="upload-cell" :class="`upload-cell--${type}`" @click.stop>
    <template v-if="type === 'image'">
      <template v-for="url in images" :key="url">
        <el-image
          v-if="isImageUrl(url)"
          class="upload-cell__thumb"
          :src="url"
          :preview-src-list="imageUrls"
          :initial-index="imageUrls.indexOf(url)"
          fit="cover"
          preview-teleported
          hide-on-click-modal
        >
          <template #error>
            <span class="upload-cell__broken" :title="nameOf(url)">
              <el-icon><Document /></el-icon>
            </span>
          </template>
        </el-image>
        <!-- 图片控件允许了视频/PDF 等类型时，非图片文件按文件样式展示 -->
        <a
          v-else-if="isLink(url)"
          class="upload-cell__file"
          :href="url"
          :download="nameOf(url)"
          target="_blank"
          rel="noopener noreferrer"
          :title="`下载 ${nameOf(url)}`"
        >
          <el-icon class="upload-cell__icon"><Document /></el-icon>
          <span class="upload-cell__name">{{ nameOf(url) }}</span>
        </a>
        <span v-else class="upload-cell__text">{{ url }}</span>
      </template>
      <span v-if="restCount > 0" class="upload-cell__more">+{{ restCount }}</span>
    </template>
    <template v-else>
      <template v-for="url in urls" :key="url">
        <a
          v-if="isLink(url)"
          class="upload-cell__file"
          :href="url"
          :download="nameOf(url)"
          target="_blank"
          rel="noopener noreferrer"
          :title="`下载 ${nameOf(url)}`"
        >
          <el-icon class="upload-cell__icon"><Document /></el-icon>
          <span class="upload-cell__name">{{ nameOf(url) }}</span>
        </a>
        <span v-else class="upload-cell__text">{{ url }}</span>
      </template>
    </template>
  </div>
  <span v-else class="upload-cell__empty">-</span>
</template>

<style scoped>
.upload-cell {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-width: 0;
  line-height: 0;
}

.upload-cell--file {
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  line-height: 1.4;
}

.upload-cell__thumb {
  width: 30px;
  height: 30px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  cursor: zoom-in;
  transition: border-color 0.15s;
}

.upload-cell__thumb:hover {
  border-color: var(--el-color-primary);
}

.upload-cell__more {
  font-size: 12px;
  line-height: 30px;
  color: var(--el-text-color-secondary);
}

.upload-cell__broken {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--el-text-color-placeholder);
  background: var(--el-fill-color-light);
}

.upload-cell__text {
  font-size: 13px;
  line-height: 1.4;
  color: var(--el-text-color-regular);
}

.upload-cell__file {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 100%;
  color: var(--el-color-primary);
  font-size: 13px;
  line-height: 1.4;
  text-decoration: none;
}

.upload-cell__file:hover {
  text-decoration: underline;
}

.upload-cell__icon {
  flex: 0 0 auto;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.upload-cell__name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.upload-cell__empty {
  color: var(--el-text-color-placeholder);
}
</style>

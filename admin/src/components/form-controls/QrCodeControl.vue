<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import QRCode from 'qrcode';
import type { CommonField } from './types';
import { useCodeContent } from './useCodeContent';

const props = defineProps<{
  field: CommonField;
  modelValue: string | null | undefined;
  disabled?: boolean;
  values?: Record<string, any>;
  codeLabels?: Record<string, string>;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const { source, content } = useCodeContent(props, emit);

const image = ref('');
const failed = ref(false);

watch(
  content,
  async (text) => {
    if (!text) {
      image.value = '';
      failed.value = false;
      return;
    }
    try {
      image.value = await QRCode.toDataURL(text, {
        width: 168,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
      failed.value = false;
    } catch {
      image.value = '';
      failed.value = true;
    }
  },
  { immediate: true },
);

const emptyHint = computed(() => {
  if (failed.value) return '内容过长，无法生成二维码';
  return source.value === 'fixed' ? '请设置固定值' : '关联字段暂无内容';
});
</script>

<template>
  <div class="common-code-control">
    <div class="common-code-control__preview">
      <img v-if="image" :src="image" alt="二维码预览" />
      <span v-else class="common-code-control__placeholder">{{ emptyHint }}</span>
    </div>
  </div>
</template>

<style scoped>
.common-code-control {
  display: flex;
  align-items: flex-start;
}

.common-code-control__preview {
  display: flex;
  flex: 0 0 88px;
  align-items: center;
  justify-content: center;
  min-height: 88px;
  padding: 4px;
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.common-code-control__preview img {
  width: 80px;
  height: 80px;
}

.common-code-control__placeholder {
  padding: 4px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--el-text-color-placeholder);
  text-align: center;
}
</style>

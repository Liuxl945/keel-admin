<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import JsBarcode from 'jsbarcode';
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

const svgRef = ref<SVGSVGElement | null>(null);
const failed = ref(false);

async function render(): Promise<void> {
  await nextTick();
  const element = svgRef.value;
  if (!element) return;
  element.innerHTML = '';
  const text = content.value;
  if (!text) {
    failed.value = false;
    return;
  }
  try {
    JsBarcode(element, text, {
      format: 'CODE128',
      displayValue: true,
      width: 1.6,
      height: 56,
      margin: 0,
      fontSize: 12,
      lineColor: '#1f2329',
    });
    failed.value = false;
  } catch {
    failed.value = true;
  }
}

onMounted(() => void render());
watch(content, () => void render());

const emptyHint = computed(() => {
  if (failed.value) return '无法生成条码，请更换内容';
  return source.value === 'fixed' ? '请设置固定值' : '关联字段暂无内容';
});
</script>

<template>
  <div class="common-code-control">
    <div class="common-code-control__preview">
      <svg ref="svgRef" v-show="!failed" class="common-code-control__svg" />
      <span v-if="failed" class="common-code-control__placeholder">{{ emptyHint }}</span>
      <span v-else-if="!content" class="common-code-control__placeholder">{{ emptyHint }}</span>
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
  flex: 0 0 180px;
  align-items: center;
  justify-content: center;
  min-height: 76px;
  padding: 6px;
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.common-code-control__svg {
  max-width: 100%;
  height: 64px;
}

.common-code-control__placeholder {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  text-align: center;
}
</style>

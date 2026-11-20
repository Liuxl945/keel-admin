<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useDictStore } from '@/stores/dict';

const props = defineProps<{
  type: string;
  value: string | number | null | undefined;
}>();

const dict = useDictStore();

onMounted(() => {
  void dict.load();
});

const textValue = computed(() => (props.value === null || props.value === undefined ? '' : String(props.value)));
const item = computed(() => dict.getData(props.type).find((entry) => entry.dictValue === textValue.value));
const label = computed(() => item.value?.dictLabel ?? (textValue.value || '-'));
const tagType = computed(() => item.value?.tagType ?? 'info');
</script>

<template>
  <el-tag v-if="textValue" :type="tagType">{{ label }}</el-tag>
  <span v-else>-</span>
</template>

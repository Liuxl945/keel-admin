<script setup lang="ts">
defineOptions({ name: 'DevFormPreview' });

import { computed } from 'vue';
import { useRoute } from 'vue-router';
import FormPreviewTable from '../components/FormPreviewTable.vue';

const route = useRoute();
const formId = computed(() => Number(route.params.id));
</script>

<template>
  <div class="page form-preview-page">
    <FormPreviewTable v-if="formId > 0" :form-id="formId" />
    <el-empty v-else description="缺少表单 id" />
  </div>
</template>

<style scoped lang="scss">
.form-preview-page {
  gap: 0;
}
</style>

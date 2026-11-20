<script setup lang="ts">
defineOptions({ name: 'BizRuntime' });

import { computed } from 'vue';
import { useRoute } from 'vue-router';
import FormPreviewTable from '@/views/dev/form/components/FormPreviewTable.vue';

/**
 * 运行时业务页面：菜单类型为「表单」时统一指向这里，
 * 具体渲染哪张表单由路由 meta.formId 决定（发布表单时自动写入）。
 * keep-alive 以 route.path 为 key，因此多个表单菜单互不干扰。
 */
const route = useRoute();
const formId = computed(() => Number(route.meta.formId ?? 0));
</script>

<template>
  <div class="page">
    <FormPreviewTable v-if="formId > 0" :key="formId" :form-id="formId" />
    <el-empty v-else description="该菜单没有绑定在线表单，请到「系统管理 - 菜单管理」重新选择" />
  </div>
</template>

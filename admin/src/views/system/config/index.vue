<script setup lang="ts">
defineOptions({ name: 'SystemConfig' });

import { reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import ProTable from '@/components/ProTable/index.vue';
import type { ProTableColumn } from '@/components/ProTable/types';
import { listConfigs, updateConfigs } from '@/api/config';
import { useAppStore } from '@/stores/app';
import { formatDateTime } from '@/utils/datetime';
import type { ConfigItem } from '@/types/entities';

const app = useAppStore();
const tableRef = ref<any>(null);
const rows = ref<ConfigItem[]>([]);
const values = reactive<Record<string, string>>({});
const saving = ref(false);

/** 新增配置项时在这里补一项渲染方式，键名与 config.constants.ts 保持一致 */
const FORM_FIELDS: Record<string, { type: 'input' | 'textarea'; placeholder?: string }> = {
  system_name: { type: 'input', placeholder: '后台名称' },
  system_logo: { type: 'input', placeholder: 'Logo 图片地址' },
  login_notice: { type: 'textarea', placeholder: '登录页公告，可留空' },
};

function fieldOf(key: string): { type: 'input' | 'textarea'; placeholder?: string } {
  return FORM_FIELDS[key] ?? { type: 'input' };
}

const columns: ProTableColumn[] = [
  { type: 'index', label: '序号', width: 70 },
  { prop: 'name', label: '配置名称', minWidth: 140 },
  { prop: 'key', label: '配置键', minWidth: 140 },
  { prop: 'value', label: '配置值', minWidth: 320, slot: 'value' },
  { prop: 'category', label: '分类', width: 100, slot: 'category' },
  { prop: 'description', label: '说明', minWidth: 200, slot: 'description' },
  { prop: 'updatedAt', label: '更新时间', width: 170, slot: 'updatedAt' },
];

async function loadData(): Promise<{ list: ConfigItem[]; total: number; page: number; pageSize: number }> {
  const data = await listConfigs();
  rows.value = data;
  for (const item of data) {
    values[item.key] = item.value;
  }
  return { list: data, total: data.length, page: 1, pageSize: 200 };
}

async function handleSave(): Promise<void> {
  saving.value = true;
  try {
    const items = rows.value.map((row) => ({ key: row.key, value: values[row.key] ?? '' }));
    await updateConfigs(items);
    ElMessage.success('配置已保存');
    app.loaded = false;
    await app.loadPublicConfigs();
    tableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="page">
    <ProTable ref="tableRef" :columns="columns" :request="loadData" row-key="id">
      <template #toolbar>
        <el-button v-permission="'system:config'" type="primary" :loading="saving" @click="handleSave">
          保存全部
        </el-button>
      </template>

      <template #value="{ row }">
        <el-input
          v-if="fieldOf(row.key).type === 'input'"
          v-model="values[row.key]"
          :placeholder="fieldOf(row.key).placeholder"
        />
        <el-input
          v-else
          v-model="values[row.key]"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 4 }"
          :placeholder="fieldOf(row.key).placeholder"
        />
      </template>

      <template #category="{ row }">
        <el-tag :type="row.category === 'SYSTEM' ? 'primary' : 'info'">
          {{ row.category === 'SYSTEM' ? '系统' : '内容' }}
        </el-tag>
      </template>

      <template #description="{ row }">{{ row.description || '-' }}</template>
      <template #updatedAt="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
    </ProTable>
  </div>
</template>

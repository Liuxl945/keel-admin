<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import AppDialog from '@/components/AppDialog/index.vue';
import { previewDevModelDdl, publishDevModel } from '@/api/dev-model';
import type { DevModelDdlResult } from '@/types/dev-db';

const props = defineProps<{
  modelId: number | null;
  modelName?: string;
}>();

const visible = defineModel<boolean>({ required: true });
const emit = defineEmits<{ published: [id: number] }>();

const loading = ref(false);
const publishing = ref(false);
const preview = ref<DevModelDdlResult | null>(null);

const actionText: Record<DevModelDdlResult['action'], string> = {
  CREATE: '新建表',
  ALTER: '变更表',
  NONE: '无结构变化',
};

async function loadPreview(): Promise<void> {
  if (!props.modelId) return;
  loading.value = true;
  preview.value = null;
  try {
    preview.value = await previewDevModelDdl(props.modelId);
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    loading.value = false;
  }
}

async function confirmPublish(): Promise<void> {
  if (!props.modelId) return;
  publishing.value = true;
  try {
    await publishDevModel(props.modelId);
    ElMessage.success('发布成功，数据库表已更新');
    visible.value = false;
    emit('published', props.modelId);
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    publishing.value = false;
  }
}

watch(visible, (open) => {
  if (open) void loadPreview();
});
</script>

<template>
  <AppDialog v-model="visible" title="发布数据模型" width="880px">
    <div v-loading="loading" class="publish">
      <div class="publish__head">
        <span class="publish__name">{{ modelName || '数据模型' }}</span>
        <el-tag v-if="preview" :type="preview.action === 'CREATE' ? 'success' : 'warning'" effect="plain">
          {{ actionText[preview.action] }}
        </el-tag>
        <span v-if="preview?.previousTableName && preview.previousTableName !== preview.tableName" class="text-muted">
          表名：{{ preview.previousTableName }} → {{ preview.tableName }}
        </span>
      </div>

      <el-alert
        v-if="preview?.action === 'NONE'"
        type="success"
        :closable="false"
        show-icon
        :title="preview.message"
        description="发布操作不会执行任何 SQL，只会把模型标记为已发布。"
      />

      <el-alert
        v-if="preview && preview.warnings.length > 0"
        type="warning"
        :closable="false"
        show-icon
        class="publish__warning"
      >
        <template #title>发布前请确认以下变更</template>
        <ul class="publish__warnings">
          <li v-for="warning in preview.warnings" :key="warning">{{ warning }}</li>
        </ul>
      </el-alert>

      <el-alert
        v-if="preview?.destructive"
        type="error"
        :closable="false"
        show-icon
        class="publish__warning"
        title="包含删除字段或修改字段类型，可能导致数据丢失，请先在目标库备份"
      />

      <div class="publish__sql-label">将要执行的 SQL</div>
      <el-scrollbar max-height="46vh">
        <pre class="publish__sql">{{ preview?.sql || '-- 没有需要执行的结构变更，发布只会更新模型状态' }}</pre>
      </el-scrollbar>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        v-permission="'dev_model:ddl'"
        type="primary"
        :loading="publishing"
        :disabled="loading || !preview"
        @click="confirmPublish"
      >
        确认发布
      </el-button>
    </template>
  </AppDialog>
</template>

<style scoped lang="scss">
.publish {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 160px;
}

.publish__head {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.publish__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.publish__warning {
  align-items: flex-start;
}

.publish__warnings {
  padding-left: 18px;
  margin: 6px 0 0;
  line-height: 1.8;
}

.publish__sql-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.publish__sql {
  padding: 14px 16px;
  margin: 0;
  font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
}
</style>

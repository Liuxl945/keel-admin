<script setup lang="ts">
defineOptions({ name: 'DevApiRunDialog' });

import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import AppDialog from '@/components/AppDialog/index.vue';
import { getDevApi, runDevApi } from '@/api/dev-api';
import type { DevApiDetail, DevApiRunResult } from '@/types/dev-api';
import { formatSmartCell } from '@/components/form-controls/picker-value';

const props = defineProps<{ apiId: number | null }>();
const visible = defineModel<boolean>({ required: true });

const loading = ref(false);
const running = ref(false);
const detail = ref<DevApiDetail | null>(null);
const result = ref<DevApiRunResult | null>(null);
const values = reactive<Record<string, string>>({});
const page = ref(1);

const resultColumns = computed(() => {
  const rows = (result.value?.rows ?? []).filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item),
  );
  const keys = new Set<string>();
  for (const row of rows) Object.keys(row).forEach((key) => keys.add(key));
  return [...keys];
});

const resultRows = computed(() =>
  (result.value?.rows ?? []).filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item),
  ),
);

const resultJson = computed(() => JSON.stringify(result.value?.rows ?? [], null, 2));

watch(
  () => [visible.value, props.apiId] as const,
  async ([open, id]) => {
    if (!open || !id) return;
    result.value = null;
    page.value = 1;
    loading.value = true;
    try {
      detail.value = await getDevApi(id);
      for (const key of Object.keys(values)) delete values[key];
      for (const param of detail.value.config.params) {
        values[param.key] = param.sampleValue || param.defaultValue;
      }
    } catch {
      // 错误提示由 request 拦截器统一处理
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

async function handleRun(): Promise<void> {
  if (!props.apiId) return;
  const params: Record<string, string | number | boolean | null> = {};
  for (const param of detail.value?.config.params ?? []) {
    params[param.key] = values[param.key] ?? '';
  }
  running.value = true;
  try {
    result.value = await runDevApi(props.apiId, { params, page: page.value });
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    running.value = false;
  }
}

function handlePageChange(next: number): void {
  page.value = next;
  void handleRun();
}

function copyResult(): void {
  void navigator.clipboard.writeText(resultJson.value).then(
    () => ElMessage.success('结果已复制'),
    () => ElMessage.warning('复制失败，请手动选择文本'),
  );
}
</script>

<template>
  <AppDialog v-model="visible" title="接口试运行" width="980px">
    <div v-loading="loading" class="run-dialog">
      <div class="run-dialog__params">
        <div class="run-dialog__section-title">请求参数</div>
        <div v-if="!detail?.config.params.length" class="text-muted">该接口没有配置参数，可直接执行。</div>
        <el-form v-else label-position="top" size="small">
          <el-row :gutter="12">
            <el-col v-for="param in detail.config.params" :key="param.key" :span="8">
              <el-form-item :label="`${param.label || param.key}（:${param.key}）`">
                <el-input
                  v-model="values[param.key]"
                  :placeholder="`${param.type}${param.required ? ' · 必填' : ''}`"
                  clearable
                />
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
        <el-button type="primary" :loading="running" @click="handleRun">执行</el-button>
        <span class="text-muted run-dialog__hint">
          示例值来自参数配置；参数全部走绑定，不会拼进 SQL
        </span>
      </div>

      <template v-if="result">
        <div class="run-dialog__meta">
          <el-tag type="success" size="small">耗时 {{ result.durationMs }} ms</el-tag>
          <el-tag size="small">返回 {{ result.rows.length }} 行</el-tag>
          <el-tag v-if="result.total !== null" size="small">总计 {{ result.total }}</el-tag>
          <el-tag v-if="result.affectedRows !== null" size="small">影响 {{ result.affectedRows }} 行</el-tag>
          <el-tag v-if="result.insertId !== null" size="small">新增 ID {{ result.insertId }}</el-tag>
          <el-tag v-if="result.truncated" type="warning" size="small">结果已按最大行数截断</el-tag>
          <el-button link type="primary" @click="copyResult">复制结果 JSON</el-button>
        </div>

        <el-collapse class="run-dialog__sql">
          <el-collapse-item title="执行语句与绑定参数">
            <div class="run-dialog__sql-text">{{ result.sql ?? '（静态数据，无需执行 SQL）' }}</div>
            <div class="run-dialog__sql-text">参数：{{ JSON.stringify(result.params) }}</div>
          </el-collapse-item>
        </el-collapse>

        <div class="run-dialog__section-title">返回结果（已应用字段映射）</div>
        <el-table v-if="resultColumns.length" :data="resultRows" border size="small" max-height="320">
          <el-table-column
            v-for="column in resultColumns"
            :key="column"
            :prop="column"
            :label="column"
            min-width="130"
            show-overflow-tooltip
            :formatter="(_row: any, _col: any, value: any) => formatSmartCell(value)"
          />
        </el-table>
        <pre v-else class="run-dialog__json">{{ resultJson }}</pre>

        <el-pagination
          v-if="result.total !== null && result.pageSize"
          class="run-dialog__pager"
          layout="prev, pager, next"
          :current-page="result.page ?? 1"
          :page-size="result.pageSize"
          :total="result.total"
          @current-change="handlePageChange"
        />
      </template>
    </div>
  </AppDialog>
</template>

<style scoped lang="scss">
.run-dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 240px;
}

.run-dialog__section-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 8px;
}

.run-dialog__hint {
  margin-left: 10px;
  font-size: 12px;
}

.run-dialog__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.run-dialog__sql-text {
  font-family: var(--el-font-family-mono, monospace);
  font-size: 12px;
  word-break: break-all;
  white-space: pre-wrap;
  color: var(--el-text-color-regular);
}

.run-dialog__json {
  max-height: 320px;
  padding: 12px;
  margin: 0;
  overflow: auto;
  font-size: 12px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
}

.run-dialog__pager {
  justify-content: flex-end;
}
</style>

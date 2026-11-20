<script setup lang="ts">
defineOptions({ name: 'SystemLog' });

import { ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import ProTable from '@/components/ProTable/index.vue';
import type { ProTableColumn, SearchItem } from '@/components/ProTable/types';
import AppDialog from '@/components/AppDialog/index.vue';
import {
  batchDeleteLoginLogs,
  batchDeleteOperationLogs,
  exportLoginLogs,
  exportOperationLogs,
  getOperationLog,
  listLoginLogs,
  listOperationLogs,
  type LoginLogQuery,
  type OperationLogQuery,
} from '@/api/log';
import { formatDateTime } from '@/utils/datetime';
import type { LoginLogItem, OperationLogDetail, OperationLogItem } from '@/types/entities';

const activeTab = ref('operation');
const opTableRef = ref<any>(null);
const loginTableRef = ref<any>(null);
const exportingOp = ref(false);
const exportingLogin = ref(false);

const opColumns: ProTableColumn[] = [
  { type: 'selection', label: '', width: 55, fixed: 'left' },
  { type: 'index', label: '序号', width: 70 },
  { prop: 'username', label: '操作人', width: 120, slot: 'username' },
  { prop: 'method', label: '方法', width: 90, slot: 'method' },
  { prop: 'path', label: '路径', minWidth: 200, showOverflowTooltip: true },
  { prop: 'bizCode', label: '业务码', width: 100, slot: 'bizCode' },
  { prop: 'durationMs', label: '耗时(ms)', width: 100 },
  { prop: 'ip', label: 'IP', width: 130 },
  { prop: 'createdAt', label: '操作时间', width: 180, slot: 'createdAt' },
  { label: '操作', width: 90, fixed: 'right', slot: 'actions' },
];

const opSearchItems: SearchItem[] = [
  { prop: 'username', label: '操作人', placeholder: '账号' },
  {
    prop: 'method',
    label: '方法',
    type: 'select',
    options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => ({
      label: method,
      value: method,
    })),
  },
  { prop: 'path', label: '路径', placeholder: '包含关键字' },
  {
    prop: 'timeRange',
    label: '时间',
    type: 'daterange',
    startProp: 'startTime',
    endProp: 'endTime',
  },
];

const loginColumns: ProTableColumn[] = [
  { type: 'selection', label: '', width: 55, fixed: 'left' },
  { type: 'index', label: '序号', width: 70 },
  { prop: 'username', label: '账号', minWidth: 140, slot: 'username' },
  { prop: 'userType', label: '端', width: 90, slot: 'userType' },
  { prop: 'success', label: '结果', width: 90, slot: 'success' },
  { prop: 'message', label: '说明', minWidth: 160, slot: 'message' },
  { prop: 'ip', label: 'IP', width: 140 },
  { prop: 'userAgent', label: 'UA', minWidth: 200, showOverflowTooltip: true, slot: 'userAgent' },
  { prop: 'createdAt', label: '登录时间', width: 180, slot: 'createdAt' },
];

const loginSearchItems: SearchItem[] = [
  { prop: 'username', label: '账号', placeholder: '登录账号' },
  {
    prop: 'userType',
    label: '端',
    type: 'select',
    options: [
      { label: 'Admin', value: 'ADMIN' },
      { label: 'App', value: 'APP' },
    ],
  },
  {
    prop: 'success',
    label: '结果',
    type: 'select',
    options: [
      { label: '成功', value: 'true' },
      { label: '失败', value: 'false' },
    ],
  },
  {
    prop: 'timeRange',
    label: '时间',
    type: 'daterange',
    startProp: 'startTime',
    endProp: 'endTime',
  },
];

function loadOperationLogs(params: Record<string, unknown>) {
  return listOperationLogs(params as OperationLogQuery);
}

function loadLoginLogs(params: Record<string, unknown>) {
  return listLoginLogs(params as LoginLogQuery);
}

async function handleBatchDeleteOperation(selection: OperationLogItem[]): Promise<void> {
  if (selection.length === 0) {
    ElMessage.warning('请先勾选要清理的日志');
    return;
  }
  try {
    await ElMessageBox.confirm(`确定清理选中的 ${selection.length} 条操作日志吗？清理后不可恢复。`, '清理确认', {
      type: 'warning',
      confirmButtonText: '清理',
      confirmButtonClass: 'el-button--danger',
    });
  } catch {
    return;
  }
  try {
    const result = await batchDeleteOperationLogs(selection.map((row) => row.id));
    ElMessage.success(`已清理 ${result.count} 条日志`);
    opTableRef.value?.clearSelection();
    opTableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  }
}

async function handleBatchDeleteLogin(selection: LoginLogItem[]): Promise<void> {
  if (selection.length === 0) {
    ElMessage.warning('请先勾选要清理的日志');
    return;
  }
  try {
    await ElMessageBox.confirm(`确定清理选中的 ${selection.length} 条登录日志吗？清理后不可恢复。`, '清理确认', {
      type: 'warning',
      confirmButtonText: '清理',
      confirmButtonClass: 'el-button--danger',
    });
  } catch {
    return;
  }
  try {
    const result = await batchDeleteLoginLogs(selection.map((row) => row.id));
    ElMessage.success(`已清理 ${result.count} 条日志`);
    loginTableRef.value?.clearSelection();
    loginTableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  }
}

async function handleExportOperation(): Promise<void> {
  exportingOp.value = true;
  try {
    await exportOperationLogs(opTableRef.value?.getSearchParams() ?? {});
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    exportingOp.value = false;
  }
}

async function handleExportLogin(): Promise<void> {
  exportingLogin.value = true;
  try {
    await exportLoginLogs(loginTableRef.value?.getSearchParams() ?? {});
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    exportingLogin.value = false;
  }
}

const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<OperationLogDetail | null>(null);

async function openDetail(row: OperationLogItem): Promise<void> {
  detail.value = null;
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    detail.value = await getOperationLog(row.id);
  } catch {
    detailVisible.value = false;
  } finally {
    detailLoading.value = false;
  }
}

function prettyJson(value: string | null): string {
  if (!value) return '（空）';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

const methodTagType: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'primary'> = {
  GET: 'info',
  POST: 'success',
  PUT: 'warning',
  PATCH: 'warning',
  DELETE: 'danger',
};
</script>

<template>
  <div class="log-page">
    <el-tabs v-model="activeTab" class="log-page__tabs">
      <el-tab-pane label="操作日志" name="operation">
        <ProTable
          ref="opTableRef"
          :columns="opColumns"
          :search-items="opSearchItems"
          :request="loadOperationLogs"
          row-key="id"
        >
          <template #toolbar="{ selection }">
            <el-button
              v-permission="'system:log'"
              type="danger"
              plain
              :disabled="selection.length === 0"
              @click="handleBatchDeleteOperation(selection)"
            >
              批量清理{{ selection.length ? `（${selection.length}）` : '' }}
            </el-button>
            <el-button v-permission="'system:log'" :loading="exportingOp" @click="handleExportOperation">
              导出当前条件
            </el-button>
            <span class="text-muted">只记录写操作；清理动作本身不写回日志表</span>
          </template>

          <template #username="{ row }">{{ row.username || '-' }}</template>
          <template #method="{ row }">
            <el-tag :type="methodTagType[row.method] || 'info'">{{ row.method }}</el-tag>
          </template>
          <template #bizCode="{ row }">
            <el-tag :type="row.bizCode === 0 ? 'success' : 'danger'">{{ row.bizCode ?? '-' }}</el-tag>
          </template>
          <template #createdAt="{ row }">{{ formatDateTime(row.createdAt, true) }}</template>
          <template #actions="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          </template>
        </ProTable>
      </el-tab-pane>

      <el-tab-pane label="登录日志" name="login">
        <ProTable
          ref="loginTableRef"
          :columns="loginColumns"
          :search-items="loginSearchItems"
          :request="loadLoginLogs"
          row-key="id"
        >
          <template #toolbar="{ selection }">
            <el-button
              v-permission="'system:log'"
              type="danger"
              plain
              :disabled="selection.length === 0"
              @click="handleBatchDeleteLogin(selection)"
            >
              批量清理{{ selection.length ? `（${selection.length}）` : '' }}
            </el-button>
            <el-button v-permission="'system:log'" :loading="exportingLogin" @click="handleExportLogin">
              导出当前条件
            </el-button>
          </template>

          <template #username="{ row }">{{ row.username || '-' }}</template>
          <template #userType="{ row }">
            <el-tag :type="row.userType === 'ADMIN' ? 'primary' : 'success'">{{ row.userType }}</el-tag>
          </template>
          <template #success="{ row }">
            <el-tag :type="row.success ? 'success' : 'danger'">{{ row.success ? '成功' : '失败' }}</el-tag>
          </template>
          <template #message="{ row }">{{ row.message || '-' }}</template>
          <template #userAgent="{ row }">{{ row.userAgent || '-' }}</template>
          <template #createdAt="{ row }">{{ formatDateTime(row.createdAt, true) }}</template>
        </ProTable>
      </el-tab-pane>
    </el-tabs>

    <AppDialog v-model="detailVisible" title="日志详情" width="760px">
      <div v-loading="detailLoading" class="log-detail">
        <el-descriptions v-if="detail" :column="2" border>
          <el-descriptions-item label="操作人">{{ detail.username || '-' }}</el-descriptions-item>
          <el-descriptions-item label="操作时间">{{ formatDateTime(detail.createdAt, true) }}</el-descriptions-item>
          <el-descriptions-item label="请求">{{ detail.method }} {{ detail.path }}</el-descriptions-item>
          <el-descriptions-item label="业务码">{{ detail.bizCode ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="耗时">{{ detail.durationMs }} ms</el-descriptions-item>
          <el-descriptions-item label="IP">{{ detail.ip || '-' }}</el-descriptions-item>
          <el-descriptions-item label="UA" :span="2">{{ detail.userAgent || '-' }}</el-descriptions-item>
        </el-descriptions>

        <div class="log-block">
          <div class="log-block__title">查询参数</div>
          <el-scrollbar max-height="220px">
            <pre class="log-json">{{ prettyJson(detail?.query ?? null) }}</pre>
          </el-scrollbar>
        </div>
        <div class="log-block">
          <div class="log-block__title">请求体（已脱敏）</div>
          <el-scrollbar max-height="220px">
            <pre class="log-json">{{ prettyJson(detail?.body ?? null) }}</pre>
          </el-scrollbar>
        </div>
        <div class="log-block">
          <div class="log-block__title">响应内容（已脱敏）</div>
          <el-scrollbar max-height="220px">
            <pre class="log-json">{{ prettyJson(detail?.response ?? null) }}</pre>
          </el-scrollbar>
        </div>
      </div>
    </AppDialog>
  </div>
</template>

<style scoped lang="scss">
.log-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.log-page__tabs {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: 12px 16px 16px;
  background: #fff;
  border-radius: 8px;
}

.log-page__tabs :deep(.el-tabs__header) {
  flex: none;
}

.log-page__tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.log-page__tabs :deep(.el-tab-pane) {
  height: 100%;
}

.log-page__tabs :deep(.pro-table) {
  height: 100%;
  padding: 0;
}

.log-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.log-block__title {
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #606266;
}

.log-json {
  margin: 0;
  padding: 12px;
  font-size: 12px;
  line-height: 1.6;
  color: #303133;
  background: #f5f7fa;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>

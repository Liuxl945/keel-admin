<script setup lang="ts">
defineOptions({ name: 'SystemNotice' });

import { reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import ProTable from '@/components/ProTable/index.vue';
import type { ProTableColumn, SearchItem } from '@/components/ProTable/types';
import AppDialog from '@/components/AppDialog/index.vue';
import DictTag from '@/components/DictTag/index.vue';
import {
  createNotice,
  deleteNotice,
  getNotice,
  listNotices,
  updateNotice,
  updateNoticeStatus,
  type NoticePayload,
  type NoticeQuery,
} from '@/api/notice';
import { formatDateTime } from '@/utils/datetime';
import type { Notice, NoticeStatus, NoticeType } from '@/types/entities';

const tableRef = ref<any>(null);

const columns: ProTableColumn[] = [
  { type: 'index', label: '序号', width: 70 },
  { prop: 'title', label: '标题', minWidth: 220, showOverflowTooltip: true },
  { prop: 'noticeType', label: '类型', width: 100, slot: 'noticeType' },
  { prop: 'status', label: '状态', width: 100, slot: 'status' },
  { prop: 'publisherName', label: '发布人', width: 120, slot: 'publisher' },
  { prop: 'publishedAt', label: '发布时间', width: 170, slot: 'publishedAt' },
  { prop: 'createdAt', label: '创建时间', width: 170, slot: 'createdAt' },
  { label: '操作', width: 220, fixed: 'right', slot: 'actions' },
];

const searchItems: SearchItem[] = [
  { prop: 'title', label: '标题', placeholder: '标题关键字' },
  {
    prop: 'noticeType',
    label: '类型',
    type: 'select',
    options: [
      { label: '通知', value: 'NOTICE' },
      { label: '公告', value: 'ANNOUNCEMENT' },
    ],
  },
  {
    prop: 'status',
    label: '状态',
    type: 'select',
    options: [
      { label: '草稿', value: 'DRAFT' },
      { label: '已发布', value: 'PUBLISHED' },
      { label: '已关闭', value: 'CLOSED' },
    ],
  },
];

function loadData(params: Record<string, unknown>) {
  return listNotices(params as NoticeQuery);
}

const dialogVisible = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const editingId = ref<number | null>(null);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = reactive({
  title: '',
  noticeType: 'NOTICE' as NoticeType,
  content: '',
  status: 'DRAFT' as NoticeStatus,
});

const rules: FormRules = {
  title: [{ required: true, message: '请输入公告标题', trigger: 'blur' }],
  content: [{ required: true, message: '请输入公告内容', trigger: 'blur' }],
};

function resetForm(): void {
  form.title = '';
  form.noticeType = 'NOTICE';
  form.content = '';
  form.status = 'DRAFT';
  formRef.value?.clearValidate();
}

function openCreate(): void {
  dialogMode.value = 'create';
  editingId.value = null;
  resetForm();
  dialogVisible.value = true;
}

function openEdit(row: Notice): void {
  dialogMode.value = 'edit';
  editingId.value = row.id;
  resetForm();
  form.title = row.title;
  form.noticeType = row.noticeType;
  form.content = row.content;
  form.status = row.status;
  dialogVisible.value = true;
}

async function handleSave(): Promise<void> {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  saving.value = true;
  try {
    const payload: NoticePayload = {
      title: form.title.trim(),
      noticeType: form.noticeType,
      content: form.content,
      status: form.status,
    };
    if (dialogMode.value === 'create') {
      await createNotice(payload);
      ElMessage.success('公告已创建');
    } else if (editingId.value) {
      await updateNotice(editingId.value, payload);
      ElMessage.success('公告已更新');
    }
    dialogVisible.value = false;
    tableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    saving.value = false;
  }
}

async function changeStatus(row: Notice, status: NoticeStatus): Promise<void> {
  const actionText = status === 'PUBLISHED' ? '发布' : '关闭';
  try {
    await ElMessageBox.confirm(`确定${actionText}公告「${row.title}」吗？`, `${actionText}确认`, {
      type: 'warning',
      confirmButtonText: actionText,
    });
  } catch {
    return;
  }
  try {
    await updateNoticeStatus(row.id, status);
    ElMessage.success(`公告已${actionText}`);
    tableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  }
}

async function handleDelete(row: Notice): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除公告「${row.title}」吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger',
    });
  } catch {
    return;
  }
  try {
    await deleteNotice(row.id);
    ElMessage.success('公告已删除');
    tableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  }
}

const detailVisible = ref(false);
const detail = ref<Notice | null>(null);

async function openDetail(row: Notice): Promise<void> {
  detailVisible.value = true;
  detail.value = await getNotice(row.id).catch(() => null);
}
</script>

<template>
  <div class="page">
    <ProTable ref="tableRef" :columns="columns" :search-items="searchItems" :request="loadData" row-key="id">
      <template #toolbar>
        <el-button v-permission="'notice:create'" type="primary" @click="openCreate">新增公告</el-button>
      </template>

      <template #noticeType="{ row }"><DictTag type="sys_notice_type" :value="row.noticeType" /></template>
      <template #status="{ row }"><DictTag type="sys_notice_status" :value="row.status" /></template>
      <template #publisher="{ row }">{{ row.publisherName || '-' }}</template>
      <template #publishedAt="{ row }">{{ formatDateTime(row.publishedAt) }}</template>
      <template #createdAt="{ row }">{{ formatDateTime(row.createdAt) }}</template>

      <template #actions="{ row }">
        <el-button link type="primary" @click="openDetail(row)">查看</el-button>
        <el-button v-permission="'notice:update'" link type="primary" @click="openEdit(row)">编辑</el-button>
        <el-button
          v-if="row.status !== 'PUBLISHED'"
          v-permission="'notice:update'"
          link
          type="success"
          @click="changeStatus(row, 'PUBLISHED')"
        >
          发布
        </el-button>
        <el-button
          v-else
          v-permission="'notice:update'"
          link
          type="warning"
          @click="changeStatus(row, 'CLOSED')"
        >
          关闭
        </el-button>
        <el-button v-permission="'notice:delete'" link type="danger" @click="handleDelete(row)">删除</el-button>
      </template>
    </ProTable>

    <AppDialog v-model="dialogVisible" :title="dialogMode === 'create' ? '新增公告' : '编辑公告'" width="680px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="标题" prop="title">
          <el-input v-model="form.title" maxlength="200" />
        </el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="form.noticeType">
            <el-radio value="NOTICE">通知</el-radio>
            <el-radio value="ANNOUNCEMENT">公告</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status" style="width: 200px">
            <el-option label="草稿" value="DRAFT" />
            <el-option label="已发布" value="PUBLISHED" />
            <el-option label="已关闭" value="CLOSED" />
          </el-select>
        </el-form-item>
        <el-form-item label="内容" prop="content">
          <el-input v-model="form.content" type="textarea" :rows="12" maxlength="20000" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </AppDialog>

    <AppDialog v-model="detailVisible" title="公告详情" width="720px">
      <div v-if="detail" class="notice-detail">
        <h3 class="notice-detail__title">{{ detail.title }}</h3>
        <div class="notice-detail__meta">
          <DictTag type="sys_notice_type" :value="detail.noticeType" />
          <DictTag type="sys_notice_status" :value="detail.status" />
          <span>发布人：{{ detail.publisherName || '-' }}</span>
          <span>发布时间：{{ formatDateTime(detail.publishedAt) }}</span>
        </div>
        <div class="notice-detail__content">{{ detail.content }}</div>
      </div>
    </AppDialog>
  </div>
</template>

<style scoped lang="scss">
.notice-detail__title {
  margin: 0 0 12px;
  font-size: 20px;
  color: #1f2d3d;
}

.notice-detail__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 18px;
  font-size: 13px;
  color: #8a94a6;
}

.notice-detail__content {
  font-size: 14px;
  line-height: 1.9;
  color: #303133;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>

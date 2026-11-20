<script setup lang="ts">
defineOptions({ name: 'DevForm' });

import { computed, onActivated, onDeactivated, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import ProTable from '@/components/ProTable/index.vue';
import type { ProTableColumn, SearchItem } from '@/components/ProTable/types';
import AppDialog from '@/components/AppDialog/index.vue';
import DictTag from '@/components/DictTag/index.vue';
import CodeDialog from './components/CodeDialog.vue';
import FormDesigner from './designer.vue';
import {
  createDevForm,
  deleteDevForm,
  generateDevFormMenu,
  listDevForms,
  publishDevForm,
  type DevFormQuery,
} from '@/api/dev-form';
import { listMenus } from '@/api/menu';
import { addDynamicRoutes } from '@/router/dynamic';
import { useUserStore } from '@/stores/user';
import { formatDateTime } from '@/utils/datetime';
import type { DevFormSummary } from '@/types/dev';
import type { MenuNode } from '@/types/entities';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const tableRef = ref<any>(null);

const columns: ProTableColumn[] = [
  { type: 'index', label: '序号', width: 70 },
  { prop: 'name', label: '表单名称', minWidth: 160 },
  { prop: 'formKey', label: '表单编码', minWidth: 170 },
  { prop: 'tableName', label: '关联数据表', minWidth: 140, slot: 'tableName' },
  { prop: 'menuPath', label: '菜单路径', minWidth: 170, slot: 'menuPath' },
  { prop: 'status', label: '状态', width: 100, slot: 'status' },
  { prop: 'version', label: '版本', width: 90, slot: 'version' },
  { prop: 'updatedBy', label: '最后操作人', width: 120, slot: 'updatedBy' },
  { prop: 'updatedAt', label: '更新时间', width: 170, slot: 'updatedAt' },
  { label: '操作', width: 380, fixed: 'right', slot: 'actions' },
];

const searchItems: SearchItem[] = [
  { prop: 'keyword', label: '关键字', placeholder: '表单名称 / 编码' },
  {
    prop: 'status',
    label: '状态',
    type: 'select',
    options: [
      { label: '草稿', value: 'DRAFT' },
      { label: '已发布', value: 'PUBLISHED' },
    ],
  },
];

function loadData(params: Record<string, unknown>) {
  return listDevForms(params as DevFormQuery);
}

const createVisible = ref(false);
const createSaving = ref(false);
const createFormRef = ref<FormInstance>();
const createForm = reactive({ name: '', formKey: '', description: '' });

const createRules: FormRules = {
  name: [{ required: true, message: '请输入表单名称', trigger: 'blur' }],
  formKey: [
    { required: true, message: '请输入表单编码', trigger: 'blur' },
    {
      pattern: /^[a-z][a-z0-9_]{2,49}$/,
      message: '小写字母开头，仅含小写字母、数字、下划线',
      trigger: 'blur',
    },
  ],
};

function openCreate(): void {
  createForm.name = '';
  createForm.formKey = '';
  createForm.description = '';
  createFormRef.value?.clearValidate();
  createVisible.value = true;
}

async function handleCreate(): Promise<void> {
  if (!createFormRef.value) return;
  const valid = await createFormRef.value.validate().catch(() => false);
  if (!valid) return;

  createSaving.value = true;
  try {
    const detail = await createDevForm({
      name: createForm.name.trim(),
      formKey: createForm.formKey.trim(),
      description: createForm.description || null,
    });
    createVisible.value = false;
    ElMessage.success('表单已创建，进入设计器');
    openDesigner(detail.id);
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    createSaving.value = false;
  }
}

const designerId = ref<number | null>(null);
// 页面切走时只隐藏弹窗，保留组件状态；切回来再恢复显示
const pageActive = ref(true);

function openDesigner(id: number): void {
  designerId.value = id;
  pageActive.value = true;
  void router.replace({ path: '/dev/form', query: { designId: String(id) } });
}

function handleDesignerClosed(): void {
  designerId.value = null;
  void router.replace({ path: '/dev/form' });
  tableRef.value?.reload();
}

function openPreview(row: DevFormSummary): void {
  void router.push(`/dev/form/preview/${row.id}`);
}

const codeVisible = ref(false);
const codeFormId = ref<number | null>(null);
const codeFormName = ref('');

function openCode(row: DevFormSummary): void {
  codeFormId.value = row.id;
  codeFormName.value = row.name;
  codeVisible.value = true;
}

async function handlePublish(row: DevFormSummary): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `发布「${row.name}」后将生成前后端代码，后续修改会自动回到草稿状态。`,
      '发布确认',
      { type: 'warning', confirmButtonText: '发布' },
    );
  } catch {
    return;
  }
  try {
    await publishDevForm(row.id);
    ElMessage.success('表单已发布');
    tableRef.value?.reload();
    // openCode(row);
  } catch {
    // 错误提示由 request 拦截器统一处理
  }
}

/* ---------------- 生成业务菜单 ---------------- */

const menuVisible = ref(false);
const menuSaving = ref(false);
const menuTarget = ref<DevFormSummary | null>(null);
const menuParentId = ref<number | null>(null);
const dirOptions = ref<MenuNode[]>([]);
const dirLoading = ref(false);
const treeSelectProps = { label: 'name', children: 'children' };

/** 上级只能是目录，页面/按钮/表单菜单都不能作为父级 */
function pickDirs(nodes: MenuNode[]): MenuNode[] {
  return nodes
    .filter((node) => node.type === 'DIR')
    .map((node) => ({ ...node, children: pickDirs(node.children) }));
}

const menuPreview = computed(() => {
  const form = menuTarget.value;
  if (!form) return null;
  const prefix = `biz_${form.formKey}`;
  return {
    path: `/biz/${form.formKey}`,
    component: 'biz/runtime/index',
    perms: [
      { label: '查询', perm: `${prefix}:list`, target: '页面菜单' },
      { label: '新增', perm: `${prefix}:create`, target: '按钮' },
      { label: '编辑', perm: `${prefix}:update`, target: '按钮' },
      { label: '删除', perm: `${prefix}:delete`, target: '按钮' },
    ],
  };
});

async function openMenuDialog(row: DevFormSummary): Promise<void> {
  menuTarget.value = row;
  menuParentId.value = null;
  menuVisible.value = true;
  dirLoading.value = true;
  try {
    dirOptions.value = pickDirs(await listMenus());
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    dirLoading.value = false;
  }
}

async function handleGenerateMenu(): Promise<void> {
  if (!menuTarget.value) return;
  menuSaving.value = true;
  try {
    const result = await generateDevFormMenu(menuTarget.value.id, menuParentId.value);
    menuVisible.value = false;
    ElMessage.success(`菜单已生成：${result.path}`);
    tableRef.value?.reload();
    // 立即刷新侧边栏与动态路由，不用重新登录就能点进去
    await userStore.fetchProfile();
    addDynamicRoutes(router, userStore.menus);
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    menuSaving.value = false;
  }
}

function openMenuPage(path: string | null | undefined): void {
  if (!path) return;
  void router.push(path);
}

onMounted(() => {
  const queryId = Number(route.query.designId);
  if (Number.isInteger(queryId) && queryId > 0) {
    designerId.value = queryId;
  }
});

onActivated(() => {
  pageActive.value = true;
  tableRef.value?.reload();

  const queryId = Number(route.query.designId);
  if (!designerId.value && Number.isInteger(queryId) && queryId > 0) {
    designerId.value = queryId;
  }
  // 弹窗还开着时把 URL 补回 designId，刷新后也能恢复
  if (designerId.value && String(route.query.designId ?? '') !== String(designerId.value)) {
    void router.replace({ path: '/dev/form', query: { designId: String(designerId.value) } });
  }
});

// 页面失活时隐藏弹窗，但不销毁 designerId，保留缓存页和未保存编辑状态
onDeactivated(() => {
  pageActive.value = false;
});

async function handleDelete(row: DevFormSummary): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除表单「${row.name}」吗？已生成的代码文件不会被删除。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger',
    });
  } catch {
    return;
  }
  try {
    await deleteDevForm(row.id);
    ElMessage.success('表单已删除');
    tableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  }
}

</script>

<template>
  <div class="page">
    <ProTable ref="tableRef" :columns="columns" :search-items="searchItems" :request="loadData" row-key="id">
      <template #toolbar>
        <el-button v-permission="'dev_form:create'" type="primary" @click="openCreate">新增表单</el-button>
        <span class="text-muted">拖拽设计表单，发布后生成前端页面 + 后端 CRUD 代码</span>
      </template>

      <template #tableName="{ row }">
        <span v-if="row.tableName">{{ row.tableName }}</span>
        <span v-else class="text-muted">未关联</span>
      </template>
      <template #menuPath="{ row }">
        <el-link
          v-if="row.menuPath"
          type="primary"
          :underline="false"
          @click="openMenuPage(row.menuPath)"
        >
          {{ row.menuPath }}
        </el-link>
        <span v-else class="text-muted">未生成</span>
      </template>
      <template #status="{ row }"><DictTag type="dev_form_status" :value="row.status" /></template>
      <template #version="{ row }">v{{ row.version }}</template>
      <template #updatedBy="{ row }">{{ row.updatedBy || '-' }}</template>
      <template #updatedAt="{ row }">{{ formatDateTime(row.updatedAt) }}</template>

      <template #actions="{ row }">
        <el-button v-permission="'dev_form:update'" link type="primary" @click="openDesigner(row.id)">设计</el-button>
        <el-button link type="primary" @click="openPreview(row)">预览</el-button>
        <el-button link type="primary" @click="openCode(row)">代码</el-button>
        <el-button
          v-if="row.status === 'DRAFT'"
          v-permission="'dev_form:publish'"
          link
          type="success"
          @click="handlePublish(row)"
        >
          发布
        </el-button>
        <el-button
          v-if="row.status === 'PUBLISHED' && !row.menuId"
          v-permission="'dev_form:publish'"
          link
          type="warning"
          @click="openMenuDialog(row)"
        >
          生成菜单
        </el-button>
        <el-button v-permission="'dev_form:delete'" link type="danger" @click="handleDelete(row)">删除</el-button>
      </template>
    </ProTable>

    <AppDialog v-model="createVisible" title="新增表单" width="560px">
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="90px">
        <el-form-item label="表单名称" prop="name">
          <el-input v-model="createForm.name" maxlength="100" placeholder="如 客户反馈" />
        </el-form-item>
        <el-form-item label="表单编码" prop="formKey">
          <el-input v-model="createForm.formKey" maxlength="50" placeholder="如 customer_feedback" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="createForm.description" type="textarea" :rows="3" maxlength="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="createSaving" @click="handleCreate">创建并设计</el-button>
      </template>
    </AppDialog>

    <CodeDialog v-model="codeVisible" :form-id="codeFormId" :form-name="codeFormName" />

    <AppDialog v-model="menuVisible" title="生成业务菜单" width="640px">
      <el-form label-width="90px">
        <el-form-item label="表单">
          <div class="menu-gen__form">
            <span>{{ menuTarget?.name }}</span>
            <span class="text-muted">{{ menuTarget?.formKey }}</span>
          </div>
        </el-form-item>
        <el-form-item label="上级菜单">
          <el-tree-select
            v-model="menuParentId"
            :data="dirOptions"
            :props="treeSelectProps"
            node-key="id"
            clearable
            check-strictly
            :render-after-expand="false"
            :loading="dirLoading"
            placeholder="留空表示顶级菜单，只能选择目录"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="页面路径">
          <el-input :model-value="menuPreview?.path" readonly />
        </el-form-item>
        <!-- <el-form-item label="组件">
          <el-input :model-value="menuPreview?.component" readonly />
        </el-form-item> -->
        <el-form-item label="权限标识">
          <div class="menu-gen__perms">
            <div v-for="item in menuPreview?.perms ?? []" :key="item.perm" class="menu-gen__perm">
              <el-tag size="small" :type="item.target === '页面菜单' ? 'warning' : 'info'">
                {{ item.target }}
              </el-tag>
              <span class="menu-gen__perm-label">{{ item.label }}</span>
              <code class="menu-gen__code">{{ item.perm }}</code>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <p class="menu-gen__tip">
        生成后侧边栏立即出现该菜单。权限点需在「角色管理 - 菜单权限」授予角色后，非超管账号才能看到。
      </p>
      <template #footer>
        <el-button @click="menuVisible = false">取消</el-button>
        <el-button type="primary" :loading="menuSaving" @click="handleGenerateMenu">生成</el-button>
      </template>
    </AppDialog>

    <FormDesigner
      v-if="designerId"
      :key="designerId"
      :form-id="designerId"
      :visible="pageActive"
      @close="handleDesignerClosed"
    />
  </div>
</template>

<style scoped lang="scss">
.menu-gen__form {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.menu-gen__perms {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.menu-gen__perm {
  display: flex;
  gap: 8px;
  align-items: center;
}

.menu-gen__perm-label {
  width: 32px;
  color: var(--el-text-color-regular);
}

.menu-gen__code {
  padding: 1px 6px;
  font-family: var(--el-font-family-mono, monospace);
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border-radius: 4px;
}

.menu-gen__tip {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}
</style>

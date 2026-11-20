<script setup lang="ts">
defineOptions({ name: 'SystemMenu' });

import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import AppDialog from '@/components/AppDialog/index.vue';
import { useFillHeight } from '@/composables/useFillHeight';
import { createMenu, deleteMenu, listMenus, updateMenu, type MenuPayload } from '@/api/menu';
import { listDevForms } from '@/api/dev-form';
import router from '@/router';
import { addDynamicRoutes } from '@/router/dynamic';
import { useUserStore } from '@/stores/user';
import { formatDateTime } from '@/utils/datetime';
import type { AccountStatus, MenuNode, MenuType } from '@/types/entities';
import type { DevFormSummary } from '@/types/dev';

/** 表单菜单统一指向运行时页面，与后端 FORM_MENU_COMPONENT 保持一致 */
const FORM_MENU_COMPONENT = 'biz/runtime/index';

const userStore = useUserStore();
const loading = ref(false);
const menuTree = ref<MenuNode[]>([]);
const { containerRef: tableContainerRef, height: tableHeight } = useFillHeight(260);

/** 默认可见层级：2 表示「顶级 + 第二层」，更深层级需手动展开 */
const DEFAULT_VISIBLE_LEVELS = 2;

/** 按钮是权限点，不是导航，默认不展示，避免权限项盖住菜单结构 */
const showButtons = ref(false);

/**
 * 树形展开由 expand-row-keys 受控，el-table 只认数组引用变化，所以整体替换。
 * 内部按对象键比较，key 必须是字符串，传 number 会全部失效。
 */
const expandKeys = ref<string[]>([]);

function withoutButtons(nodes: MenuNode[]): MenuNode[] {
  return nodes
    .filter((node) => showButtons.value || node.type !== 'BUTTON')
    .map((node) => ({ ...node, children: withoutButtons(node.children ?? []) }));
}

const visibleTree = computed<MenuNode[]>(() => withoutButtons(menuTree.value));

/** 只收集层级小于 visibleLevels 的节点，传入 Infinity 即全部展开 */
function collectExpandKeys(nodes: MenuNode[], visibleLevels: number, level = 1): string[] {
  const keys: string[] = [];
  for (const node of nodes) {
    const children = node.children ?? [];
    if (children.length === 0) continue;
    if (level < visibleLevels) keys.push(String(node.id));
    keys.push(...collectExpandKeys(children, visibleLevels, level + 1));
  }
  return keys;
}

function setExpandLevels(visibleLevels: number): void {
  expandKeys.value = collectExpandKeys(visibleTree.value, visibleLevels);
}

function collapseAll(): void {
  expandKeys.value = [];
}

async function loadData(): Promise<void> {
  loading.value = true;
  try {
    menuTree.value = await listMenus();
    setExpandLevels(DEFAULT_VISIBLE_LEVELS);
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    loading.value = false;
  }
}

const typeLabels: Record<MenuType, string> = {
  DIR: '目录',
  MENU: '页面',
  BUTTON: '按钮',
  FORM: '表单',
};
const typeTags: Record<MenuType, 'primary' | 'success' | 'info' | 'warning'> = {
  DIR: 'primary',
  MENU: 'success',
  BUTTON: 'info',
  FORM: 'warning',
};

const formVisible = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const editingId = ref<number | null>(null);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = reactive({
  parentId: null as number | null,
  name: '',
  type: 'MENU' as MenuType,
  path: '',
  component: '',
  perm: '',
  icon: '',
  sort: 0,
  visible: true,
  status: 'ENABLED' as AccountStatus,
  formId: null as number | null,
});

/** 表单菜单只能绑定已发布的在线表单 */
const publishedForms = ref<DevFormSummary[]>([]);
const formsLoading = ref(false);
const formsLoaded = ref(false);

async function loadPublishedForms(): Promise<void> {
  if (formsLoaded.value || formsLoading.value) return;
  formsLoading.value = true;
  try {
    const page = await listDevForms({ page: 1, pageSize: 200, status: 'PUBLISHED' });
    publishedForms.value = page.list;
    formsLoaded.value = true;
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    formsLoading.value = false;
  }
}

/** 已被其它菜单占用的表单，避免重复绑定导致路由冲突 */
const boundFormIds = computed<Set<number>>(() => {
  const ids = new Set<number>();
  const walk = (nodes: MenuNode[]): void => {
    for (const node of nodes) {
      if (node.type === 'FORM' && node.formId && node.id !== editingId.value) ids.add(node.formId);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(menuTree.value);
  return ids;
});

/** 选中表单后带出名称/路径/组件/权限，路径与组件不允许手填 */
function handleFormChange(formId: number | null): void {
  const target = publishedForms.value.find((item) => item.id === formId);
  if (!target) {
    form.path = '';
    form.component = '';
    return;
  }
  if (!form.name.trim()) form.name = target.name;
  if (!form.icon.trim()) form.icon = 'Document';
  if (!form.perm.trim()) form.perm = `biz_${target.formKey}:list`;
  form.path = `/biz/${target.formKey}`;
  form.component = FORM_MENU_COMPONENT;
}

const parentOptions = computed(() => buildParentOptions(menuTree.value, editingId.value));

function buildParentOptions(nodes: MenuNode[], excludeId: number | null): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  for (const node of nodes) {
    if (node.type === 'BUTTON' || node.id === excludeId) continue;
    result.push({
      id: node.id,
      name: node.name,
      children: buildParentOptions(node.children, excludeId),
    });
  }
  return result;
}

const rules = computed<FormRules>(() => ({
  name: [{ required: true, message: '请输入菜单名称', trigger: 'blur' }],
  formId:
    form.type === 'FORM'
      ? [{ required: true, message: '请选择要绑定的在线表单', trigger: 'change' }]
      : [],
  path: form.type === 'MENU' ? [{ required: true, message: '请输入路由路径', trigger: 'blur' }] : [],
  component:
    form.type === 'MENU' ? [{ required: true, message: '请输入组件路径', trigger: 'blur' }] : [],
  perm:
    form.type === 'BUTTON'
      ? [
          { required: true, message: '请输入权限标识', trigger: 'blur' },
          {
            pattern: /^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/,
            message: '格式为 模块:动作（仅一个冒号），如 user:list、dev_form:list',
            trigger: 'blur',
          },
        ]
      : [],
}));

const treeSelectProps = { label: 'name', children: 'children' };

/**
 * 只在用户主动切换类型时清理字段，不能用 watch：
 * 编辑回填时也会改 form.type，watch 会把刚填好的路径/表单 id 清掉。
 */
function handleTypeChange(value: string | number | boolean): void {
  const type = value as MenuType;
  form.formId = null;
  form.path = '';
  form.component = '';
  if (type === 'FORM') void loadPublishedForms();
  void nextTick(() => formRef.value?.clearValidate(['path', 'component', 'formId']));
}

function resetForm(): void {
  form.parentId = null;
  form.name = '';
  form.type = 'MENU';
  form.path = '';
  form.component = '';
  form.perm = '';
  form.icon = '';
  form.sort = 0;
  form.visible = true;
  form.status = 'ENABLED';
  form.formId = null;
  formRef.value?.clearValidate();
}

function openCreate(parent?: MenuNode): void {
  formMode.value = 'create';
  editingId.value = null;
  resetForm();
  if (parent) {
    form.parentId = parent.id;
    form.type = parent.type === 'DIR' ? 'MENU' : parent.type === 'BUTTON' ? 'MENU' : 'BUTTON';
  } else {
    form.type = 'DIR';
  }
  // 页面下新增的默认是按钮权限，此时若不显示按钮，保存后会「消失」
  if (form.type === 'BUTTON') showButtons.value = true;
  formVisible.value = true;
}

function openEdit(row: MenuNode): void {
  formMode.value = 'edit';
  editingId.value = row.id;
  resetForm();
  form.parentId = row.parentId;
  form.name = row.name;
  form.type = row.type;
  form.path = row.path || '';
  form.component = row.component || '';
  form.perm = row.perm || '';
  form.icon = row.icon || '';
  form.sort = row.sort;
  form.visible = row.visible;
  form.status = row.status;
  form.formId = row.formId ?? null;
  if (row.type === 'FORM') void loadPublishedForms();
  formVisible.value = true;
}

async function refreshSidebar(): Promise<void> {
  try {
    await userStore.fetchProfile();
    addDynamicRoutes(router, userStore.menus);
  } catch {
    // 侧边栏刷新失败不影响菜单保存结果，重新登录后仍会生效
  }
}

async function handleSave(): Promise<void> {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  const payload: MenuPayload = {
    parentId: form.parentId ?? null,
    name: form.name.trim(),
    type: form.type,
    // 表单菜单的路径/组件由后端按绑定的表单推导，这里不再传
    path: form.type === 'BUTTON' || form.type === 'FORM' ? null : form.path.trim() || null,
    component: form.type === 'MENU' ? form.component.trim() || null : null,
    perm: form.perm.trim() || null,
    icon: form.icon.trim() || null,
    sort: form.sort,
    visible: form.visible,
    status: form.status,
    formId: form.type === 'FORM' ? form.formId : null,
  };

  saving.value = true;
  try {
    if (formMode.value === 'create') {
      await createMenu(payload);
      ElMessage.success('菜单已创建');
    } else if (editingId.value) {
      await updateMenu(editingId.value, payload);
      ElMessage.success('菜单已更新');
    }
    formVisible.value = false;
    await loadData();
    await refreshSidebar();
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    saving.value = false;
  }
}

async function handleDelete(row: MenuNode): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除「${row.name}」吗？删除后关联角色会同步失去该权限。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger',
    });
  } catch {
    return;
  }
  try {
    await deleteMenu(row.id);
    ElMessage.success('菜单已删除');
    await loadData();
    await refreshSidebar();
  } catch {
    // 错误提示由 request 拦截器统一处理
  }
}

onMounted(loadData);
</script>

<template>
  <div class="page">
    <div class="panel">
      <div class="panel__toolbar">
        <el-button v-permission="'menu:create'" type="primary" @click="openCreate()">新增顶级菜单</el-button>
        <el-button @click="loadData">刷新</el-button>
        <div class="panel__toolbar-right">
          <el-button link type="primary" @click="setExpandLevels(Number.POSITIVE_INFINITY)">展开全部</el-button>
          <el-button link type="primary" @click="collapseAll">收起全部</el-button>
          <el-switch v-model="showButtons" active-text="显示按钮权限" />
        </div>
      </div>

      <div ref="tableContainerRef" class="panel__table">
        <el-table
          v-loading="loading"
          :data="visibleTree"
          row-key="id"
          :height="tableHeight"
          border
          :expand-row-keys="expandKeys"
          :tree-props="{ children: 'children' }"
        >
        <el-table-column label="菜单名称" min-width="220">
          <template #default="{ row }">
            <el-icon v-if="row.icon" class="menu-icon"><component :is="row.icon" /></el-icon>
            <span>{{ row.name }}</span>
            <el-tag v-if="!row.visible" size="small" type="info" class="menu-tag">隐藏</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="90">
          <template #default="{ row }">
            <el-tag :type="typeTags[row.type as MenuType]">{{ typeLabels[row.type as MenuType] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="path" label="路由路径" min-width="160" />
        <el-table-column label="组件 / 表单" min-width="180">
          <template #default="{ row }">
            <span v-if="row.type === 'FORM'">{{ row.formName || `表单 #${row.formId}` }}</span>
            <span v-else>{{ row.component || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="perm" label="权限标识" min-width="160" />
        <el-table-column prop="sort" label="排序" width="80" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'ENABLED' ? 'success' : 'info'">
              {{ row.status === 'ENABLED' ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
          <el-table-column label="操作" width="210" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="row.type !== 'BUTTON'"
                v-permission="'menu:create'"
                link
                type="primary"
                @click="openCreate(row)"
              >
                新增子级
              </el-button>
              <el-button v-permission="'menu:update'" link type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button v-permission="'menu:delete'" link type="danger" @click="handleDelete(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <AppDialog v-model="formVisible" :title="formMode === 'create' ? '新增菜单' : '编辑菜单'" width="620px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="父级菜单">
          <el-tree-select
            v-model="form.parentId"
            :data="parentOptions"
            :props="treeSelectProps"
            node-key="id"
            clearable
            check-strictly
            :render-after-expand="false"
            placeholder="留空表示顶级菜单"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="form.type" @change="handleTypeChange">
            <el-radio value="DIR">目录</el-radio>
            <el-radio value="MENU">页面</el-radio>
            <el-radio value="FORM">表单</el-radio>
            <el-radio value="BUTTON">按钮</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" maxlength="50" />
        </el-form-item>
        <el-form-item v-if="form.type === 'FORM'" label="在线表单" prop="formId">
          <div class="form-picker">
            <el-select
              v-model="form.formId"
              filterable
              clearable
              :loading="formsLoading"
              placeholder="选择已发布的在线表单"
              style="width: 100%"
              @change="handleFormChange"
            >
              <el-option
                v-for="item in publishedForms"
                :key="item.id"
                :label="`${item.name}（${item.formKey}）`"
                :value="item.id"
                :disabled="boundFormIds.has(item.id)"
              >
                <span>{{ item.name }}</span>
                <span class="form-picker__meta">
                  {{ item.formKey }}{{ boundFormIds.has(item.id) ? ' · 已绑定' : '' }}
                </span>
              </el-option>
            </el-select>
            <p v-if="!formsLoading && publishedForms.length === 0" class="form-picker__tip">
              还没有已发布的表单，请先到「在线开发 - 表单设计」发布
            </p>
            <p v-else class="form-picker__tip">
              保存后菜单自动指向该表单的列表页，包含查询与增删改查，无需再配组件路径
            </p>
          </div>
        </el-form-item>
        <el-form-item v-if="form.type === 'MENU' || form.type === 'FORM'" label="路由路径" prop="path">
          <el-input
            v-if="form.type === 'FORM'"
            :model-value="form.path"
            readonly
            placeholder="选择表单后自动生成"
          />
          <el-input v-else v-model="form.path" maxlength="200" placeholder="如 /system/user" />
        </el-form-item>
        <el-form-item v-if="form.type === 'MENU'" label="组件路径" prop="component">
          <el-input v-model="form.component" maxlength="200" placeholder="如 system/user/index（不含 .vue）" />
        </el-form-item>
        <el-form-item label="权限标识" prop="perm">
          <el-input v-model="form.perm" maxlength="100" placeholder="如 user:list、biz_ddlb:create" />
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="form.icon" maxlength="50" placeholder="Element Plus 图标名，如 User" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="侧边显示">
          <el-switch v-model="form.visible" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio value="ENABLED">启用</el-radio>
            <el-radio value="DISABLED">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </AppDialog>
  </div>
</template>

<style scoped lang="scss">
.panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: 16px;
  background: #fff;
  border-radius: 8px;
}

.panel__toolbar {
  display: flex;
  flex: none;
  gap: 8px;
  margin-bottom: 12px;
}

.panel__toolbar-right {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-left: auto;
}

.panel__toolbar-right :deep(.el-button + .el-button) {
  margin-left: 0;
}

.panel__table {
  flex: 1;
  min-height: 0;
}

.menu-icon {
  margin-right: 6px;
  vertical-align: -2px;
}

.menu-tag {
  margin-left: 8px;
}

.form-picker {
  width: 100%;
}

.form-picker__meta {
  float: right;
  margin-left: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.form-picker__tip {
  margin: 4px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}
</style>

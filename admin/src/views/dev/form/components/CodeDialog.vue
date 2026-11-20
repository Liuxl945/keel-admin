<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import AppDialog from '@/components/AppDialog/index.vue';
import {
  downloadDevFormCode,
  ensureDevFormMenu,
  getDevFormCode,
} from '@/api/dev-form';
import { listMenus } from '@/api/menu';
import { addDynamicRoutes } from '@/router/dynamic';
import { useUserStore } from '@/stores/user';
import type { MenuNode } from '@/types/entities';
import type { DevFormCodeFile, DevFormCodeMenuState } from '@/types/dev';

interface CodeResult {
  formKey: string;
  version: number;
  files: DevFormCodeFile[];
  /** 数据建模走 loader 时没有菜单概念 */
  menu?: DevFormCodeMenuState;
}

const props = defineProps<{
  modelValue: boolean;
  /** 表单设计器使用 formId；数据建模通过 loader 传入 */
  formId?: number | null;
  formName?: string;
  loader?: () => Promise<CodeResult>;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const router = useRouter();
const userStore = useUserStore();

const loading = ref(false);
const downloading = ref(false);
const files = ref<DevFormCodeFile[]>([]);
const activeTab = ref('');
const formKey = ref('');
const version = ref(1);

const menuState = ref<DevFormCodeMenuState | null>(null);
/** 未生成菜单时，下载是否顺带生成（默认勾选） */
const withMenu = ref(true);
const menuParentId = ref<number | null>(null);
const dirOptions = ref<MenuNode[]>([]);
const dirLoading = ref(false);

const activeFile = computed(() => files.value.find((file) => file.name === activeTab.value) ?? files.value[0]);

const showMenuBlock = computed(() => Boolean(menuState.value));
const needCreateMenu = computed(() => Boolean(menuState.value && !menuState.value.exists));
/** 生成菜单复用「发布表单 / 菜单管理」权限，无权限时只能下载代码 */
const canCreateMenu = computed(
  () => userStore.hasPermission('dev_form:publish') || userStore.hasPermission('menu:create'),
);

/** 生成代码的落点：server 在 src/biz，admin 在 src/views/biz */
const targetDirs = computed(() => {
  if (!formKey.value) return [] as string[];
  const seen = new Set<string>();
  files.value.forEach((file) => {
    const dir = file.name.split('/').slice(0, -1).join('/');
    if (dir) seen.add(dir);
  });
  return [...seen];
});

function fileName(file: DevFormCodeFile): string {
  return file.name.split('/').pop() ?? file.name;
}

/** 上级只能是目录，页面/按钮都不能作为父级 */
function pickDirs(nodes: MenuNode[]): MenuNode[] {
  return nodes
    .filter((node) => node.type === 'DIR')
    .map((node) => ({ ...node, children: pickDirs(node.children ?? []) }));
}

async function loadDirs(): Promise<void> {
  dirLoading.value = true;
  try {
    dirOptions.value = pickDirs(await listMenus());
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    dirLoading.value = false;
  }
}

async function load(): Promise<void> {
  if (!props.loader && !props.formId) return;
  loading.value = true;
  files.value = [];
  menuState.value = null;
  menuParentId.value = null;
  try {
    const result = props.loader
      ? await props.loader()
      : await getDevFormCode(props.formId as number);
    files.value = result.files;
    formKey.value = result.formKey;
    version.value = result.version;
    activeTab.value = result.files[0]?.name ?? '';
    menuState.value = result.menu ?? null;
    if (menuState.value) {
      withMenu.value = !menuState.value.exists;
      if (!menuState.value.exists) void loadDirs();
    }
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.modelValue, props.formId] as const,
  ([visible]) => {
    if (visible) void load();
  },
);

async function copyCurrent(): Promise<void> {
  if (!activeFile.value) return;
  try {
    await navigator.clipboard.writeText(activeFile.value.content);
    ElMessage.success('已复制当前文件');
  } catch {
    ElMessage.warning('复制失败，请手动选择内容');
  }
}

/** 无 formId 的临时场景（loader）退化成 markdown，正常入口都走服务端 zip */
function downloadAsMarkdown(): void {
  const languageMap: Record<string, string> = { ts: 'ts', vue: 'vue', sql: 'sql', markdown: 'md' };
  const markdown = files.value
    .map((file) => `## ${file.name}\n\n\`\`\`${languageMap[file.language] ?? ''}\n${file.content}\n\`\`\``)
    .join('\n\n');
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${formKey.value || 'generated'}-code.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** 菜单建好后立刻刷新侧边栏与动态路由，不用重新登录就能点进去 */
async function refreshSidebar(): Promise<void> {
  try {
    await userStore.fetchProfile();
    addDynamicRoutes(router, userStore.menus);
  } catch {
    // 刷新失败不影响下载，用户刷新页面即可
  }
}

async function createMenuIfNeeded(): Promise<{ created: boolean; skipped: string }> {
  if (!props.formId || !needCreateMenu.value || !withMenu.value || !canCreateMenu.value) {
    return { created: false, skipped: '' };
  }
  try {
    const result = await ensureDevFormMenu(props.formId, menuParentId.value);
    menuState.value = {
      exists: true,
      menuId: result.menuId,
      name: result.name,
      path: result.path,
      component: result.component,
      componentMismatch: false,
      currentComponent: result.component,
      currentPath: result.path,
      perm: result.perm,
      parentId: result.parentId,
    };
    await refreshSidebar();
    return { created: result.created, skipped: result.hint ?? '' };
  } catch {
    // 权限不足或路由已被占用：不挡住代码下载，只提示稍后单独生成
    return { created: false, skipped: '菜单未生成，可稍后在表单列表里单独生成菜单' };
  }
}

async function downloadAll(): Promise<void> {
  if (files.value.length === 0) return;
  if (!props.formId) {
    downloadAsMarkdown();
    return;
  }

  downloading.value = true;
  try {
    const menu = await createMenuIfNeeded();
    await downloadDevFormCode(props.formId);
    ElMessage.success(menu.created ? '菜单已生成，代码包开始下载' : '代码包已开始下载，解压到项目根目录即可');
    if (menu.skipped) ElMessage.warning(menu.skipped);
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    downloading.value = false;
  }
}
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    :title="`生成代码${formName ? ` - ${formName}` : ''}`"
    width="600px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-loading="loading" class="code-dialog">
      <div v-if="files.length > 0" class="code-dialog__meta">
        <div class="code-dialog__meta-line">
          共 {{ files.length }} 个文件 · 版本 v{{ version }} · 点击「下载代码」获取 zip，解压到项目根目录即可
        </div>
        <div v-for="dir in targetDirs" :key="dir" class="code-dialog__meta-dir">{{ dir }}/</div>
      </div>

      <div v-if="showMenuBlock && menuState" class="code-dialog__menu">
        <div class="code-dialog__menu-head">
          <span class="code-dialog__menu-title">业务菜单</span>
          <el-tag :type="menuState.exists ? 'success' : 'info'" size="small" effect="light">
            {{ menuState.exists ? '已生成' : '未生成' }}
          </el-tag>
        </div>
        <div class="code-dialog__menu-line">
          路径 <code>{{ menuState.path }}</code> · 组件 <code>{{ menuState.component }}</code> · 页面权限
          <code>{{ menuState.perm }}</code>
        </div>

        <div v-if="menuState.componentMismatch" class="code-dialog__menu-warn">
          当前菜单指向 <code>{{ menuState.currentComponent }}</code>，与生成页不一致；需要独立页面请在
          「菜单管理」里把组件改为 <code>{{ menuState.component }}</code>。
        </div>

        <div v-if="needCreateMenu && !canCreateMenu" class="code-dialog__menu-warn">
          暂无「发布表单 / 菜单管理」权限，本次仅下载代码；菜单可由有权限的同事生成，或执行包内
          <code>menu.sql</code>。
        </div>

        <div v-if="needCreateMenu && canCreateMenu" class="code-dialog__menu-form">
          <el-checkbox v-model="withMenu">下载时同时生成菜单与权限点</el-checkbox>
          <el-tree-select
            v-model="menuParentId"
            :data="dirOptions"
            :props="{ label: 'name', children: 'children' }"
            node-key="id"
            clearable
            check-strictly
            :render-after-expand="false"
            :loading="dirLoading"
            :disabled="!withMenu"
            placeholder="上级目录（默认顶级）"
            style="width: 240px"
          />
        </div>
      </div>

      <!-- <el-tabs v-if="files.length > 0" v-model="activeTab" class="code-tabs">
        <el-tab-pane v-for="file in files" :key="file.name" :name="file.name" :label="fileName(file)">
          <div class="code-dialog__path">{{ file.name }}</div>
          <el-scrollbar max-height="52vh">
            <pre class="code-pre"><code>{{ file.content }}</code></pre>
          </el-scrollbar>
        </el-tab-pane>
      </el-tabs>

      <el-empty v-else-if="!loading" description="暂未生成代码" /> -->
    </div>

    <template #footer>
      <!-- <el-button :disabled="!activeFile" @click="copyCurrent">复制当前文件</el-button> -->
      <el-button type="primary" :loading="downloading" :disabled="files.length === 0" @click="downloadAll">
        {{ needCreateMenu && withMenu && canCreateMenu ? '生成菜单并下载' : '下载代码' }}
      </el-button>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </AppDialog>
</template>

<style scoped lang="scss">
.code-dialog {
  min-height: 220px;
}

.code-dialog__meta {
  padding: 8px 12px;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border-radius: 6px;
}

.code-dialog__meta-line {
  line-height: 1.7;
}

.code-dialog__meta-dir {
  font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
  line-height: 1.7;
  color: var(--el-color-primary);
}

.code-dialog__menu {
  padding: 10px 12px;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.code-dialog__menu-head {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}

.code-dialog__menu-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.code-dialog__menu-line {
  line-height: 1.9;

  code {
    font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
    color: var(--el-color-primary);
  }
}

.code-dialog__menu-warn {
  padding: 6px 10px;
  margin-top: 6px;
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
  border-radius: 4px;

  code {
    font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
  }
}

.code-dialog__menu-form {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-top: 10px;
}

.code-dialog__path {
  padding: 0 2px 8px;
  font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.code-tabs :deep(.el-tabs__header) {
  margin-bottom: 10px;
}

.code-pre {
  padding: 14px 16px;
  margin: 0;
  overflow: auto;
  font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-primary);
  white-space: pre;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
}
</style>

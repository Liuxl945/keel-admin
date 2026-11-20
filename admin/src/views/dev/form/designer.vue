<script setup lang="ts">
defineOptions({ name: 'DevFormDesign' });

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import BasicDialog from '@/components/BasicDialog/index.vue';
import DictTag from '@/components/DictTag/index.vue';
import CodeDialog from './components/CodeDialog.vue';
import DesignerBasicStep from './components/DesignerBasicStep.vue';
import DesignerCanvas from './components/DesignerCanvas.vue';
import DesignerListStep from './components/DesignerListStep.vue';
import DesignerPalette from './components/DesignerPalette.vue';
import DesignerPropsPanel from './components/DesignerPropsPanel.vue';
import { provideDesigner, useDesignerStore } from './designer/store';

const props = withDefaults(defineProps<{ formId: number; visible?: boolean }>(), { visible: true });
const emit = defineEmits<{ close: [] }>();
const formId = computed(() => props.formId);

// 设计器状态按领域拆在 designer/ 目录，这里只做装配并注入给子组件
const store = provideDesigner(useDesignerStore({ formId, onClose: () => emit('close') }));
const {
  formName,
  formKey,
  status,
  version,
  step,
  stepItems,
  nextStep,
  handlePublish,
  publishing,
  saveForm,
  saving,
  goBack,
  loading,
  showPreviewButton,
  fields,
  openFormPreview,
  load,
  loadPickerSources,
  handleGlobalDragEnd,
} = store;

/** 代码预览弹窗：发布后可按需打开，当前入口隐藏 */
const codeVisible = ref(false);

onMounted(() => {
  document.addEventListener('dragend', handleGlobalDragEnd);
  document.addEventListener('drop', handleGlobalDragEnd);
  void loadPickerSources();
  void load();
});

onBeforeUnmount(() => {
  document.removeEventListener('dragend', handleGlobalDragEnd);
  document.removeEventListener('drop', handleGlobalDragEnd);
});
</script>

<template>
  <BasicDialog
    :model-value="visible"
    fullscreen
    :mask="false"
    :show-close="false"
    :show-back="false"
    :animated="false"
    :append-to-body="false"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    aria-label="表单设计器"
    @back="goBack"
  >
    <template #title>
      <span class="designer__name">{{ formName || '未命名表单' }}</span>
      <el-tag type="info" effect="plain">{{ formKey }}</el-tag>
      <DictTag type="dev_form_status" :value="status" />
      <el-tag type="info" effect="plain" size="small">v{{ version }}</el-tag>
    </template>

    <template #center>
      <div class="designer__stepper">
        <template v-for="(item, index) in stepItems" :key="item.value">
          <span
            class="designer__step"
            :class="{ 'is-active': step === item.value, 'is-done': step > item.value }"
          >
            <span class="designer__step-index">
              <el-icon v-if="step > item.value"><Check /></el-icon>
              <template v-else>{{ item.value }}</template>
            </span>
            <span class="designer__step-label">{{ item.label }}</span>
          </span>
          <span
            v-if="index < stepItems.length - 1"
            class="designer__step-line"
            :class="{ 'is-done': step > item.value }"
          />
        </template>
      </div>
    </template>

    <template #actions>
      <el-button-group class="designer__step-nav">
        <el-button :disabled="step === 1" @click="step -= 1">上一步</el-button>
        <el-button v-if="step < 3" type="primary" @click="nextStep">下一步</el-button>
        <el-button
          v-else
          v-permission="'dev_form:publish'"
          type="primary"
          :loading="publishing"
          @click="handlePublish"
        >
          发布
        </el-button>
      </el-button-group>
      <el-button
        v-if="showPreviewButton"
        :disabled="fields.length === 0"
        @click="openFormPreview"
      >
        预览页面
      </el-button>
      <el-button
        v-permission="'dev_form:update'"
        type="primary"
        :loading="saving"
        @click="saveForm(true)"
      >
        保存
      </el-button>
      <el-button @click="goBack">关闭</el-button>
    </template>

    <div v-loading="loading" class="designer">
      <div class="designer__content">
        <!-- 步骤 1：基础设计 -->
        <DesignerBasicStep v-if="step === 1" />

        <!-- 步骤 2：表单设计 -->
        <div v-else-if="step === 2" class="designer__body">
          <DesignerPalette />

          <DesignerCanvas />

          <DesignerPropsPanel />
        </div>

        <!-- 步骤 3：列表设计 -->
        <DesignerListStep v-else />
      </div>

      <CodeDialog v-model="codeVisible" :form-id="formId" :form-name="formName" />
    </div>
  </BasicDialog>
</template>

<style scoped lang="scss">
/* 设计器外壳：标题、步骤条、内容容器；各步骤/面板的样式跟各自组件走 */
.designer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--el-bg-color);
  border-radius: 8px;
}

.designer__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

/* 上一步 / 下一步 合成一个整体，避免底部按钮过于零散 */
.designer__step-nav {
  flex: none;
}

.designer__stepper {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.designer__step {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  padding: 3px 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  border-radius: 999px;
}

.designer__step.is-active {
  font-weight: 600;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.designer__step.is-done {
  color: var(--el-color-success);
}

.designer__step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  border: 1px solid currentColor;
  border-radius: 50%;
}

.designer__step.is-active .designer__step-index {
  color: #fff;
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
}

.designer__step.is-done .designer__step-index {
  color: #fff;
  background: var(--el-color-success);
  border-color: var(--el-color-success);
}

.designer__step-line {
  width: 14px;
  height: 1px;
  background: var(--el-border-color);
}

.designer__step-line.is-done {
  background: var(--el-color-success);
}

.designer__content {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* 第 2 步：左控件库 / 中画布 / 右属性面板 */
.designer__body {
  display: flex;
  flex: 1;
  min-height: 0;
}
</style>

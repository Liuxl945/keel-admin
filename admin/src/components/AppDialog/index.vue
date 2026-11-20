<script setup lang="ts">
import { getCurrentInstance, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, useAttrs, useId, watch } from 'vue';
import { mainContentBox } from '@/utils/app-main-padding';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title?: string;
    width?: string | number;
    /** dialog=居中弹窗（默认）；drawer=侧边抽屉 */
    variant?: 'dialog' | 'drawer';
    /** 抽屉滑出方向，仅 variant=drawer 生效 */
    direction?: 'rtl' | 'ltr' | 'ttb' | 'btt';
    /** 全屏弹窗：只覆盖主内容区 el-main.layout__main，保留侧边栏/顶栏/页签 */
    fullscreen?: boolean;
    /** 全屏顶部操作栏文案与状态，非全屏时忽略 */
    backText?: string;
    cancelText?: string;
    confirmText?: string;
    confirmLoading?: boolean;
    showConfirm?: boolean;
  }>(),
  {
    title: '',
    width: '560px',
    variant: 'dialog',
    direction: 'rtl',
    fullscreen: false,
    backText: '返回',
    cancelText: '取消',
    confirmText: '确认',
    confirmLoading: false,
    showConfirm: true,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  closed: [];
  back: [];
  cancel: [];
  confirm: [];
}>();

const attrs = useAttrs();
const instance = getCurrentInstance();
/**
 * 遮罩类名必须每实例唯一：页面按需加载可能把本组件打进多个 chunk，
 * 模块级自增种子会各自从 1 开始撞名，querySelector 定位到别的实例的隐藏遮罩，
 * 导致弹窗宽度不被计算（从设计器页跳转到预览页时必现）。
 */
const overlayClass = `app-dialog-overlay-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
const modalClass = () =>
  [
    'app-dialog-overlay',
    props.fullscreen ? 'app-dialog-overlay--fullscreen' : '',
    attrs.modalClass ?? attrs['modal-class'],
    overlayClass,
  ]
    .filter(Boolean)
    .join(' ');

const bodyHeight = () => (props.fullscreen ? '100%' : undefined);
const bodyMaxHeight = () => (props.fullscreen ? undefined : '68vh');

/** 没有监听 back/cancel 时按普通取消处理，直接关闭弹窗 */
function closeIfUnhandled(event: 'onBack' | 'onCancel'): void {
  if (!instance?.vnode.props?.[event]) emit('update:modelValue', false);
}

function handleBack(): void {
  emit('back');
  closeIfUnhandled('onBack');
}

function handleCancel(): void {
  emit('cancel');
  closeIfUnhandled('onCancel');
}

function handleConfirm(): void {
  emit('confirm');
}

let overlayEl: HTMLElement | null = null;
let targetEl: HTMLElement | null = null;
let observer: ResizeObserver | null = null;

function resolveTarget(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.layout__main');
}

function updateOverlayRect(): void {
  if (!props.fullscreen) return;
  if (!overlayEl) overlayEl = document.querySelector<HTMLElement>(`.${overlayClass}`);
  if (!overlayEl) return;

  targetEl = targetEl ?? resolveTarget();
  // 主内容区还没渲染时不要回落到整个视口，否则首次打开会短暂铺满全屏
  if (!targetEl) return;
  // 内边距来自 CSS 变量 --app-main-padding，弹窗落在内容区里，不贴 layout__main 的边
  const box = mainContentBox(targetEl);
  Object.assign(overlayEl.style, {
    top: `${box.top}px`,
    left: `${box.left}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    right: 'auto',
    bottom: 'auto',
  });
}

function detachOverlay(): void {
  observer?.disconnect();
  observer = null;
  window.removeEventListener('resize', updateOverlayRect);
}

/** 立即隐藏本实例的遮罩（不经过 el-dialog 的关闭动画），供 keep-alive 失活时防闪烁 */
function hideOverlayInstantly(): void {
  const overlay = overlayEl ?? document.querySelector<HTMLElement>(`.${overlayClass}`);
  if (overlay) overlay.style.display = 'none';
}

function bindOverlay(): void {
  // 只解绑监听，不清空已有定位样式：首次打开时遮罩先按主内容区定位，
  // 再绑定监听，避免出现一帧「整屏遮罩」的闪跳。
  detachOverlay();
  let attempts = 0;
  const apply = (): void => {
    if (!props.fullscreen || !props.modelValue) return;
    overlayEl = document.querySelector<HTMLElement>(`.${overlayClass}`);
    // teleport 的遮罩偶尔晚一拍才进 DOM，同样重试而不是放弃定位
    if (!overlayEl) {
      if (attempts++ < 10) requestAnimationFrame(apply);
      return;
    }

    targetEl = resolveTarget();
    if (!targetEl) {
      // 路由/布局切换时主内容区可能晚一拍出现，重试几帧，不退回整个视口
      if (attempts++ < 10) requestAnimationFrame(apply);
      return;
    }
    updateOverlayRect();
    observer = new ResizeObserver(updateOverlayRect);
    observer.observe(targetEl);
    window.addEventListener('resize', updateOverlayRect);
  };
  void nextTick(apply);
}

function unbindOverlay(): void {
  detachOverlay();
  if (overlayEl) {
    overlayEl.style.top = '';
    overlayEl.style.left = '';
    overlayEl.style.width = '';
    overlayEl.style.height = '';
    overlayEl.style.right = '';
    overlayEl.style.bottom = '';
  }
  overlayEl = null;
  targetEl = null;
}

watch(
  () => props.modelValue,
  (open) => {
    if (open && props.fullscreen) bindOverlay();
    // 关闭时不在这里清空遮罩定位：el-dialog 的关闭动画还在进行，
    // 立即清空会让遮罩从主内容区矩形跳回全屏默认定位，弹窗跟着“闪一下”。
    // 统一由 @closed（动画结束后）调用 unbindOverlay 清理。
  },
);

watch(
  () => props.fullscreen,
  () => {
    // 只处理开关切换：打开时重新定位；关闭时的清理统一交给 @closed，
    // 避免在关闭动画期间清空遮罩样式导致闪一下。
    if (props.modelValue) bindOverlay();
  },
);

onMounted(() => {
  if (props.modelValue && props.fullscreen) bindOverlay();
});

onDeactivated(() => {
  // keep-alive 页面切走时，teleport 到 body 的弹窗不会自动隐藏，会残留到其他页面。
  // 直接关闭会触发 el-dialog 的淡出动画，动画在新页面上「闪一下」——
  // 所以先同步把遮罩 display:none（立即消失、无动画帧），再关闭状态并清理定位。
  hideOverlayInstantly();
  if (props.modelValue) emit('update:modelValue', false);
  unbindOverlay();
});

onActivated(() => {
  // 页签切回时若页面状态里弹窗仍是打开的（如跳转前刚打开），重新按当前布局定位
  if (props.modelValue && props.fullscreen) bindOverlay();
});

onBeforeUnmount(unbindOverlay);
</script>

<template>
  <el-drawer
    v-if="props.variant === 'drawer'"
    v-bind="attrs"
    class="app-dialog app-drawer"
    :model-value="modelValue"
    :title="title"
    :size="width"
    :direction="direction"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
    @closed="emit('closed')"
  >
    <el-scrollbar max-height="68vh">
      <div class="app-dialog__body">
        <slot />
      </div>
    </el-scrollbar>
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </el-drawer>

  <el-dialog
    v-else
    v-bind="attrs"
    class="app-dialog"
    :class="{ 'app-dialog--fullscreen': props.fullscreen }"
    :modal-class="modalClass()"
    :model-value="modelValue"
    :title="title"
    :width="width"
    :fullscreen="false"
    :show-close="props.fullscreen ? false : true"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
    @opened="bindOverlay"
    @closed="
      () => {
        unbindOverlay();
        emit('closed');
      }
    "
  >
    <template v-if="props.fullscreen" #header>
      <div class="app-dialog__topbar">
        <el-button
          link
          class="app-dialog__back"
          :title="backText"
          :aria-label="backText"
          @click="handleBack"
        >
          <el-icon><Back /></el-icon>
        </el-button>
        <span class="app-dialog__title"><slot name="title">{{ title }}</slot></span>
        <span class="app-dialog__spacer" />
        <span class="app-dialog__top-actions">
          <el-button @click="handleCancel">{{ cancelText }}</el-button>
          <el-button
            v-if="showConfirm"
            type="primary"
            :loading="confirmLoading"
            @click="handleConfirm"
          >
            {{ confirmText }}
          </el-button>
        </span>
      </div>
    </template>
    <el-scrollbar :height="bodyHeight()" :max-height="bodyMaxHeight()">
      <div class="app-dialog__body">
        <slot />
      </div>
    </el-scrollbar>
    <template v-if="$slots.footer && !props.fullscreen" #footer>
      <slot name="footer" />
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.app-dialog__body {
  padding-right: 8px;
}

.app-dialog__topbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  width: 100%;
  min-height: 32px;
}

.app-dialog__back {
  flex: none;
  width: 28px;
  height: 28px;
  margin: 0;
  padding: 0;
}

.app-dialog__title {
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.app-dialog__spacer {
  flex: 1;
}

.app-dialog__top-actions {
  display: flex;
  flex: none;
  gap: 8px;
  align-items: center;
}
</style>

<style lang="scss">
.app-dialog-overlay--fullscreen .el-overlay-dialog {
  position: absolute;
  inset: 0;
}

.app-dialog-overlay--fullscreen {
  background: transparent;
}

.app-dialog.app-dialog--fullscreen {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0 !important;
  overflow: hidden;
  border-radius: 0;
}

.app-dialog.app-dialog--fullscreen .el-dialog__header {
  padding: 8px 16px;
  margin-right: 0;
}

.app-dialog.app-dialog--fullscreen .el-dialog__body {
  flex: 1;
  min-height: 0;
  padding: 0 16px;
  overflow: hidden;
}

.app-dialog.app-dialog--fullscreen .el-dialog__footer {
  padding: 0 16px 12px;
}
</style>

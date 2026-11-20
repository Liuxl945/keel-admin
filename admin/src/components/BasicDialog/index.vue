<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onDeactivated, onMounted, useAttrs, useId, watch } from 'vue';
import { mainContentBox } from '@/utils/app-main-padding';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    title?: string;
    width?: string | number;
    /** 全屏模式：覆盖布局内容区，保留侧边栏/顶栏/页签 */
    fullscreen?: boolean;
    target?: string;
    mask?: boolean;
    maskColor?: string;
    showBack?: boolean;
    backText?: string;
    showClose?: boolean;
    /** 是否启用 el-dialog 进出场动画；页面切换需要“永久无闪”时可关闭 */
    animated?: boolean;
    /** 内容型弹窗默认留在页面 DOM 内，随页面切换一起隐藏，避免 teleport 到 body 后残留 */
    appendToBody?: boolean;
  }>(),
  {
    title: '',
    width: '560px',
    fullscreen: false,
    target: '.layout__main',
    mask: true,
    maskColor: 'rgba(15, 23, 42, 0.42)',
    showBack: true,
    backText: '返回',
    showClose: true,
    animated: true,
    appendToBody: false,
  },
);

const visible = defineModel<boolean>({ required: true });
const emit = defineEmits<{ back: []; closed: [] }>();
const attrs = useAttrs();
const instance = getCurrentInstance();
/** 遮罩类名每实例唯一：懒加载可能把组件打进多个 chunk，模块级种子会撞名（详见 AppDialog 注释） */
const overlayClass = `basic-dialog-overlay-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;

const restAttrs = computed(() => {
  const {
    class: _class,
    modalClass: _modalClass,
    transition: _transition,
    appendToBody: _appendToBody,
    ...rest
  } = attrs;
  return rest;
});
const dialogTransition = computed(() => (props.animated ? attrs.transition : ''));
const dialogClass = computed(() => [
  'basic-dialog',
  props.fullscreen ? 'basic-dialog--fullscreen' : '',
  attrs.class,
]);
const modalClass = computed(() =>
  ['basic-dialog-overlay', attrs.modalClass, overlayClass].filter(Boolean).join(' '),
);

let overlayEl: HTMLElement | null = null;
let targetEl: HTMLElement | null = null;
let observer: ResizeObserver | null = null;

function resolveTarget(): HTMLElement | null {
  return document.querySelector<HTMLElement>(props.target);
}

function updateOverlayRect(): void {
  if (!props.fullscreen) return;
  if (!overlayEl) overlayEl = document.querySelector<HTMLElement>(`.${overlayClass}`);
  if (!overlayEl) return;

  targetEl = targetEl ?? resolveTarget();
  // 主内容区未就绪时不要回落到整个视口，否则首次打开会短暂铺满全屏
  if (!targetEl) return;
  // 按 CSS 变量 --app-main-padding 内缩，与 AppDialog 全屏弹窗同一套规则
  const box = mainContentBox(targetEl);
  Object.assign(overlayEl.style, {
    top: `${box.top}px`,
    left: `${box.left}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    right: 'auto',
    bottom: 'auto',
    background: props.mask ? props.maskColor : 'transparent',
  });
}

function detachOverlay(): void {
  observer?.disconnect();
  observer = null;
  window.removeEventListener('resize', updateOverlayRect);
}

function bindOverlay(): void {
  // 只解绑监听，不清空定位：重新绑定时不会先跳回整屏再计算
  detachOverlay();
  let attempts = 0;
  const apply = (): void => {
    if (!visible.value) return;
    overlayEl = document.querySelector<HTMLElement>(`.${overlayClass}`);
    // teleport 的遮罩偶尔晚一拍才进 DOM，同样重试而不是放弃定位
    if (!overlayEl) {
      if (attempts++ < 10) requestAnimationFrame(apply);
      return;
    }

    if (!props.fullscreen) {
      overlayEl.style.background = props.mask ? props.maskColor : 'transparent';
      return;
    }

    targetEl = resolveTarget();
    if (!targetEl) {
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
    overlayEl.style.background = '';
  }
  overlayEl = null;
  targetEl = null;
}

function handleBack(): void {
  emit('back');
  // 没有监听 back 时按普通弹窗处理，直接关闭
  if (!instance?.vnode.props?.onBack) visible.value = false;
}

function handleClosed(): void {
  unbindOverlay();
  emit('closed');
}

watch(visible, (open) => {
  // 打开时重新定位；关闭时不在动画期间清空样式，避免弹窗跳回默认位置闪一下，
  // 统一由 @closed（动画结束后）的 handleClosed 清理。
  if (open) bindOverlay();
});

watch(
  () => [props.fullscreen, props.mask, props.maskColor],
  () => {
    if (visible.value) bindOverlay();
  },
);

onMounted(() => {
  if (visible.value) bindOverlay();
});

onBeforeUnmount(unbindOverlay);

// 页面被 keep-alive 缓存时，弹窗需要跟随页面失活关闭，避免盖住后续页面
onDeactivated(() => {
  if (visible.value) {
    visible.value = false;
    // 失活时 el-dialog 的 closed 动画可能不走，主动清理定位监听
    unbindOverlay();
  }
});
</script>

<template>
  <el-dialog
    v-bind="restAttrs"
    :model-value="visible"
    :class="dialogClass"
    :modal-class="modalClass"
    :title="title"
    :width="width"
    :fullscreen="fullscreen"
    :show-close="showClose"
    :transition="dialogTransition"
    :append-to-body="appendToBody"
    @update:model-value="visible = $event"
    @opened="bindOverlay"
    @closed="handleClosed"
  >
    <template #header>
      <slot name="header">
        <div class="basic-dialog__header" :class="{ 'has-close': showClose }">
          <slot name="back">
            <el-button v-if="showBack" link class="basic-dialog__back" @click="handleBack">
              <el-icon><Back /></el-icon>
              {{ backText }}
            </el-button>
          </slot>
          <div class="basic-dialog__heading">
            <slot name="title">{{ title }}</slot>
          </div>
          <div class="basic-dialog__center">
            <slot name="center" />
          </div>
          <div class="basic-dialog__spacer" />
          <div class="basic-dialog__actions">
            <slot name="actions" />
          </div>
        </div>
      </slot>
    </template>

    <slot />

    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </el-dialog>
</template>

<style lang="scss">
.basic-dialog .el-dialog__header {
  padding: 0;
  margin-right: 0;
}

.basic-dialog__header {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.basic-dialog__header.has-close {
  padding-right: 42px;
}

.basic-dialog__back {
  flex: none;
}

.basic-dialog__heading {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  min-width: 0;
  color: var(--el-text-color-primary);
}

.basic-dialog__spacer {
  flex: 1;
}

.basic-dialog__center {
  position: absolute;
  left: 50%;
  display: flex;
  align-items: center;
  max-width: 48%;
  transform: translateX(-50%);
}

.basic-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.el-overlay.basic-dialog-overlay .el-overlay-dialog {
  position: absolute;
  inset: 0;
}

.el-dialog.basic-dialog--fullscreen {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
  overflow: hidden;
  border-radius: 0;
}

.el-dialog.basic-dialog--fullscreen .el-dialog__body {
  flex: 1;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}

.el-dialog.basic-dialog--fullscreen .el-dialog__footer {
  padding: 0;
}
</style>

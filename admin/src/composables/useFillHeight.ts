import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

/**
 * 让 el-table 跟随容器高度：Element Plus 的 height 需要数字，
 * 这里用 ResizeObserver 量出容器实际高度，表格内部滚动、分页固定底部。
 */
export function useFillHeight(minHeight = 240) {
  const containerRef = ref<HTMLElement>();
  const height = ref(minHeight);
  let observer: ResizeObserver | null = null;

  function measure(): void {
    const element = containerRef.value;
    if (!element) return;
    const next = element.clientHeight;
    if (next > 0) height.value = Math.max(minHeight, next);
  }

  function bindContainer(): void {
    observer?.disconnect();
    observer = null;
    const element = containerRef.value;
    if (!element) return;

    measure();
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(element);
    }
  }

  // 容器可能在弹窗首次打开后才渲染（el-dialog 的 rendered 是懒加载的），
  // 只靠 onMounted 量一次会永远是最小高度；ref 出现后再绑定观察器。
  watch(
    containerRef,
    () => {
      void nextTick(bindContainer);
    },
    { immediate: true, flush: 'post' },
  );

  onMounted(() => {
    measure();
    window.addEventListener('resize', measure);
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
    window.removeEventListener('resize', measure);
  });

  return { containerRef, height, measure };
}

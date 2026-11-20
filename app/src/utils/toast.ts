import { reactive } from 'vue';

export type ToastType = 'success' | 'error' | 'info' | 'loading';

interface ToastState {
  visible: boolean;
  type: ToastType;
  message: string;
  duration: number;
}

/** 模块级单例，由 <app-toast /> 渲染，页面不再直接调用 uni.showToast */
export const toastState = reactive<ToastState>({
  visible: false,
  type: 'info',
  message: '',
  duration: 2500,
});

let timer: ReturnType<typeof setTimeout> | null = null;

function show(type: ToastType, message: string, duration: number): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  toastState.visible = true;
  toastState.type = type;
  toastState.message = message;
  toastState.duration = duration;

  if (duration > 0) {
    timer = setTimeout(() => {
      toastState.visible = false;
      timer = null;
    }, duration);
  }
}

export const toast = {
  success(message: string, duration = 2500): void {
    show('success', message, Math.max(duration, 2500));
  },
  error(message: string, duration = 2500): void {
    show('error', message, Math.max(duration, 2500));
  },
  info(message: string, duration = 2500): void {
    show('info', message, duration);
  },
  loading(message: string): void {
    show('loading', message, 0);
  },
  hide(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    toastState.visible = false;
  },
};

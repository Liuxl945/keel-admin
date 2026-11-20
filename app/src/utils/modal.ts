import { reactive } from 'vue';

export interface ModalResult {
  confirm: boolean;
  cancel: boolean;
}

export interface ConfirmOptions {
  tone?: 'default' | 'danger';
  confirmText?: string;
  cancelText?: string;
}

interface ModalState {
  visible: boolean;
  title: string;
  content: string;
  showCancel: boolean;
  confirmText: string;
  cancelText: string;
  tone: 'default' | 'danger';
}

/** 模块级单例，由 <app-modal /> 渲染，页面不再直接调用 uni.showModal */
export const modalState = reactive<ModalState>({
  visible: false,
  title: '提示',
  content: '',
  showCancel: false,
  confirmText: '确定',
  cancelText: '取消',
  tone: 'default',
});

let resolver: ((result: ModalResult) => void) | null = null;

function open(content: string, title: string, showCancel: boolean, options: ConfirmOptions = {}): Promise<ModalResult> {
  modalState.visible = true;
  modalState.title = title;
  modalState.content = content;
  modalState.showCancel = showCancel;
  modalState.confirmText = options.confirmText ?? '确定';
  modalState.cancelText = options.cancelText ?? '取消';
  modalState.tone = options.tone ?? 'default';

  return new Promise((resolve) => {
    resolver = resolve;
  });
}

export function resolveModal(confirm: boolean): void {
  modalState.visible = false;
  const resolve = resolver;
  resolver = null;
  resolve?.(confirm ? { confirm: true, cancel: false } : { confirm: false, cancel: true });
}

export const showModal = {
  alert(content: string, title = '提示'): Promise<ModalResult> {
    return open(content, title, false);
  },
  confirm(content: string, title = '提示', options: ConfirmOptions = {}): Promise<ModalResult> {
    return open(content, title, true, options);
  },
};

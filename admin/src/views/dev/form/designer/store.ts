/**
 * 表单设计器的状态装配层。
 *
 * 各领域模型按依赖顺序创建（基础设计 → 选中态 → 画布排版 → 列表设计 →
 * 控件 → 子表 → 拖拽 → 保存），这里只做接线与对外暴露，
 * 子组件通过 `useDesigner()` 注入后直接拿到同一份状态。
 */
import { inject, provide, ref, type InjectionKey, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import type { DevFormField } from '@/types/dev';
import { spanModelOf, type SubTableDraft } from './model';
import { useBasicStep } from './useBasicStep';
import { useCanvasDnd, useCanvasOrder } from './useCanvas';
import { useFieldModel } from './useFieldModel';
import { useListModel } from './useListModel';
import { useSchemaIO } from './useSchemaIO';
import { useSelection } from './useSelection';
import { useSubtableModel } from './useSubtableModel';

export function useDesignerStore(options: { formId: Ref<number>; onClose: () => void }) {
  const router = useRouter();

  /* ---------------- 共享状态 ---------------- */
  const fields = ref<DevFormField[]>([]) as Ref<DevFormField[]>;
  const subtables = ref<SubTableDraft[]>([]) as Ref<SubTableDraft[]>;
  const loading = ref(true);
  const dirty = ref(false);

  function markDirty(): void {
    if (!loading.value) dirty.value = true;
  }

  /* ---------------- 领域模型 ---------------- */
  // resetDesign / pruneSubtables 需要引用后创建的模型，用惰性回调打断循环依赖
  let io: ReturnType<typeof useSchemaIO> | null = null;
  let subs: ReturnType<typeof useSubtableModel> | null = null;
  let fieldModel: ReturnType<typeof useFieldModel> | null = null;

  const basic = useBasicStep({
    formId: options.formId,
    markDirty,
    resetDesign: (mode) => io?.resetDesign(mode),
    pruneSubtables: () => subs?.pruneSubtables(),
    hasFields: () => fields.value.length > 0,
    regenerateFields: () => fieldModel?.generateFieldsFromTable(),
  });

  const selection = useSelection({ fields, subtables });

  const canvas = useCanvasOrder({ fields, subtables, markDirty });

  const list = useListModel({
    fields,
    subtables,
    businessColumns: basic.businessColumns,
    markDirty,
  });

  fieldModel = useFieldModel({
    fields,
    businessColumns: basic.businessColumns,
    selection,
    list,
    canvas,
    markDirty,
  });
  const field = fieldModel;

  subs = useSubtableModel({
    subtables,
    fields,
    basic,
    canvas,
    selection,
    markDirty,
  });
  const subtable = subs;

  const dnd = useCanvasDnd({
    canvasItems: canvas.canvasItems,
    addControl: field.addControl,
    moveCanvasItem: canvas.moveCanvasItem,
    addSubtableBlock: subtable.addSubtableBlock,
    addSubColumnFromControl: subtable.addSubColumnFromControl,
    markDirty,
  });

  io = useSchemaIO({
    formId: options.formId,
    fields,
    subtables,
    basic,
    selection,
    field,
    list,
    canvas,
    subtable,
    router,
    onClose: options.onClose,
    flags: { loading, dirty, markDirty },
  });

  /** 主表控件的栅格（/24） */
  const fieldSpanModel = spanModelOf(() => selection.selectedField.value);

  return {
    ...basic,
    ...selection,
    ...canvas,
    ...dnd,
    ...list,
    ...field,
    ...subtable,
    ...io,
    fields,
    subtables,
    loading,
    dirty,
    markDirty,
    fieldSpanModel,
  };
}

export type DesignerStore = ReturnType<typeof useDesignerStore> & {
  loading: Ref<boolean>;
  dirty: Ref<boolean>;
};

export const DESIGNER_KEY: InjectionKey<DesignerStore> = Symbol('dev-form-designer');

/** 在设计师内部（画布 / 属性面板 / 各步骤）获取共享状态 */
export function useDesigner(): DesignerStore {
  const store = inject(DESIGNER_KEY);
  if (!store) throw new Error('useDesigner() 必须在表单设计器内部使用');
  return store;
}

/** designer.vue 调用一次：创建状态并注入给子组件 */
export function provideDesigner(store: DesignerStore): DesignerStore {
  provide(DESIGNER_KEY, store);
  return store;
}

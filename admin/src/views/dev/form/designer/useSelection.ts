/**
 * 设计器的选中态：主表控件 / 子表区块 / 明细列的互斥选中，
 * 以及右侧属性面板的 tab 联动、二维码联动字段选项。
 */
import { computed, ref, watch, type Ref } from 'vue';
import type { DevFormField } from '@/types/dev';
import type { PropsTab, SubTableColumnDraft, SubTableDraft } from './model';

export function useSelection(options: {
  fields: Ref<DevFormField[]>;
  subtables: Ref<SubTableDraft[]>;
}) {
  const { fields, subtables } = options;

  const selectedId = ref<string | null>(null);
  const selectedSubtableId = ref<string | null>(null);
  /** 明细列的选中态：子表 id + 列 id（列可以在不同子表间重名，不能只存列 id） */
  const selectedSubColumnRef = ref<{ subtableId: string; columnId: string } | null>(null);
  const propsTab = ref<PropsTab>('field');

  const selectedField = computed(
    () => fields.value.find((field) => field.id === selectedId.value) ?? null,
  );
  const selectedSubtable = computed(
    () => subtables.value.find((item) => item.id === selectedSubtableId.value) ?? null,
  );
  const selectedSubColumnSubtable = computed(() => {
    const ref_ = selectedSubColumnRef.value;
    if (!ref_) return null;
    return subtables.value.find((item) => item.id === ref_.subtableId) ?? null;
  });
  const selectedSubColumn = computed(() => {
    const sub = selectedSubColumnSubtable.value;
    if (!sub || !selectedSubColumnRef.value) return null;
    return sub.columns.find((column) => column.id === selectedSubColumnRef.value?.columnId) ?? null;
  });

  /** 二维码/条码联动时可选的本表单字段（明细列只关联同一子表内的列） */
  const codeFieldOptions = computed<Array<{ name: string; label: string }>>(() => {
    const source = selectedSubColumn.value ? (selectedSubColumnSubtable.value?.columns ?? []) : fields.value;
    const currentId = selectedSubColumn.value?.id ?? selectedId.value;
    return source
      .filter((item) => item.name && item.id !== currentId)
      .map((item) => ({ name: item.name, label: item.label || item.name }));
  });

  /** 主表画布联动来源标题：只映射主表字段，避免与子表同名字段混淆 */
  const codeFieldLabels = computed<Record<string, string>>(() => {
    const labels: Record<string, string> = {};
    for (const field of fields.value) {
      if (field.name) labels[field.name] = field.label || field.name;
    }
    return labels;
  });

  function selectField(id: string): void {
    selectedId.value = id;
    selectedSubtableId.value = null;
    selectedSubColumnRef.value = null;
    propsTab.value = 'field';
  }

  function selectSubtable(subtable: SubTableDraft): void {
    selectedSubtableId.value = subtable.id;
    selectedSubColumnRef.value = null;
    selectedId.value = null;
    propsTab.value = 'subtable';
  }

  function selectSubColumn(subtable: SubTableDraft, column: SubTableColumnDraft): void {
    selectedSubColumnRef.value = { subtableId: subtable.id, columnId: column.id };
    selectedSubtableId.value = null;
    selectedId.value = null;
    propsTab.value = 'field';
  }

  /** 字段名随列绑定变化时，同步修正所有二维码/条码的联动引用 */
  function renameCodeFieldRefs(previous: string, next: string): void {
    if (!previous || previous === next) return;
    const all = [...fields.value, ...subtables.value.flatMap((sub) => sub.columns)];
    for (const item of all) {
      if (!item.codeFields?.length) continue;
      item.codeFields = item.codeFields.map((name) => (name === previous ? next : name));
    }
  }

  /** 字段被删除后，清掉其它控件的联动引用 */
  function removeCodeFieldRefs(name: string): void {
    if (!name) return;
    const all = [...fields.value, ...subtables.value.flatMap((sub) => sub.columns)];
    for (const item of all) {
      if (!item.codeFields?.length) continue;
      item.codeFields = item.codeFields.filter((itemName) => itemName !== name);
    }
  }

  /**
   * 右侧属性面板 tab：控件（主表字段 / 明细列）与子表组件都用
   * 「组件属性 / 组件样式」，表单属性始终可切。
   */
  const propsTabs = computed<Array<{ name: PropsTab; label: string }>>(() => {
    const tabs: Array<{ name: PropsTab; label: string }> = [];
    if (selectedField.value || selectedSubColumn.value) {
      tabs.push({ name: 'field', label: '组件属性' }, { name: 'style', label: '组件样式' });
    }
    if (selectedSubtable.value) {
      tabs.push({ name: 'subtable', label: '组件属性' }, { name: 'substyle', label: '组件样式' });
    }
    tabs.push({ name: 'form', label: '表单属性' });
    return tabs;
  });

  /** 选中对象变化后当前 tab 可能失效（比如取消选中控件），回落到第一个可用 tab */
  watch(
    propsTabs,
    (tabs) => {
      if (!tabs.some((tab) => tab.name === propsTab.value)) propsTab.value = tabs[0]?.name ?? 'form';
    },
    { immediate: true },
  );

  return {
    selectedId,
    selectedSubtableId,
    selectedSubColumnRef,
    propsTab,
    selectedField,
    selectedSubtable,
    selectedSubColumnSubtable,
    selectedSubColumn,
    codeFieldOptions,
    codeFieldLabels,
    selectField,
    selectSubtable,
    selectSubColumn,
    renameCodeFieldRefs,
    removeCodeFieldRefs,
    propsTabs,
  };
}

export type SelectionModel = ReturnType<typeof useSelection>;

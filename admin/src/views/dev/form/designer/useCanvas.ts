/**
 * 画布排版与拖拽：
 * - 排版序列（fields + subtables 混排）与画布条目；
 * - 控件库 / 画布内控件 / 子表区块 / 明细列的拖拽落点计算与提交。
 */
import { computed, ref, watch, type Ref } from 'vue';
import type { DevFieldType, DevFormField } from '@/types/dev';
import {
  CONTROL_MIME,
  SUBCOLUMN_MIME,
  SUBTABLE_BLOCK,
  SUBTABLE_MIME,
  colSpan,
  type CanvasItem,
  type CanvasKind,
  type DropHint,
  type DropPosition,
  type SubTableDraft,
  type SubTableColumnDraft,
} from './model';
import { typeLabels } from './model';

/** 画布排版顺序：fields + subtables 的 id 混排，控件可以插在子表前后 */
export function useCanvasOrder(options: {
  fields: Ref<DevFormField[]>;
  subtables: Ref<SubTableDraft[]>;
  markDirty: () => void;
}) {
  const { fields, subtables, markDirty } = options;
  const canvasOrder = ref<string[]>([]);

  const canvasItems = computed<CanvasItem[]>(() => {
    const fieldMap = new Map(fields.value.map((field) => [field.id, field]));
    const subMap = new Map(subtables.value.map((sub) => [sub.id, sub]));
    const items: CanvasItem[] = [];
    const seen = new Set<string>();
    const push = (kind: CanvasKind, item: DevFormField | SubTableDraft): void => {
      items.push({
        kind,
        id: item.id,
        index: items.length,
        span: colSpan(item),
        field: kind === 'field' ? (item as DevFormField) : null,
        sub: kind === 'subtable' ? (item as SubTableDraft) : null,
      });
      seen.add(item.id);
    };
    for (const id of canvasOrder.value) {
      const field = fieldMap.get(id);
      if (field) push('field', field);
      else {
        const sub = subMap.get(id);
        if (sub) push('subtable', sub);
      }
    }
    // 没进排版序列的（旧表单首次加载 / 刚建还没排的）按数组顺序追加到末尾
    for (const field of fields.value) if (!seen.has(field.id)) push('field', field);
    for (const sub of subtables.value) if (!seen.has(sub.id)) push('subtable', sub);
    return items;
  });

  // 增删控件 / 子表后把结果同步回排版序列，保证落库的 layout 始终完整
  watch(canvasItems, (items) => {
    const ids = items.map((item) => item.id);
    if (ids.join('|') !== canvasOrder.value.join('|')) canvasOrder.value = ids;
  });

  /** 按统一序列重排 fields / subtables，两个数组的相对顺序与序列保持一致 */
  function applyOrder(ids: string[]): void {
    const fieldMap = new Map(fields.value.map((field) => [field.id, field]));
    const subMap = new Map(subtables.value.map((sub) => [sub.id, sub]));
    const used = new Set<string>();
    const nextFields: DevFormField[] = [];
    const nextSubs: SubTableDraft[] = [];
    for (const id of ids) {
      if (used.has(id)) continue; // 防御：同一 id 重复出现时只保留一次
      const field = fieldMap.get(id);
      if (field) {
        nextFields.push(field);
        used.add(id);
        continue;
      }
      const sub = subMap.get(id);
      if (sub) {
        nextSubs.push(sub);
        used.add(id);
      }
    }
    const ordered = ids.filter((id) => used.has(id));
    for (const field of fields.value) {
      if (!used.has(field.id)) {
        nextFields.push(field);
        ordered.push(field.id);
      }
    }
    for (const sub of subtables.value) {
      if (!used.has(sub.id)) {
        nextSubs.push(sub);
        ordered.push(sub.id);
      }
    }
    fields.value = nextFields;
    subtables.value = nextSubs;
    canvasOrder.value = ordered;
  }

  /** 把一批新 id 插到统一序列的指定位置（越界自动收敛到末尾；已存在的先摘掉再插，避免重复） */
  function insertCanvasIds(newIds: string[], insertAt: number): void {
    const ids = canvasItems.value.map((item) => item.id).filter((id) => !newIds.includes(id));
    const at = Math.max(0, Math.min(insertAt, ids.length));
    ids.splice(at, 0, ...newIds);
    applyOrder(ids);
  }

  /** 画布内换位：先把源元素从序列里摘掉，再插到目标位置 */
  function moveCanvasItem(id: string, insertAt: number): void {
    const items = canvasItems.value;
    const sourceIndex = items.findIndex((item) => item.id === id);
    if (sourceIndex < 0) return;
    let at = Math.max(0, Math.min(insertAt, items.length));
    if (sourceIndex < at) at -= 1; // 摘掉自身后，目标位置左移一位
    const ids = items.map((item) => item.id).filter((existing) => existing !== id);
    ids.splice(Math.max(0, Math.min(at, ids.length)), 0, id);
    applyOrder(ids);
    markDirty();
  }

  return { canvasOrder, canvasItems, applyOrder, insertCanvasIds, moveCanvasItem };
}

export type CanvasOrderModel = ReturnType<typeof useCanvasOrder>;

/** 画布内的拖拽状态与落点提交 */
export function useCanvasDnd(options: {
  canvasItems: Ref<CanvasItem[]>;
  addControl: (type: DevFieldType, insertAt?: number) => void;
  moveCanvasItem: (id: string, insertAt: number) => void;
  addSubtableBlock: (insertAt?: number) => void;
  addSubColumnFromControl: (
    subtable: SubTableDraft,
    type: DevFieldType,
    index?: number,
  ) => SubTableColumnDraft;
  markDirty: () => void;
}) {
  const { canvasItems, addControl, moveCanvasItem, addSubtableBlock, addSubColumnFromControl, markDirty } =
    options;

  /** 被拖动字段 id：给原卡片加半透明样式，也是画布内换位提交的来源 */
  const dragFieldId = ref<string | null>(null);
  /** 当前落点：驱动画布上的插入线，等价于「拖动后的排版预览」 */
  const dropHint = ref<DropHint | null>(null);
  /** 左侧控件库正在拖的控件类型，用来给插入线写标签 */
  const paletteDragType = ref<DevFieldType | null>(null);
  /** 明细字段在子表内部拖拽排序时记录起点 */
  const subColumnDrag = ref<{ subtableId: string; index: number } | null>(null);
  /** 子表区块拖拽排序：被拖区块的 id（画布统一序列里换位） */
  const subtableDragId = ref<string | null>(null);
  /** 控件库控件悬停在子表明细区上：高亮该区块，松手即新增明细列 */
  const detailTargetId = ref<string | null>(null);
  /** 左侧「子表」组件正在拖入：主表控件落点提示要避让 */
  const subtableBlockDragging = ref(false);

  function onControlDragStart(event: DragEvent, type: DevFieldType): void {
    paletteDragType.value = type;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData(CONTROL_MIME, type);
      event.dataTransfer.setData('text/plain', `control:${type}`);
    }
  }

  function readControlType(event: DragEvent): DevFieldType | null {
    const raw =
      event.dataTransfer?.getData(CONTROL_MIME) ||
      event.dataTransfer?.getData('text/plain') ||
      '';
    // 自定义 MIME 存的是 type，text/plain 存的是 control:type
    const type = (raw.startsWith('control:') ? raw.slice('control:'.length) : raw) as DevFieldType;
    return (typeLabels as Record<string, string>)[type] ? type : null;
  }

  function onFieldDragStart(event: DragEvent, field: DevFormField): void {
    dragFieldId.value = field.id;
    dropHint.value = null;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `field:${field.id}`);
    }
  }

  function onFieldDragEnd(): void {
    clearDragState();
  }

  function clearDragState(): void {
    dragFieldId.value = null;
    dropHint.value = null;
    paletteDragType.value = null;
    detailTargetId.value = null;
  }

  /**
   * 指针落在卡片的哪一半：整行控件（比如 span=24）看上下半区，
   * 并排控件看左右半区，这样拖到「左半边 / 右半边」都能表达插入位置。
   */
  function resolveDropPosition(event: DragEvent, element: HTMLElement): DropPosition {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return 'after';
    const row = element.closest('.el-row');
    const rowWidth = row ? row.getBoundingClientRect().width : rect.width;
    const vertical = rect.width >= rowWidth * 0.6;
    const ratio = vertical
      ? (event.clientY - rect.top) / rect.height
      : (event.clientX - rect.left) / rect.width;
    return ratio < 0.5 ? 'before' : 'after';
  }

  /** 指针是否落在子表卡片的明细区里：决定控件是「加明细列」还是「插到子表前/后」 */
  function pointerInDetailArea(event: DragEvent, item: CanvasItem): boolean {
    if (item.kind !== 'subtable') return false;
    const col = event.currentTarget as HTMLElement;
    const area = col.querySelector('.subtable-card__fields');
    if (!area) return false;
    const rect = area.getBoundingClientRect();
    return (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    );
  }

  /** 拖到画布空白处：落点一律算追加到末尾 */
  function onCanvasDragOver(): void {
    // 子表区块排序、明细列排序不参与主表控件落点
    if (subtableDragId.value !== null || subColumnDrag.value) {
      dropHint.value = null;
      detailTargetId.value = null;
      return;
    }
    if (dragFieldId.value === null && !paletteDragType.value && !subtableBlockDragging.value) {
      return;
    }
    detailTargetId.value = null;
    dropHint.value = { index: canvasItems.value.length, position: 'after' };
  }

  /** 悬停在某张卡片（控件 / 子表）上：按指针前/后半区算插入位置 */
  function onCanvasItemDragOver(event: DragEvent, item: CanvasItem): void {
    // 子表区块互拖：插入线表示换到目标位置
    if (subtableDragId.value !== null) {
      if (subtableDragId.value === item.id) {
        dropHint.value = null;
        return;
      }
      dropHint.value = {
        index: item.index,
        position: resolveDropPosition(event, event.currentTarget as HTMLElement),
      };
      return;
    }
    // 明细列排序：只认来源区块，高亮它的明细区
    if (subColumnDrag.value) {
      dropHint.value = null;
      detailTargetId.value = subColumnDrag.value.subtableId === item.id ? item.id : null;
      return;
    }
    if (dragFieldId.value === null && !paletteDragType.value && !subtableBlockDragging.value) {
      return;
    }
    // 控件库控件悬在子表明细区里 = 加明细列（区块描边提示）；其余位置 = 主表落点插线
    if (item.kind === 'subtable' && paletteDragType.value !== null && pointerInDetailArea(event, item)) {
      dropHint.value = null;
      detailTargetId.value = item.id;
      return;
    }
    detailTargetId.value = null;
    dropHint.value = {
      index: item.index,
      position: resolveDropPosition(event, event.currentTarget as HTMLElement),
    };
  }

  /** 提交落点：控件库拖入 = 新增控件；画布内拖动 = 换位置 */
  function commitDrop(
    insertAt: number,
    controlType: DevFieldType | null,
    sourceId: string | null,
  ): void {
    if (controlType) {
      addControl(controlType, insertAt);
      return;
    }
    if (sourceId) moveCanvasItem(sourceId, insertAt);
  }

  function onCanvasDrop(event: DragEvent): void {
    event.preventDefault();
    const controlType = readControlType(event);
    // 来源：主表控件拖动 或 子表区块拖动
    const sourceId = dragFieldId.value ?? subtableDragId.value;
    // 用拖动过程中一直在更新的落点提交：和用户看到的插入线完全一致，
    // 不依赖松手那一瞬间鼠标下面是哪个元素
    const hint = dropHint.value;
    clearDragState();
    subColumnDrag.value = null;
    subtableDragId.value = null;
    subtableBlockDragging.value = false;

    // 从左侧把「子表」组件拖进画布：插到插入线的位置（默认末尾）
    if (readSubtableBlock(event)) {
      addSubtableBlock(
        hint ? (hint.position === 'before' ? hint.index : hint.index + 1) : canvasItems.value.length,
      );
      return;
    }
    const insertAt = hint
      ? hint.position === 'before'
        ? hint.index
        : hint.index + 1
      : canvasItems.value.length;
    commitDrop(insertAt, controlType, sourceId);
  }

  /** 插入线：hint.index 表示「插到第 index 张卡片之前 / 之后」 */
  function caretAt(index: number, position: DropPosition): boolean {
    const hint = dropHint.value;
    return hint !== null && hint.index === index && hint.position === position;
  }

  /** 追加到末尾：插入线画在最后一张卡片的右侧 */
  const appendCaret = computed(
    () => dropHint.value !== null && dropHint.value.index >= canvasItems.value.length,
  );

  const dropHintLabel = computed(() => {
    if (dragFieldId.value !== null) return '放到这里';
    const type = paletteDragType.value;
    return type ? `${typeLabels[type]} · 放到这里` : '放到这里';
  });

  /** 左侧「子表」组件拖拽：不带表名，关联哪张从表在组件属性里选 */
  function onSubtableBlockDragStart(event: DragEvent): void {
    subtableBlockDragging.value = true;
    dropHint.value = null;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData(SUBTABLE_MIME, SUBTABLE_BLOCK);
      event.dataTransfer.setData('text/plain', 'subtable-block');
    }
  }

  function readSubtableBlock(event: DragEvent): boolean {
    const raw = event.dataTransfer?.getData(SUBTABLE_MIME) || '';
    return raw === SUBTABLE_BLOCK || event.dataTransfer?.getData('text/plain') === 'subtable-block';
  }

  /** 明细列在子表内部拖拽排序时记录起点 */
  function onSubColumnDragStart(event: DragEvent, subtable: SubTableDraft, index: number): void {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(SUBCOLUMN_MIME, `${subtable.id}:${index}`);
      event.dataTransfer.setData('text/plain', `subcolumn:${index}`);
    }
    subColumnDrag.value = { subtableId: subtable.id, index };
  }

  /** 子表区块手动拖动排序：在画布统一序列里换位 */
  function onSubtableDragStart(event: DragEvent, sub: SubTableDraft): void {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `subtable:${sub.id}`);
    }
    subtableDragId.value = sub.id;
    dropHint.value = null;
    detailTargetId.value = null;
  }

  function onSubtableDragEnd(): void {
    subtableDragId.value = null;
    detailTargetId.value = null;
  }

  /** 子表区块拖放：区块互拖 = 按插入线换位；明细区拖入控件库控件 = 新增明细列；
   *  其余情况不拦截，冒泡给画布按插入线落点统一提交（控件插到子表前/后、拖入子表组件等） */
  function onSubtableDrop(event: DragEvent, subtable: SubTableDraft, item: CanvasItem): void {
    // 区块排序优先：拖动的是子表卡片的标题栏 / 空白区
    const dragId = subtableDragId.value;
    if (dragId !== null) {
      event.preventDefault();
      event.stopPropagation();
      const hint = dropHint.value;
      subtableDragId.value = null;
      dropHint.value = null;
      detailTargetId.value = null;
      if (hint) {
        commitDrop(hint.position === 'before' ? hint.index : hint.index + 1, null, dragId);
      }
      return;
    }

    const source = subColumnDrag.value;
    if (source) {
      event.preventDefault();
      event.stopPropagation();
      subColumnDrag.value = null;
      detailTargetId.value = null;
      if (source.subtableId !== subtable.id) return;
      // 拖到明细区空白处 = 移到末尾
      const [moved] = subtable.columns.splice(source.index, 1);
      subtable.columns.push(moved);
      markDirty();
      return;
    }

    // 控件库控件落在明细区里 = 新增明细列
    if (paletteDragType.value !== null && pointerInDetailArea(event, item)) {
      const controlType = readControlType(event);
      if (controlType) {
        event.preventDefault();
        event.stopPropagation();
        addSubColumnFromControl(subtable, controlType);
        return;
      }
    }
  }

  /** 拖到某一列上：占用该位置 */
  function onSubColumnDropAt(event: DragEvent, subtable: SubTableDraft, index: number): void {
    event.preventDefault();
    event.stopPropagation();

    const source = subColumnDrag.value;
    subColumnDrag.value = null;
    if (source) {
      if (source.subtableId !== subtable.id || source.index === index) return;
      // 采用「占用目标位置」语义：拖到哪张卡片上就排到该位置，
      // 不能沿用主表那套「插到目标之前」，否则向下拖一位会原地不动。
      const [moved] = subtable.columns.splice(source.index, 1);
      subtable.columns.splice(index, 0, moved);
      markDirty();
      return;
    }

    const controlType = readControlType(event);
    if (controlType) addSubColumnFromControl(subtable, controlType, index);
  }

  /**
   * 拖拽收尾兜底：无论从哪儿松手（含拖到画布外 / 按 Esc 取消），
   * 都要把占位预览和拖动标记清干净，否则下次拖动会带着上次的落点。
   */
  function handleGlobalDragEnd(): void {
    clearDragState();
    subtableDragId.value = null;
    subtableBlockDragging.value = false;
    subColumnDrag.value = null;
  }

  return {
    dragFieldId,
    dropHint,
    paletteDragType,
    subColumnDrag,
    subtableDragId,
    detailTargetId,
    subtableBlockDragging,
    onControlDragStart,
    readControlType,
    onFieldDragStart,
    onFieldDragEnd,
    clearDragState,
    onCanvasDragOver,
    onCanvasItemDragOver,
    onCanvasDrop,
    caretAt,
    appendCaret,
    dropHintLabel,
    onSubtableBlockDragStart,
    onSubColumnDragStart,
    onSubtableDragStart,
    onSubtableDragEnd,
    onSubtableDrop,
    onSubColumnDropAt,
    handleGlobalDragEnd,
  };
}

export type CanvasDndModel = ReturnType<typeof useCanvasDnd>;

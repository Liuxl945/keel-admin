/**
 * 子表（明细区块）模型：区块增删、从表关联、明细列增删与字段绑定。
 */
import { computed, ref, watch, type Ref } from 'vue';
import { ElMessage } from 'element-plus';
import { DEFAULT_CONTROL_WIDTH, controlWidthOf } from '../components/field-style';
import type { DevFieldType, DevFormField } from '@/types/dev';
import type { SyncedColumn } from '@/types/dev-db';
import {
  SYSTEM_COLUMNS,
  allFieldTypes,
  allowedTypes,
  applyTypeDefaults,
  colSpan,
  createMappedField,
  createUnboundField,
  defaultType,
  isPickerType,
  newId,
  spanModelOf,
  toCamel,
  typeLabels,
  type SubTableColumnDraft,
  type SubTableDraft,
} from './model';
import type { BasicStepModel } from './useBasicStep';
import type { CanvasOrderModel } from './useCanvas';
import type { SelectionModel } from './useSelection';

export interface SubtableModelDeps {
  subtables: Ref<SubTableDraft[]>;
  fields: Ref<DevFormField[]>;
  basic: BasicStepModel;
  canvas: CanvasOrderModel;
  selection: SelectionModel;
  markDirty: () => void;
}

export function useSubtableModel(deps: SubtableModelDeps) {
  const { subtables, basic, canvas, selection, markDirty } = deps;
  const { slaveTables, loadSlaveColumns, defaultMasterColumn } = basic;
  const { insertCanvasIds, canvasItems } = canvas;
  const { selectedSubtable, selectedSubtableId, selectedSubColumnRef, selectedSubColumn } = selection;
  const selectedSubColumnSubtable = selection.selectedSubColumnSubtable;

  /** 明细列控件宽度的输入框文本：`100%` / `320px` */
  const subControlWidthText = ref<string>(DEFAULT_CONTROL_WIDTH);
  watch(
    selectedSubColumn,
    (column) => {
      subControlWidthText.value = column ? controlWidthOf(column) : DEFAULT_CONTROL_WIDTH;
    },
    { immediate: true },
  );

  /** 明细列的栅格（/24），只在弹窗录入布局里生效 */
  const subColumnSpanModel = spanModelOf(() => selectedSubColumn.value);
  /** 子表组件的栅格（/24） */
  const subtableSpanModel = spanModelOf(() => selectedSubtable.value);

  /** 当前选中子表在基础设计里对应的从表关系 */
  const selectedSubtableSlave = computed(() => {
    const sub = selectedSubtable.value;
    if (!sub) return null;
    return slaveTables.value.find((slave) => slave.tableName === sub.tableName) ?? null;
  });

  /**
   * 明细可选字段：从表业务列，排除系统列与外键列
   * （外键由运行时按主表主键自动写入，不能作为用户录入项）。
   */
  function subColumnOptions(tableName: string): SyncedColumn[] {
    const slave = slaveTables.value.find((item) => item.tableName === tableName);
    if (!slave) return [];
    return slave.columns.filter(
      (column) =>
        !SYSTEM_COLUMNS.has(column.columnName) &&
        column.columnName !== slave.foreignKey &&
        column.supported &&
        column.type,
    );
  }

  /** 选中明细列在从表里对应的字段（未关联时为 null） */
  const selectedSubColumnSource = computed<SyncedColumn | null>(() => {
    const sub = selectedSubColumnSubtable.value;
    const column = selectedSubColumn.value;
    if (!sub || !column?.columnName) return null;
    return subColumnOptions(sub.tableName).find((item) => item.columnName === column.columnName) ?? null;
  });

  /** 明细列的控件类型候选：未关联时放开全部，关联后按从表列类型收敛 */
  function subColumnTypeOptionsOf(field: DevFormField | null): DevFieldType[] {
    const sub = selectedSubColumnSubtable.value;
    if (!field?.columnName || !sub) return [];
    const column = subColumnOptions(sub.tableName).find((item) => item.columnName === field.columnName);
    return column ? allowedTypes(column) : allFieldTypes;
  }

  /** 该从表字段是否已被同一子表里的其它明细列占用 */
  function isSubColumnUsedByOther(column: SyncedColumn): boolean {
    const sub = selectedSubColumnSubtable.value;
    const current = selectedSubColumn.value;
    if (!sub) return false;
    return sub.columns.some((item) => item.id !== current?.id && item.columnName === column.columnName);
  }

  /** 新增一个待关联从表的子表区块；insertAt 为画布统一序列的插入位置 */
  function addSubtableBlock(insertAt?: number): void {
    const sub: SubTableDraft = {
      id: newId(),
      tableName: '',
      label: '子表',
      foreignKey: '',
      masterColumn: '',
      span: 24,
      mode: 'table',
      columns: [],
      queryFields: [],
      listFields: [],
    };
    subtables.value.push(sub);
    insertCanvasIds([sub.id], insertAt ?? canvasItems.value.length);
    selection.selectSubtable(sub);
    const available = slaveTables.value.find(
      (slave) => !subtables.value.some((item) => item.tableName === slave.tableName),
    );
    if (available) assignSubtableTable(sub, available.tableName);
    markDirty();
  }

  /** 复制子表组件：保留栅格/录入方式，解除从表关联（同一张从表只能挂一个区块） */
  function duplicateSubtable(sub: SubTableDraft): void {
    const copy: SubTableDraft = {
      ...JSON.parse(JSON.stringify(sub)),
      id: newId(),
      label: `${sub.label}副本`,
      tableName: '',
      foreignKey: '',
      masterColumn: '',
      columns: [],
      queryFields: [],
      listFields: [],
    };
    subtables.value.push(copy);
    const ids = canvasItems.value.map((item) => item.id);
    insertCanvasIds([copy.id], ids.indexOf(sub.id) + 1);
    selection.selectSubtable(copy);
    markDirty();
  }

  /** 组件属性里可选的从表：同一张从表只能挂一个区块，当前区块已选的那张仍要留着 */
  function subtableTableOptions(current: SubTableDraft | null): typeof slaveTables.value {
    return slaveTables.value.filter(
      (slave) =>
        !subtables.value.some((item) => item.id !== current?.id && item.tableName === slave.tableName),
    );
  }

  /** 当前选中子表可切换的从表候选 */
  const subtableChoices = computed(() =>
    selectedSubtable.value ? subtableTableOptions(selectedSubtable.value) : [],
  );

  /** 给子表区块关联从表；换表时旧列全部失效，连列表/查询配置一起清掉 */
  function assignSubtableTable(sub: SubTableDraft, tableName: string): void {
    const slave = slaveTables.value.find((item) => item.tableName === tableName);
    if (!slave) {
      ElMessage.warning('该表不是基础设计里配置的从表，请先到第 1 步添加');
      return;
    }
    const duplicated = subtables.value.find((item) => item.id !== sub.id && item.tableName === tableName);
    if (duplicated) {
      ElMessage.warning(`从表 ${tableName} 已经关联到另一个子表组件了`);
      return;
    }
    if (sub.tableName && sub.tableName !== tableName) {
      sub.columns = [];
      sub.queryFields = [];
      sub.listFields = [];
    }
    sub.tableName = tableName;
    sub.label = slave.tableComment || tableName;
    sub.foreignKey = slave.foreignKey;
    sub.masterColumn = slave.masterColumn || defaultMasterColumn.value;
    selectedSubColumnRef.value = null;
    if (slave.columns.length === 0) void loadSlaveColumns(slave);
    markDirty();
  }

  function removeSubtable(sub: SubTableDraft): void {
    const index = subtables.value.indexOf(sub);
    if (index < 0) return;
    const [removed] = subtables.value.splice(index, 1);
    if (removed && selectedSubtableId.value === removed.id) {
      selectedSubtableId.value = null;
      selection.propsTab.value = 'form';
    }
    if (removed && selectedSubColumnRef.value?.subtableId === removed.id) {
      selectedSubColumnRef.value = null;
      selection.propsTab.value = 'form';
    }
    markDirty();
  }

  /** 明细列 = 拖进子表的基础控件；能自动关联就从表列关联，没有就建成未关联 */
  function addSubColumnFromControl(
    subtable: SubTableDraft,
    type: DevFieldType,
    index?: number,
  ): SubTableColumnDraft {
    const used = new Set(subtable.columns.map((item) => item.columnName).filter(Boolean));
    const column = subColumnOptions(subtable.tableName).find(
      (item) => !used.has(item.columnName) && allowedTypes(item).includes(type),
    );
    const base = column ? createMappedField(column) : createUnboundField(type, nextSubColumnName(subtable));
    const field: SubTableColumnDraft = {
      ...base,
      columnName: base.columnName ?? '',
      // 明细表单（弹窗录入）默认半行
      span: 12,
      visible: true,
    };
    applyTypeDefaults(field, type);
    if (column && !subtable.listFields.includes(column.columnName)) {
      subtable.listFields.push(column.columnName);
    }
    if (index === undefined || index >= subtable.columns.length) {
      subtable.columns.push(field);
    } else {
      subtable.columns.splice(index, 0, field);
    }
    selectedSubColumnRef.value = { subtableId: subtable.id, columnId: field.id };
    selectedSubtableId.value = null;
    selection.selectedId.value = null;
    selection.propsTab.value = 'field';
    markDirty();
    return field;
  }

  function handleSubColumnColumnChange(value: string): void {
    const sub = selectedSubColumnSubtable.value;
    const column = selectedSubColumn.value;
    if (!sub || !column) return;
    const previousName = column.name;
    if (!value) {
      const previous = column.columnName;
      column.columnName = '';
      column.name = nextSubColumnName(sub);
      selection.renameCodeFieldRefs(previousName, column.name);
      column.required = false;
      if (previous) {
        sub.queryFields = sub.queryFields.filter((name) => name !== previous);
        sub.listFields = sub.listFields.filter((name) => name !== previous);
      }
      markDirty();
      return;
    }
    const duplicated = sub.columns.some((item) => item.id !== column.id && item.columnName === value);
    if (duplicated) {
      ElMessage.warning('该从表字段已被其他明细列使用');
      return;
    }
    const source = subColumnOptions(sub.tableName).find((item) => item.columnName === value);
    if (!source) {
      ElMessage.warning('该字段不能作为明细列（系统字段、外键或类型不支持）');
      return;
    }
    const previous = column.columnName;
    column.columnName = source.columnName;
    column.name = toCamel(source.columnName);
    selection.renameCodeFieldRefs(previousName, column.name);
    column.label =
      column.label && column.label !== typeLabels[column.type]
        ? column.label
        : source.comment || source.columnName;
    if (!allowedTypes(source).includes(column.type)) column.type = defaultType(source);
    column.required = !source.nullable;
    if (previous && previous !== source.columnName) {
      sub.listFields = sub.listFields.map((name) => (name === previous ? source.columnName : name));
      sub.queryFields = sub.queryFields.map((name) => (name === previous ? source.columnName : name));
    }
    if (!sub.listFields.includes(source.columnName)) sub.listFields.push(source.columnName);
    markDirty();
  }

  /** 未关联列的占位字段名：同一子表内不重复 */
  function nextSubColumnName(subtable: SubTableDraft): string {
    const used = new Set(subtable.columns.map((item) => item.name));
    let index = subtable.columns.length + 1;
    let name = `field${index}`;
    while (used.has(name)) {
      index += 1;
      name = `field${index}`;
    }
    return name;
  }

  function removeSubColumn(subtable: SubTableDraft, index: number): void {
    const [removed] = subtable.columns.splice(index, 1);
    if (!removed) return;
    subtable.queryFields = subtable.queryFields.filter((name) => name !== removed.columnName);
    subtable.listFields = subtable.listFields.filter((name) => name !== removed.columnName);
    selection.removeCodeFieldRefs(removed.name);
    if (selectedSubColumnRef.value?.columnId === removed.id) {
      selectedSubColumnRef.value = null;
      selection.propsTab.value = 'subtable';
    }
    markDirty();
  }

  /** 基础设计里的从表被删/主表被换时，清理失去关系来源的明细（还没选表的区块保留） */
  function pruneSubtables(): void {
    const names = new Set(slaveTables.value.map((slave) => slave.tableName));
    const kept = subtables.value.filter((sub) => !sub.tableName || names.has(sub.tableName));
    if (kept.length !== subtables.value.length) {
      subtables.value = kept;
      if (selectedSubtableId.value && !kept.some((sub) => sub.id === selectedSubtableId.value)) {
        selectedSubtableId.value = null;
        selection.propsTab.value = 'form';
      }
      if (
        selectedSubColumnRef.value &&
        !kept.some((sub) => sub.id === selectedSubColumnRef.value?.subtableId)
      ) {
        selectedSubColumnRef.value = null;
        selection.propsTab.value = 'form';
      }
    }
    // 外键/主键列以基础设计为准
    for (const sub of subtables.value) {
      const slave = slaveTables.value.find((item) => item.tableName === sub.tableName);
      if (!slave) continue;
      sub.foreignKey = slave.foreignKey;
      sub.masterColumn = slave.masterColumn || sub.masterColumn;
    }
  }

  /**
   * 子表设计校验：区块必须关联从表、有明细列、明细列都绑定了从表字段、
   * 非空列必填、控件类型匹配。与后端 validateSubTables 同一套规则。
   */
  function checkSubtableDesign(validatePicker: (label: string, field: DevFormField) => string | null): string | null {
    const seenTables = new Set<string>();
    for (const sub of subtables.value) {
      if (!sub.tableName) {
        return '有子表组件还没有选择关联的子表，请在右侧「组件属性 → 关联子表」里选择';
      }
      if (!slaveTables.value.some((slave) => slave.tableName === sub.tableName)) {
        return `子表「${sub.tableName}」对应的从表已不在基础设计中，请回到第 1 步重新配置`;
      }
      if (!sub.label.trim()) return '请填写子表标题';
      if (seenTables.has(sub.tableName)) return `子表重复：${sub.tableName}`;
      seenTables.add(sub.tableName);
      if (sub.columns.length === 0) {
        return `子表「${sub.label}」还没有明细列，请从左侧控件库拖入控件`;
      }

      const unbound = sub.columns.filter((column) => !column.columnName);
      if (unbound.length > 0) {
        const names = unbound
          .slice(0, 5)
          .map((column, index) => `第${index + 1}个「${column.label}」`)
          .join('、');
        return `子表「${sub.label}」还有 ${unbound.length} 个明细列没有关联从表字段：${names}，请在右侧「控件字段」中选择`;
      }

      const names = new Set<string>();
      for (const column of sub.columns) {
        if (!column.label.trim()) return `子表「${sub.label}」存在没有标签的明细字段`;
        if (names.has(column.columnName)) {
          return `子表「${sub.label}」明细字段重复：${column.columnName}`;
        }
        names.add(column.columnName);
        const source = slaveTables.value
          .find((slave) => slave.tableName === sub.tableName)
          ?.columns.find((item) => item.columnName === column.columnName);
        if (!source) {
          return `子表「${sub.label}」的字段 ${column.columnName} 已不存在，请重新选择`;
        }
        if (!allowedTypes(source).includes(column.type)) {
          return `子表字段「${column.label}」的类型与 ${column.columnName} 不匹配`;
        }
        if (isPickerType(column.type)) {
          const pickerError = validatePicker(column.label, column as DevFormField);
          if (pickerError) return pickerError;
        }
        if (!source.nullable && !column.required) {
          return `从表非空字段「${column.columnName}」必须设为必填`;
        }
      }
    }
    return null;
  }

  /** 子表组件在主表单里的栅格占位（供模板使用） */
  function subtableColSpan(sub: SubTableDraft): number {
    return colSpan(sub);
  }

  return {
    subControlWidthText,
    subColumnSpanModel,
    subtableSpanModel,
    selectedSubtableSlave,
    subColumnOptions,
    selectedSubColumnSource,
    subColumnTypeOptionsOf,
    isSubColumnUsedByOther,
    addSubtableBlock,
    duplicateSubtable,
    subtableTableOptions,
    subtableChoices,
    assignSubtableTable,
    removeSubtable,
    addSubColumnFromControl,
    handleSubColumnColumnChange,
    nextSubColumnName,
    removeSubColumn,
    pruneSubtables,
    checkSubtableDesign,
    subtableColSpan,
  };
}

export type SubtableModel = ReturnType<typeof useSubtableModel>;

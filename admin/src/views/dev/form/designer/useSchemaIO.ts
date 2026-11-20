/**
 * 设计器的表单装载、校验、落库与步骤流转：
 * 把各模型的状态汇总成 DevFormSchema，负责保存/发布/离开确认。
 */
import { nextTick, ref, watch, type Ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { Router } from 'vue-router';
import { getDevForm, publishDevForm, updateDevForm } from '@/api/dev-form';
import { listDataSourceOptions } from '@/api/dev-datasource';
import {
  DEFAULT_CONTROL_WIDTH,
  controlWidthOf,
  normalizeControlWidth,
} from '../components/field-style';
import type {
  DevCodeSource,
  DevFormField,
  DevFormSchema,
  DevFormStatus,
  DevFormSubTable,
  DevFormTableRef,
} from '@/types/dev';
import {
  allowedTypes,
  applyUploadDefaults,
  elSizeOf,
  isDisplayOnly,
  isPickerType,
  newId,
  normalizeDateFormat,
  normalizeDialogType,
  normalizeFormSize,
  toCamel,
  type SubTableDraft,
} from './model';
import type { BasicStepModel } from './useBasicStep';
import type { CanvasOrderModel } from './useCanvas';
import type { FieldModel } from './useFieldModel';
import type { ListModel } from './useListModel';
import type { SelectionModel } from './useSelection';
import type { SubtableModel } from './useSubtableModel';

export interface SchemaIODeps {
  formId: Ref<number>;
  /** 由外层持有：loading 期间不标记脏数据 */
  flags: { loading: Ref<boolean>; dirty: Ref<boolean>; markDirty: () => void };
  fields: Ref<DevFormField[]>;
  subtables: Ref<SubTableDraft[]>;
  basic: BasicStepModel;
  selection: SelectionModel;
  field: FieldModel;
  list: ListModel;
  canvas: CanvasOrderModel;
  subtable: SubtableModel;
  router: Router;
  onClose: () => void;
}

export function useSchemaIO(deps: SchemaIODeps) {
  const { formId, fields, subtables, basic, selection, field, list, canvas, subtable, router } = deps;
  const { businessColumns, slaveTables, tableName, tableComment, connectionId, dataSources } = basic;
  const { formSettings, labelWidth, columns } = field;
  const {
    listConfig,
    syncListFieldsFromColumns,
    pruneListColumns,
    validateStep3,
    fillDefaultListColumns,
    applyListConfig,
    columnMap,
  } = list;
  const { selectedId, selectedSubtableId, selectedSubColumnRef } = selection;

  const { loading, dirty, markDirty } = deps.flags;
  const saving = ref(false);
  const publishing = ref(false);
  const step = ref(1);
  const stepItems = [
    { value: 1, label: '基础设计' },
    { value: 2, label: '表单设计' },
    { value: 3, label: '列表设计' },
  ];
  /** 预览入口收敛到表单列表页，设计器内不再展示；需要恢复时改为 true */
  const showPreviewButton = false;

  const formName = ref('');
  const formKey = ref('');
  const formDescription = ref('');
  const status = ref<DevFormStatus>('DRAFT');
  const version = ref(1);

  /** 切换连接/主表时清空后续步骤的设计结果（tables＝字段由调用方按新表重建） */
  function resetDesign(mode: 'all' | 'tables'): void {
    if (mode === 'all') {
      fields.value = [];
      selectedId.value = null;
    }
    subtables.value = [];
    selectedSubtableId.value = null;
    selectedSubColumnRef.value = null;
    canvas.canvasOrder.value = [];
    listConfig.queryFields = [];
    listConfig.listFields = [];
    listConfig.queryColumns = [];
    listConfig.listColumns = [];
    listConfig.subTableView = 'merge';
  }

  /* ---------------- 校验 ---------------- */

  function validateStep1(): string | null {
    if (!formName.value.trim()) return '请输入表单名称';
    if (!connectionId.value) return '请选择数据连接';
    return basic.validateTableStep();
  }

  function validateFields(strict: boolean): string | null {
    if (fields.value.length === 0) return '请至少保留一个表单字段';

    // 允许先拖控件再绑定；二维码/条码是展示型控件，允许不绑定数据库字段
    const unbound = fields.value.filter((item) => !item.columnName && !isDisplayOnly(item.type));
    if (unbound.length > 0) {
      const detail = unbound
        .slice(0, 5)
        .map((item) => `第${fields.value.indexOf(item) + 1}个「${item.label}」`)
        .join('、');
      return `还有 ${unbound.length} 个控件没有绑定数据库字段：${detail}${
        unbound.length > 5 ? ' 等' : ''
      }，请在右侧「控件字段」中选择`;
    }

    const names = new Set<string>();
    const mapped = new Set<string>();

    for (const item of fields.value) {
      if (!item.label.trim()) return `字段「${item.name}」缺少标签`;
      if (!item.columnName) {
        if (isDisplayOnly(item.type)) continue;
        return `字段「${item.label}」尚未关联数据库字段`;
      }
      const column = columnMap.value.get(item.columnName);
      if (!column) return `数据库字段不存在：${item.columnName}`;
      if (mapped.has(item.columnName)) return `数据库字段重复映射：${item.columnName}`;
      mapped.add(item.columnName);

      if (item.name !== toCamel(column.columnName)) {
        return `字段「${item.label}」的字段名应为 ${toCamel(column.columnName)}`;
      }
      if (names.has(item.name)) return `字段名重复：${item.name}`;
      names.add(item.name);

      if (!allowedTypes(column).includes(item.type)) {
        return `字段「${item.label}」的组件类型与数据库字段 ${column.columnName} 不匹配`;
      }
      if (isPickerType(item.type)) {
        const pickerError = field.validatePickerConfig(item.label, item);
        if (pickerError) return pickerError;
      }
      if (!column.nullable && !item.required) {
        return `非空数据库字段「${column.columnName}」必须设为必填`;
      }
      if (['select', 'radio', 'checkbox'].includes(item.type)) {
        if (item.options.length === 0) return `字段「${item.label}」至少需要一个选项`;
        const values = new Set<string>();
        for (const option of item.options) {
          if (!option.label.trim() || !option.value.trim()) return `字段「${item.label}」存在空选项`;
          if (values.has(option.value.trim()))
            return `字段「${item.label}」选项值重复：${option.value}`;
          values.add(option.value.trim());
        }
      }
    }

    if (strict) {
      const missingRequired = businessColumns.value.filter(
        (column) => !column.nullable && !mapped.has(column.columnName),
      );
      if (missingRequired.length > 0) {
        return `非空数据库字段必须包含在表单中：${missingRequired
          .slice(0, 5)
          .map((column) => column.columnName)
          .join('、')}`;
      }
    }
    return null;
  }

  function validateSubtableDesign(): string | null {
    return subtable.checkSubtableDesign(field.validatePickerConfig);
  }

  /* ---------------- 落库结构 ---------------- */

  function buildTableRefs(): DevFormTableRef[] {
    const refs: DevFormTableRef[] = [];
    if (tableName.value) {
      refs.push({ role: 'MASTER', tableName: tableName.value, tableComment: tableComment.value });
    }
    for (const slave of slaveTables.value) {
      if (!slave.tableName) continue;
      refs.push({
        role: 'SLAVE',
        tableName: slave.tableName,
        tableComment: slave.tableComment,
        foreignKey: slave.foreignKey || null,
        masterColumn: slave.masterColumn || null,
      });
    }
    return refs;
  }

  /** 字段/明细列落库统一结构：主表字段与子表明细列共用一套配置 */
  function buildFieldPayload(item: DevFormField) {
    return {
      id: item.id,
      type: item.type,
      label: item.label.trim(),
      name: item.name.trim(),
      columnName: item.columnName ?? null,
      placeholder: item.placeholder ?? '',
      required: Boolean(item.required),
      disabled: Boolean(item.disabled),
      clearable: item.clearable !== false,
      span: item.span || 24,
      labelWidth: item.labelWidth ? Number(item.labelWidth) : null,
      // 控件宽度统一存百分比，未设置按默认 100%
      controlWidth: controlWidthOf(item),
      options: item.options.map((option) => ({
        label: option.label.trim(),
        value: option.value.trim(),
      })),
      ...(item.rows !== undefined ? { rows: item.rows } : {}),
      ...(item.min !== undefined ? { min: item.min } : {}),
      ...(item.max !== undefined ? { max: item.max } : {}),
      ...(item.step !== undefined ? { step: item.step } : {}),
      ...(item.type === 'date' || item.type === 'datetime'
        ? { dateFormat: normalizeDateFormat(item.type, item.dateFormat) }
        : {}),
      ...(item.type === 'qrcode' || item.type === 'barcode'
        ? {
            codeSource: (item.codeSource === 'link' ? 'link' : 'fixed') as DevCodeSource,
            codeValue: item.codeValue ?? '',
            codeFields: item.codeFields ?? [],
            codeSeparator: item.codeSeparator ?? '',
          }
        : {}),
      ...(item.type === 'image' || item.type === 'file'
        ? {
            maxCount: item.maxCount ?? 9,
            maxSize: item.maxSize ?? 10,
            acceptTypes: item.acceptTypes ?? [],
            accept: item.accept ?? '',
            tip: item.tip ?? '',
          }
        : {}),
      ...(isPickerType(item.type)
        ? {
            sourceId: item.sourceId ?? null,
            sourceName: item.sourceName ?? '',
            valueField: item.valueField ?? '',
            displayField: item.displayField ?? '',
            listFields: (item.listFields ?? []).map((entry) => ({
              key: entry.key.trim(),
              label: entry.label.trim(),
            })),
            multiple: Boolean(item.multiple),
            keywordKey: item.keywordKey ?? '',
            pickerTitle: item.pickerTitle ?? '',
          }
        : {}),
      ...(item.defaultValue !== undefined ? { defaultValue: item.defaultValue } : {}),
    };
  }

  /** 子表配置落库前按当前从表关系裁剪，避免存下已经失效的明细 */
  function buildSubTables(): DevFormSubTable[] {
    return subtables.value
      .filter((sub) => slaveTables.value.some((slave) => slave.tableName === sub.tableName))
      .map((sub) => {
        const columnNames = new Set(sub.columns.map((column) => column.columnName).filter(Boolean));
        return {
          id: sub.id,
          tableName: sub.tableName,
          label: sub.label.trim(),
          foreignKey: sub.foreignKey || null,
          masterColumn: sub.masterColumn || null,
          span: sub.span || 24,
          mode: sub.mode,
          columns: sub.columns.map((column) => ({
            ...buildFieldPayload(column),
            columnName: column.columnName,
            span: column.span || 12,
            visible: column.visible !== false,
          })),
          queryFields: sub.queryFields.filter((name) => columnNames.has(name)),
          // 明细列展示顺序以 columns（画布拖拽顺序）为准，listFields 只表示"显示哪些"
          listFields: sub.columns
            .map((column) => column.columnName)
            .filter((name): name is string => Boolean(name) && sub.listFields.includes(name)),
        };
      });
  }

  function buildSchema(): DevFormSchema {
    // 详细配置是唯一来源，落库前把兼容字段和子表列一起同步
    syncListFieldsFromColumns();
    return {
      columns: columns.value,
      labelWidth: labelWidth.value,
      labelPosition: formSettings.labelPosition,
      // size 由 formSize 派生，保持对旧版运行时/代码的兼容
      size: elSizeOf(formSettings.formSize),
      formSize: formSettings.formSize,
      dialogType: formSettings.dialogType,
      dialogWidth: formSettings.dialogWidth ?? null,
      disabled: formSettings.disabled,
      labelSuffix: formSettings.labelSuffix,
      hideRequiredAsterisk: formSettings.hideRequiredAsterisk,
      showMessage: formSettings.showMessage,
      statusIcon: formSettings.statusIcon,
      fields: fields.value.map((item) => buildFieldPayload(item)),
      list: {
        queryFields: [...listConfig.queryFields],
        listFields: [...listConfig.listFields],
        queryColumns: listConfig.queryColumns.map((item) => ({
          columnName: item.columnName,
          source: item.source,
          tableName: item.source === 'subtable' ? item.tableName : null,
          field: list.fieldNameOf(item),
          operator: item.operator,
          defaultValue: item.defaultValue === '' ? null : item.defaultValue,
          keyword: item.keyword.trim(),
          multiple: Boolean(item.multiple),
          hidden: Boolean(item.hidden),
        })),
        listColumns: listConfig.listColumns.map((item) => ({
          columnName: item.columnName,
          source: item.source,
          tableName: item.source === 'subtable' ? item.tableName : null,
          field: list.fieldNameOf(item),
          sortable: Boolean(item.sortable),
          fixed: item.fixed,
          align: item.align,
          width: item.width ?? null,
        })),
        subtableView: listConfig.subTableView,
      },
      tables: buildTableRefs(),
      subtables: buildSubTables(),
      // 画布排版顺序：控件与子表混排后的 id 序列
      layout: canvas.canvasItems.value.map((item) => item.id),
    };
  }

  /* ---------------- 保存 / 发布 ---------------- */

  async function saveForm(showMessage = true): Promise<boolean> {
    if (!formName.value.trim()) {
      ElMessage.warning('请输入表单名称');
      return false;
    }
    if (fields.value.length > 0) {
      const error = validateFields(false);
      if (error) {
        ElMessage.warning(error);
        return false;
      }
    }
    if (subtables.value.length > 0) {
      const error = validateSubtableDesign();
      if (error) {
        ElMessage.warning(error);
        return false;
      }
    }

    saving.value = true;
    try {
      const detail = await updateDevForm(formId.value, {
        name: formName.value.trim(),
        description: formDescription.value || null,
        connectionId: connectionId.value,
        tableName: tableName.value || null,
        schema: buildSchema(),
      });
      status.value = detail.status;
      version.value = detail.version;
      dirty.value = false;
      if (showMessage) ElMessage.success('草稿已保存');
      return true;
    } catch {
      return false;
    } finally {
      saving.value = false;
    }
  }

  function nextStep(): void {
    if (step.value === 1) {
      const error = validateStep1();
      if (error) {
        ElMessage.warning(error);
        return;
      }
      // 进入表单设计前把明细关系同步一次（外键可能在第一步被改过）
      subtable.pruneSubtables();
      step.value = 2;
      return;
    }
    if (step.value === 2) {
      const error = validateFields(true) ?? validateSubtableDesign();
      if (error) {
        ElMessage.warning(error);
        return;
      }
      if (listConfig.listColumns.length === 0) {
        fillDefaultListColumns();
      }
      pruneListColumns();
      step.value = 3;
    }
  }

  async function handlePublish(): Promise<void> {
    const error = validateStep1() ?? validateFields(true) ?? validateSubtableDesign() ?? validateStep3();
    if (error) {
      ElMessage.warning(error);
      return;
    }
    if (!(await saveForm(false))) return;

    try {
      await ElMessageBox.confirm(
        '发布后将按关联数据表生成前后端 CRUD 代码；再次修改会自动回到草稿状态。',
        '发布确认',
        { type: 'warning', confirmButtonText: '发布' },
      );
    } catch {
      return;
    }

    publishing.value = true;
    try {
      const detail = await publishDevForm(formId.value);
      status.value = detail.status;
      version.value = detail.version;
      ElMessage.success('发布成功，已按数据表生成代码');
      goBack();
    } catch {
      // 错误提示由 request 拦截器统一处理
    } finally {
      publishing.value = false;
    }
  }

  async function openFormPreview(): Promise<void> {
    // 在线预览使用真实数据，需要先保存为草稿，确保后端按当前设计执行 CRUD
    const saved = await saveForm(false);
    if (!saved) return;
    await router.push(`/dev/form/preview/${formId.value}`);
  }

  async function handleGenerateAll(): Promise<void> {
    if (fields.value.length > 0) {
      try {
        await ElMessageBox.confirm(
          '将按数据表重新生成全部字段，已配置的控件属性会被覆盖，确定继续吗？',
          '按表生成',
          { type: 'warning', confirmButtonText: '生成' },
        );
      } catch {
        return;
      }
    }
    field.generateFieldsFromTable({ listAll: true });
    selection.propsTab.value = 'field';
  }

  async function goBack(): Promise<void> {
    if (dirty.value) {
      try {
        await ElMessageBox.confirm('当前有未保存的修改，确定离开吗？', '离开确认', {
          type: 'warning',
          confirmButtonText: '离开',
        });
      } catch {
        return;
      }
    }
    deps.onClose();
  }

  /* ---------------- 装载 ---------------- */

  function applyDetail(detail: Awaited<ReturnType<typeof getDevForm>>): void {
    formName.value = detail.name;
    formKey.value = detail.formKey;
    formDescription.value = detail.description ?? '';
    status.value = detail.status;
    version.value = detail.version;
    columns.value = detail.schema.columns;
    labelWidth.value = detail.schema.labelWidth;
    formSettings.labelPosition = detail.schema.labelPosition ?? 'right';
    formSettings.formSize = normalizeFormSize(detail.schema);
    formSettings.dialogType = normalizeDialogType(detail.schema.dialogType);
    formSettings.dialogWidth = detail.schema.dialogWidth ?? null;
    formSettings.disabled = Boolean(detail.schema.disabled);
    formSettings.labelSuffix = detail.schema.labelSuffix ?? '';
    formSettings.hideRequiredAsterisk = Boolean(detail.schema.hideRequiredAsterisk);
    formSettings.showMessage = detail.schema.showMessage !== false;
    formSettings.statusIcon = Boolean(detail.schema.statusIcon);
    fields.value = detail.schema.fields.map((item) => {
      const next: DevFormField = {
        ...item,
        disabled: Boolean(item.disabled),
        clearable: item.clearable !== false,
        span: item.span || 24,
        // 日期/时间控件格式（datetime 已改为纯时间，旧日期格式迁移为 HH:mm:ss）
        dateFormat: normalizeDateFormat(item.type, item.dateFormat),
        // 二维码/条码只支持固定值、组件联动；旧的手填模式迁移为固定值
        codeSource: item.codeSource === 'link' ? 'link' : 'fixed',
        codeFields: item.codeFields ?? [],
        // 旧表单没有弹框选择器配置，按空配置兼容
        sourceId: item.sourceId ?? null,
        sourceName: item.sourceName ?? '',
        valueField: item.valueField ?? '',
        displayField: item.displayField ?? '',
        listFields: item.listFields ?? [],
        multiple: Boolean(item.multiple),
        keywordKey: item.keywordKey ?? '',
        pickerTitle: item.pickerTitle ?? '',
      };
      // 旧表单没有上传参数，按默认 9 个 / 10MB 兼容
      applyUploadDefaults(next);
      return next;
    });
    connectionId.value = detail.connectionId;
    basic.activeConnectionId.value = detail.connectionId;
    tableName.value = detail.tableName ?? '';
    basic.activeTableName.value = detail.tableName ?? '';
    slaveTables.value = (detail.schema.tables ?? [])
      .filter((table) => table.role === 'SLAVE')
      .map((table) => ({
        key: newId(),
        tableName: table.tableName,
        tableComment: table.tableComment ?? '',
        foreignKey: table.foreignKey ?? '',
        masterColumn: table.masterColumn ?? '',
        columns: [],
        loading: false,
      }));
    subtables.value = (detail.schema.subtables ?? []).map((sub) => ({
      id: sub.id || newId(),
      tableName: sub.tableName,
      label: sub.label,
      foreignKey: sub.foreignKey ?? '',
      masterColumn: sub.masterColumn ?? '',
      span: sub.span || 24,
      mode: sub.mode ?? 'table',
      columns: (sub.columns ?? []).map((column) => {
        const next = {
          ...column,
          id: column.id || newId(),
          dateFormat: normalizeDateFormat(column.type, column.dateFormat),
          codeSource: (column.codeSource === 'link' ? 'link' : 'fixed') as DevCodeSource,
          codeFields: column.codeFields ?? [],
          columnName: column.columnName ?? '',
          placeholder: column.placeholder ?? '',
          required: Boolean(column.required),
          disabled: Boolean(column.disabled),
          clearable: column.clearable !== false,
          span: column.span || 12,
          labelWidth: column.labelWidth ?? null,
          controlWidth: normalizeControlWidth(column.controlWidth) ?? DEFAULT_CONTROL_WIDTH,
          options: column.options ?? [],
          visible: column.visible !== false,
          sourceId: column.sourceId ?? null,
          sourceName: column.sourceName ?? '',
          valueField: column.valueField ?? '',
          displayField: column.displayField ?? '',
          listFields: column.listFields ?? [],
          multiple: Boolean(column.multiple),
          keywordKey: column.keywordKey ?? '',
          pickerTitle: column.pickerTitle ?? '',
        };
        applyUploadDefaults(next);
        return next;
      }),
      queryFields: [...(sub.queryFields ?? [])],
      listFields: [...(sub.listFields ?? [])],
    }));
    applyListConfig(detail.schema.list);
    // 画布排版顺序：旧表单没有 layout 字段，canvasItems 会回落为「字段在前、子表在后」
    canvas.canvasOrder.value = [...(detail.schema.layout ?? [])];
    selectedSubtableId.value = null;
    selectedSubColumnRef.value = null;
    selectedId.value = detail.schema.fields[0]?.id ?? null;
    selection.propsTab.value = 'field';
  }

  async function load(): Promise<void> {
    loading.value = true;
    try {
      dataSources.value = await listDataSourceOptions().catch(() => []);
      const detail = await getDevForm(formId.value);
      applyDetail(detail);
      if (!connectionId.value) {
        connectionId.value = basic.defaultConnectionId();
        basic.activeConnectionId.value = connectionId.value;
      }
      if (connectionId.value) {
        await basic.loadSyncedTables();
        if (tableName.value) await basic.loadTableDetail(tableName.value, false);
      }
      // 从表的列要等 syncedTables 就绪后才能定位，放在最后统一补载
      if (slaveTables.value.length > 0) {
        await Promise.all(slaveTables.value.map((slave) => basic.loadSlaveColumns(slave)));
        // 关系以基础设计为准，顺手清掉已经失效的明细配置
        subtable.pruneSubtables();
      }
      // 主表列就绪后再裁剪失效的查询/列表行，避免把有效配置提前清掉
      if (businessColumns.value.length > 0) pruneListColumns();
      await nextTick();
      dirty.value = false;
    } catch {
      deps.onClose();
    } finally {
      loading.value = false;
    }
  }

  // 任一设计内容变化都标记为未保存
  watch(
    [fields, columns, labelWidth, formSettings, formName, formDescription, listConfig, subtables],
    () => markDirty(),
    { deep: true },
  );

  return {
    saving,
    publishing,
    dirty,
    step,
    stepItems,
    showPreviewButton,
    formName,
    formKey,
    formDescription,
    status,
    version,
    markDirty,
    resetDesign,
    validateStep1,
    validateFields,
    validateSubtableDesign,
    buildFieldPayload,
    buildSchema,
    saveForm,
    nextStep,
    handlePublish,
    openFormPreview,
    handleGenerateAll,
    goBack,
    applyDetail,
    load,
  };
}

export type SchemaIOModel = ReturnType<typeof useSchemaIO>;

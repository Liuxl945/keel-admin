/**
 * 第 2 步「表单设计」的控件模型：字段增删改、字段与数据库列的绑定、
 * 上传/日期/弹框选择器的默认配置，以及高级控件的数据源元数据。
 */
import { computed, reactive, ref, watch, type Ref } from 'vue';
import { ElMessage } from 'element-plus';
import { getDevApi, listDevApis } from '@/api/dev-api';
import { getDevForm, listDevForms } from '@/api/dev-form';
import { DEFAULT_CONTROL_WIDTH, controlWidthOf, normalizeControlWidth } from '../components/field-style';
import type {
  DevDataPickerColumn,
  DevFieldType,
  DevFormDialogType,
  DevFormField,
  DevFormLabelPosition,
  DevFormSizePreset,
} from '@/types/dev';
import type { SyncedColumn } from '@/types/dev-db';
import {
  allFieldTypes,
  allowedTypes,
  applyDateFormatDefault,
  applyPickerDefaults,
  applyUploadDefaults,
  applyTypeDefaults,
  createMappedField,
  createUnboundField,
  defaultFor,
  defaultOptionsFor,
  defaultType,
  isBuiltinPickerType,
  isDisplayOnly,
  isPickerType,
  newId,
  toCamel,
  typeLabels,
  type FormSettings,
} from './model';
import type { SelectionModel as Selection } from './useSelection';
import type { ListModel as List } from './useListModel';
import type { CanvasOrderModel as CanvasOrder } from './useCanvas';

export interface FieldModelDeps {
  fields: Ref<DevFormField[]>;
  businessColumns: Ref<SyncedColumn[]>;
  selection: Selection;
  list: List;
  canvas: CanvasOrder;
  markDirty: () => void;
}

export function useFieldModel(deps: FieldModelDeps) {
  const { fields, businessColumns, selection, list, canvas, markDirty } = deps;
  const { selectedField, selectedSubColumn, selectedId, selectedSubtableId, selectedSubColumnRef } =
    selection;
  const { listConfig, createListDraft, syncListFieldsFromColumns, columnMap } = list;
  const { canvasItems, insertCanvasIds } = canvas;

  /* ---------------- 表单整体设置 ---------------- */
  const columns = ref<1 | 2>(1);
  const labelWidth = ref(100);
  const formSettings = reactive<FormSettings>({
    labelPosition: 'right' as DevFormLabelPosition,
    formSize: 'medium' as DevFormSizePreset,
    dialogType: 'center' as DevFormDialogType,
    dialogWidth: null,
    disabled: false,
    labelSuffix: '',
    hideRequiredAsterisk: false,
    showMessage: true,
    statusIcon: false,
  });

  /** 画布预览的值模型：仅用于左侧画布交互预览，不参与提交 */
  const previewModel = reactive<Record<string, any>>({});

  const selectedColumn = computed(() =>
    selectedField.value?.columnName ? columnMap.value.get(selectedField.value.columnName) ?? null : null,
  );

  /** 控件宽度的输入框文本：`100%` / `320px`，未设置时显示默认值 */
  const controlWidthText = ref<string>(DEFAULT_CONTROL_WIDTH);

  watch(
    selectedField,
    (field) => {
      controlWidthText.value = field ? controlWidthOf(field) : DEFAULT_CONTROL_WIDTH;
    },
    { immediate: true },
  );

  /** 宽度输入提交：裸数字按 px，带 % 按百分比，非法输入回退原值 */
  function applyControlWidth(field: DevFormField | null, raw: string): string {
    if (!field) return DEFAULT_CONTROL_WIDTH;
    const value = normalizeControlWidth(raw);
    if (!value) {
      ElMessage.warning('控件宽度请填 100%（百分比）或 320px（像素）');
      return controlWidthOf(field);
    }
    field.controlWidth = value;
    markDirty();
    return value;
  }

  /* ---------------- 控件创建与维护 ---------------- */

  /**
   * 未绑定控件的占位字段名：先占住唯一 key，绑定数据库字段后会改成 toCamel(列名)。
   */
  function nextPlaceholderName(): string {
    const used = new Set(fields.value.map((field) => field.name));
    let index = fields.value.length + 1;
    while (used.has(`field_${index}`)) index += 1;
    return `field_${index}`;
  }

  /** 新建一个控件（自动关联空闲字段，否则建成未绑定）；插入位置由调用方决定 */
  function createControl(type: DevFieldType): DevFormField {
    const used = new Set(fields.value.map((field) => field.columnName).filter(Boolean));
    // 展示型控件不抢占数据库列，默认不绑定；用户需要时仍可在右侧手动选择
    const column = isDisplayOnly(type)
      ? undefined
      : businessColumns.value.find(
          (item) => !used.has(item.columnName) && allowedTypes(item).includes(type),
        );

    // 有空闲字段就自动关联，没有也让用户继续拖：先建未绑定控件，进第 3 步前统一校验
    const field = column ? createMappedField(column) : createUnboundField(type, nextPlaceholderName());
    field.type = type;
    field.label = column ? column.comment || column.columnName : typeLabels[type];
    field.required = column ? !column.nullable : false;
    field.options = defaultOptionsFor(type);
    applyTypeDefaults(field, type);
    // 高级控件（关联表单 / 弹框选择）补齐数据源默认配置
    applyPickerDefaults(field);

    // 新加的已绑定字段默认进入列表列（与旧行为一致）
    if (
      column &&
      !listConfig.listColumns.some(
        (item) => item.source === 'master' && item.columnName === column.columnName,
      )
    ) {
      listConfig.listColumns.push(
        createListDraft({ source: 'master', tableName: '', columnName: column.columnName }),
      );
    }
    return field;
  }

  function addControl(type: DevFieldType, insertAt?: number): void {
    const field = createControl(type);
    fields.value.push(field);
    // 插到画布统一序列的指定位置（点击添加 = 追加到末尾）
    insertCanvasIds([field.id], insertAt ?? canvasItems.value.length);
    syncListFieldsFromColumns();
    selectedId.value = field.id;
    selection.propsTab.value = 'field';
    resetPreviewModel();
    markDirty();
  }

  /** 复制控件：保留类型/标题/样式，解除字段绑定（同一列不允许映射两次），插到原控件后面 */
  function duplicateField(field: DevFormField): void {
    const copy: DevFormField = JSON.parse(JSON.stringify(field));
    copy.id = newId();
    copy.name = nextPlaceholderName();
    copy.columnName = '';
    copy.required = false;
    copy.label = field.label ? `${field.label}副本` : typeLabels[field.type];
    fields.value.push(copy);
    const ids = canvasItems.value.map((item) => item.id);
    insertCanvasIds([copy.id], ids.indexOf(field.id) + 1);
    resetPreviewModel();
    selection.selectField(copy.id);
    markDirty();
  }

  function resetPreviewModel(): void {
    for (const key of Object.keys(previewModel)) delete previewModel[key];
    for (const field of fields.value) previewModel[field.name] = defaultFor(field);
  }

  function generateFieldsFromTable(options = { listAll: true }): void {
    fields.value = businessColumns.value.map(createMappedField);
    selectedId.value = fields.value[0]?.id ?? null;
    if (options.listAll) {
      listConfig.listColumns = businessColumns.value.map((column) =>
        createListDraft({ source: 'master', tableName: '', columnName: column.columnName }),
      );
    }
    const firstString = businessColumns.value.find(
      (column) => column.type === 'varchar' || column.type === 'text',
    );
    listConfig.queryColumns = firstString
      ? [list.createQueryDraft({ source: 'master', tableName: '', columnName: firstString.columnName })]
      : [];
    syncListFieldsFromColumns();
    resetPreviewModel();
    markDirty();
  }

  function removeField(field: DevFormField): void {
    const index = fields.value.indexOf(field);
    if (index < 0) return;
    const column = field.columnName ? columnMap.value.get(field.columnName) : null;
    if (column && !column.nullable) {
      ElMessage.warning('非空数据库字段必须在表单中');
      return;
    }
    fields.value.splice(index, 1);
    selection.removeCodeFieldRefs(field.name);
    if (field.columnName) {
      listConfig.listColumns = listConfig.listColumns.filter(
        (item) => !(item.source === 'master' && item.columnName === field.columnName),
      );
      listConfig.queryColumns = listConfig.queryColumns.filter(
        (item) => !(item.source === 'master' && item.columnName === field.columnName),
      );
      syncListFieldsFromColumns();
    }
    if (selectedId.value === field.id) selectedId.value = null;
    markDirty();
  }

  function handleFieldTypeChange(field: DevFormField): void {
    if (['select', 'radio', 'checkbox'].includes(field.type) && field.options.length === 0) {
      field.options = defaultOptionsFor(field.type);
    }
    if (field.type === 'switch') field.defaultValue = false;
    if (field.type === 'slider' && field.min === undefined) {
      field.min = 0;
      field.max = 100;
      field.step = 1;
    }
    if ((field.type === 'qrcode' || field.type === 'barcode') && !field.codeSource) {
      field.codeSource = 'fixed';
      field.codeValue = '';
      field.codeFields = [];
      field.codeSeparator = '';
    }
    applyDateFormatDefault(field, field.type);
    applyPickerDefaults(field);
    applyUploadDefaults(field, field.type);
    // 切到上传控件时补一遍允许类型：图片只收图片、文件不限（已有配置不覆盖）
    if ((field.type === 'image' || field.type === 'file') && (field.acceptTypes?.length ?? 0) === 0) {
      field.acceptTypes = field.type === 'image' ? ['image'] : [];
    }
    resetPreviewModel();
    markDirty();
  }

  function columnOptionsFor(_field: DevFormField): SyncedColumn[] {
    return businessColumns.value;
  }

  function isColumnUsedByOther(column: SyncedColumn, field: DevFormField): boolean {
    return fields.value.some((item) => item.id !== field.id && item.columnName === column.columnName);
  }

  /** 未绑定控件可选的控件类型；绑定数据库字段后再按列类型收敛 */
  function typeOptionsOf(field: DevFormField | null): DevFieldType[] {
    const column = field?.columnName ? columnMap.value.get(field.columnName) : null;
    return column ? allowedTypes(column) : allFieldTypes;
  }

  function handleSelectedColumnChange(value?: string | null): void {
    const field = selectedField.value;
    if (!field) return;
    const previousName = field.name;

    // 清空选择 = 解除绑定：字段名回到占位值，第 3 步里指向该列的查询/列表行一并摘掉
    if (!value) {
      const previous = field.columnName;
      field.columnName = '';
      field.name = nextPlaceholderName();
      field.required = false;
      selection.renameCodeFieldRefs(previousName, field.name);
      if (previous) {
        listConfig.queryColumns = listConfig.queryColumns.filter(
          (item) => !(item.source === 'master' && item.columnName === previous),
        );
        listConfig.listColumns = listConfig.listColumns.filter(
          (item) => !(item.source === 'master' && item.columnName === previous),
        );
        syncListFieldsFromColumns();
      }
      resetPreviewModel();
      markDirty();
      return;
    }

    const usedByOther = fields.value.some((item) => item.id !== field.id && item.columnName === value);
    if (usedByOther) {
      ElMessage.warning('该数据库字段已被其他控件使用');
      return;
    }
    const previous = field.columnName;
    const column = columnMap.value.get(value);
    if (!column) return;

    field.columnName = value;
    field.name = toCamel(column.columnName);
    selection.renameCodeFieldRefs(previousName, field.name);
    field.required = !column.nullable;
    if (!allowedTypes(column).includes(field.type)) {
      field.type = defaultType(column);
      field.options = defaultOptionsFor(field.type);
      if (field.type === 'switch') field.defaultValue = false;
    }
    if (previous) {
      // 第 3 步的查询/列表行跟着换列，避免指向已经不存在的旧列
      for (const item of [...listConfig.queryColumns, ...listConfig.listColumns]) {
        if (item.source === 'master' && item.columnName === previous) item.columnName = value;
      }
    }
    if (
      !listConfig.listColumns.some((item) => item.source === 'master' && item.columnName === value)
    ) {
      listConfig.listColumns.push(
        createListDraft({ source: 'master', tableName: '', columnName: value }),
      );
    }
    syncListFieldsFromColumns();
    resetPreviewModel();
    markDirty();
  }

  /** 选项编辑同时服务主表字段与明细列 */
  function editingField(): DevFormField | null {
    return selectedField.value ?? (selectedSubColumn.value as DevFormField | null);
  }

  function addOption(): void {
    const field = editingField();
    if (!field) return;
    const index = field.options.length + 1;
    field.options.push({ label: `选项${index}`, value: `option${index}` });
    markDirty();
  }

  function removeOption(index: number): void {
    editingField()?.options.splice(index, 1);
    markDirty();
  }

  /* ---------------- 高级控件数据源 ---------------- */

  interface PickerSourceOption {
    value: number;
    label: string;
  }
  const publishedFormOptions = ref<PickerSourceOption[]>([]);
  const publishedApiOptions = ref<PickerSourceOption[]>([]);
  const pickerSourceLoading = ref(false);
  const pickerFieldsLoading = ref(false);
  /** 结果列候选：存储字段 / 回显字段 / 列表字段 */
  const pickerFieldOptions = ref<DevDataPickerColumn[]>([]);
  /** 搜索键候选：关联表单=目标表单查询字段；弹框选择=接口声明的参数 */
  const pickerKeywordOptions = ref<DevDataPickerColumn[]>([]);

  /** 当前正在右侧属性面板编辑的弹框选择器字段（子表列优先） */
  const activePickerField = computed<DevFormField | null>(() => {
    const field = (selectedSubColumn.value ?? selectedField.value) as DevFormField | null;
    return field && isPickerType(field.type) ? field : null;
  });

  const pickerSourceOptions = computed<PickerSourceOption[]>(() =>
    activePickerField.value?.type === 'dialogSelect'
      ? publishedApiOptions.value
      : publishedFormOptions.value,
  );
  const pickerSourceHint = computed(() =>
    activePickerField.value?.type === 'dialogSelect'
      ? '只展示已发布、可用于查询的数据接口（静态数据 / SQL 查询）'
      : '只展示已发布的表单；弹框里的数据来自该表单的真实业务数据',
  );

  /** 打开设计器时拉一次两类数据源（都是已发布才允许被引用） */
  async function loadPickerSources(): Promise<void> {
    pickerSourceLoading.value = true;
    try {
      const [forms, apis] = await Promise.all([
        listDevForms({ page: 1, pageSize: 200, status: 'PUBLISHED' }),
        listDevApis({ page: 1, pageSize: 200, status: 'PUBLISHED' }),
      ]);
      publishedFormOptions.value = forms.list.map((item) => ({
        value: item.id,
        label: `${item.name}（${item.formKey}）`,
      }));
      publishedApiOptions.value = apis.list
        .filter((item) => item.category === 'STATIC' || item.action === 'QUERY')
        .map((item) => ({
          value: item.id,
          label: `${item.name}（${item.apiKey}）`,
        }));
    } catch {
      // 错误提示由 request 拦截器统一处理
    } finally {
      pickerSourceLoading.value = false;
    }
  }

  /** 选中数据源后读取它的结果列，供「存储 / 回显 / 列表 / 搜索」四个下拉使用 */
  async function loadPickerMetadata(): Promise<void> {
    const field = activePickerField.value;
    // 用户 / 角色选择的数据源是内置的，弹框列由控件兜底，不需要拉元数据
    if (field && isBuiltinPickerType(field.type)) {
      pickerFieldOptions.value = [];
      pickerKeywordOptions.value = [];
      return;
    }
    if (!field || !field.sourceId) {
      pickerFieldOptions.value = [];
      pickerKeywordOptions.value = [];
      return;
    }
    pickerFieldsLoading.value = true;
    try {
      if (field.type === 'relationForm') {
        const detail = await getDevForm(Number(field.sourceId));
        // 预览接口返回的行键是表单字段名 field.name，另附主键 id
        const columns: DevDataPickerColumn[] = [{ key: 'id', label: 'ID（主键）' }];
        for (const item of detail.schema.fields ?? []) {
          if (!item.name) continue;
          columns.push({ key: item.name, label: item.label || item.name });
        }
        pickerFieldOptions.value = columns;
        const queryKeys = (detail.schema.list?.queryColumns ?? [])
          .map((item) => item.field || item.columnName)
          .filter(Boolean) as string[];
        pickerKeywordOptions.value = queryKeys.length
          ? queryKeys.map((key) => ({
              key,
              label: columns.find((item) => item.key === key)?.label || key,
            }))
          : columns;
      } else {
        const detail = await getDevApi(Number(field.sourceId));
        // 接口运行结果的键是字段映射里的 outputKey，隐藏列不会出现在结果里
        pickerFieldOptions.value = (detail.config.fieldMappings ?? [])
          .filter((item) => !item.hidden)
          .map((item) => ({ key: item.outputKey, label: item.label || item.outputKey }));
        pickerKeywordOptions.value = (detail.config.params ?? []).map((item) => ({
          key: item.key,
          label: item.label || item.key,
        }));
      }
    } catch {
      pickerFieldOptions.value = [];
      pickerKeywordOptions.value = [];
      // 错误提示由 request 拦截器统一处理
    } finally {
      pickerFieldsLoading.value = false;
    }
  }

  watch(
    () => {
      const field = activePickerField.value;
      return field ? `${field.type}:${field.sourceId ?? ''}` : '';
    },
    () => void loadPickerMetadata(),
    { immediate: true },
  );

  function handlePickerSourceChange(value?: number | null): void {
    const field = activePickerField.value;
    if (!field) return;
    field.sourceId = value ?? null;
    field.sourceName = pickerSourceOptions.value.find((item) => item.value === value)?.label ?? '';
    // 换数据源后旧字段引用失效，清空让用户重新选
    field.valueField = '';
    field.displayField = '';
    field.listFields = [];
    field.keywordKey = '';
    markDirty();
  }

  function handlePickerListFieldsChange(keys: string[]): void {
    const field = activePickerField.value;
    if (!field) return;
    field.listFields = keys.map((key) => ({
      key,
      label: pickerFieldOptions.value.find((item) => item.key === key)?.label || key,
    }));
    markDirty();
  }

  function handlePickerMultipleChange(value: boolean | string | number): void {
    const field = activePickerField.value;
    if (!field) return;
    field.multiple = Boolean(value);
    markDirty();
  }

  /** 弹框选择器配置完整性：保存 / 下一步 / 发布时统一校验 */
  function validatePickerConfig(label: string, field: DevFormField): string | null {
    // 内置数据源（用户 / 角色）没有可配置项，只需要绑定字符串列
    if (isBuiltinPickerType(field.type)) return null;
    if (!field.sourceId) return `字段「${label}」尚未选择数据来源（已发布表单 / 数据接口）`;
    if (!field.valueField) return `字段「${label}」尚未配置「存储字段」`;
    if (!field.displayField) return `字段「${label}」尚未配置「回显字段」`;
    if (!field.listFields?.length) return `字段「${label}」至少配置一个「列表字段」`;
    return null;
  }

  return {
    columns,
    labelWidth,
    formSettings,
    previewModel,
    selectedColumn,
    controlWidthText,
    applyControlWidth,
    nextPlaceholderName,
    createControl,
    addControl,
    duplicateField,
    resetPreviewModel,
    generateFieldsFromTable,
    removeField,
    handleFieldTypeChange,
    columnOptionsFor,
    isColumnUsedByOther,
    typeOptionsOf,
    handleSelectedColumnChange,
    editingField,
    addOption,
    removeOption,
    publishedFormOptions,
    publishedApiOptions,
    pickerSourceLoading,
    pickerFieldsLoading,
    pickerFieldOptions,
    pickerKeywordOptions,
    activePickerField,
    pickerSourceOptions,
    pickerSourceHint,
    loadPickerSources,
    handlePickerSourceChange,
    handlePickerListFieldsChange,
    handlePickerMultipleChange,
    validatePickerConfig,
  };
}

export type FieldModel = ReturnType<typeof useFieldModel>;

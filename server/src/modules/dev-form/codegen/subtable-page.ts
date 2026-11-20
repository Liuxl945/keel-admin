/**
 * 子表前端代码生成：生成自包含的 SubTableFieldControl.vue + SubTableEditor.vue，
 * 复用公共 form-controls（与在线预览同一套控件），可直接落地到 biz 目录。
 */

import type { DevFormSchemaInput } from '../dev-form.dto';
import type { DetailsCodegenInput } from '../../dev-model/dev-model.codegen';
import { js } from './shared';

type SubColumn = DevFormSchemaInput['subtables'][number]['columns'][number];

/** 控件类型 → 公共控件组件名 */
const CONTROL_COMPONENT: Record<string, string> = {
  input: 'TextControl',
  textarea: 'TextControl',
  number: 'TextControl',
  select: 'ChoiceControl',
  radio: 'ChoiceControl',
  checkbox: 'ChoiceControl',
  date: 'DateControl',
  datetime: 'DateControl',
  switch: 'SwitchControl',
  slider: 'SliderControl',
  color: 'ColorPickerControl',
  image: 'ImageUploadControl',
  file: 'FileUploadControl',
  qrcode: 'QrCodeControl',
  barcode: 'BarCodeControl',
  relationForm: 'RelationFormControl',
  dialogSelect: 'DialogSelectControl',
  userSelect: 'UserSelectControl',
  roleSelect: 'RoleSelectControl',
};

/** 该表单是否用到某类控件 */
function usesType(schema: DevFormSchemaInput, types: string[]): boolean {
  return schema.subtables.some((sub) => sub.columns.some((col) => types.includes(col.type)));
}

/**
 * 生成 SubTableFieldControl.vue：明细行的控件分派器（等价于在线预览的 FieldControl）。
 * 自带上传/关联/弹框/用户/角色取数回调，只依赖公共控件库与项目 API。
 */
export function generateSubTableFieldControl(schema: DevFormSchemaInput): string {
  const needUpload = usesType(schema, ['image', 'file']);
  const needRelation = usesType(schema, ['relationForm']);
  const needDialog = usesType(schema, ['dialogSelect']);
  const needUser = usesType(schema, ['userSelect']);
  const needRole = usesType(schema, ['roleSelect']);
  const needQr = usesType(schema, ['qrcode', 'barcode']);

  const imports: string[] = [
    "import { computed } from 'vue';",
    "import type { CommonField, DataFetchHandler, UploadHandler } from '@/components/form-controls';",
  ];
  const components = new Set<string>();
  for (const sub of schema.subtables) {
    for (const col of sub.columns) {
      const comp = CONTROL_COMPONENT[col.type];
      if (comp) components.add(comp);
    }
  }
  if (components.size > 0) {
    imports.push(`import { ${[...components].sort().join(', ')} } from '@/components/form-controls';`);
  }
  if (needUpload) imports.push("import { uploadFile } from '@/api/upload';");
  if (needRelation) imports.push("import { listPreviewRecords } from '@/api/dev-form-preview';");
  if (needDialog) imports.push("import { runDevApi } from '@/api/dev-api';");
  if (needUser) imports.push("import { listUsers } from '@/api/user';");
  if (needRole) imports.push("import { listRoles } from '@/api/role';");

  const setups: string[] = [];
  if (needUpload) {
    setups.push([
      'const uploadHandler: UploadHandler = async (file, onProgress) => {',
      '  const result = await uploadFile(file, { onProgress });',
      '  return { url: result.url, name: result.name };',
      '};',
    ].join('\n'));
  }
  if (needRelation) {
    setups.push([
      'const relationFormFetch: DataFetchHandler = async (query) => {',
      '  const params: Record<string, unknown> = { page: query.page, pageSize: query.pageSize };',
      '  if (query.keyword && query.keywordKey) params[query.keywordKey] = query.keyword;',
      '  const result = await listPreviewRecords(Number(query.sourceId), params);',
      '  return { rows: result.list as Record<string, unknown>[], total: result.total };',
      '};',
    ].join('\n'));
  }
  if (needDialog) {
    setups.push([
      'const dialogSelectFetch: DataFetchHandler = async (query) => {',
      '  const params: Record<string, string | number | boolean | null> = {};',
      '  if (query.keyword && query.keywordKey) params[query.keywordKey] = query.keyword;',
      '  const result = await runDevApi(Number(query.sourceId), { params, page: query.page, pageSize: query.pageSize });',
      "  const rows = (result.rows ?? []).filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row));",
      '  return { rows, total: result.total ?? rows.length };',
      '};',
    ].join('\n'));
  }
  if (needUser) {
    setups.push([
      'const userSelectFetch: DataFetchHandler = async (query) => {',
      '  const result = await listUsers({ page: query.page, pageSize: query.pageSize, keyword: query.keyword || undefined });',
      '  return { rows: (result.list ?? []) as unknown as Record<string, unknown>[], total: result.total ?? 0 };',
      '};',
    ].join('\n'));
  }
  if (needRole) {
    setups.push([
      'const roleSelectFetch: DataFetchHandler = async (query) => {',
      '  const result = await listRoles({ page: query.page, pageSize: query.pageSize, keyword: query.keyword || undefined });',
      '  return { rows: (result.list ?? []) as unknown as Record<string, unknown>[], total: result.total ?? 0 };',
      '};',
    ].join('\n'));
  }

  const chain: string[] = [];
  const branch = (types: string[], component: string, extra: string) => {
    const directive = chain.length === 0 ? 'v-if' : 'v-else-if';
    const cond = types.length === 1
      ? `field.type === '${types[0]}'`
      : `[${types.map((t) => `'${t}'`).join(', ')}].includes(field.type)`;
    chain.push(`    <${component} ${directive}="${cond}" v-model="model" :field="field"${extra} />`);
  };
  if (components.has('TextControl')) branch(['input', 'textarea', 'number'], 'TextControl', ' :disabled="disabled"');
  if (components.has('ChoiceControl')) branch(['select', 'radio', 'checkbox'], 'ChoiceControl', ' :disabled="disabled"');
  if (components.has('DateControl')) branch(['date', 'datetime'], 'DateControl', ' :disabled="disabled"');
  if (components.has('SwitchControl')) branch(['switch'], 'SwitchControl', ' :disabled="disabled"');
  if (components.has('SliderControl')) branch(['slider'], 'SliderControl', ' :disabled="disabled"');
  if (components.has('ColorPickerControl')) branch(['color'], 'ColorPickerControl', ' :disabled="disabled"');
  if (components.has('ImageUploadControl')) branch(['image'], 'ImageUploadControl', ' :upload="uploadHandler" :disabled="disabled"');
  if (components.has('FileUploadControl')) branch(['file'], 'FileUploadControl', ' :upload="uploadHandler" :disabled="disabled"');
  if (components.has('QrCodeControl')) branch(['qrcode'], 'QrCodeControl', ' :values="values" :code-labels="codeLabels"');
  if (components.has('BarCodeControl')) branch(['barcode'], 'BarCodeControl', ' :values="values" :code-labels="codeLabels"');
  if (components.has('RelationFormControl')) branch(['relationForm'], 'RelationFormControl', ' :fetch="relationFormFetch" :disabled="disabled"');
  if (components.has('DialogSelectControl')) branch(['dialogSelect'], 'DialogSelectControl', ' :fetch="dialogSelectFetch" :disabled="disabled"');
  if (components.has('UserSelectControl')) branch(['userSelect'], 'UserSelectControl', ' :fetch="userSelectFetch" :disabled="disabled"');
  if (components.has('RoleSelectControl')) branch(['roleSelect'], 'RoleSelectControl', ' :fetch="roleSelectFetch" :disabled="disabled"');

  return [
    '<script setup lang="ts">',
    "defineOptions({ name: 'SubTableFieldControl' });",
    ...imports,
    '',
    "/** 明细列配置：type 必填（CommonField 里是可选的，这里收紧以便模板按类型分派） */",
    'type SubField = CommonField & { type: string };',
    'const props = defineProps<{',
    '  field: SubField;',
    '  modelValue: any;',
    '  disabled?: boolean;',
    '  values?: Record<string, any>;',
    '  codeLabels?: Record<string, string>;',
    '}>();',
    "const emit = defineEmits<{ 'update:modelValue': [value: any] }>();",
    'const model = computed({',
    '  get: () => props.modelValue,',
    "  set: (value) => emit('update:modelValue', value),",
    '});',
    ...(needQr ? ['const codeLabels = computed(() => props.codeLabels ?? {});', 'const values = computed(() => props.values ?? {});'] : []),
    ...setups,
    '</script>',
    '',
    '<template>',
    ...chain,
    `    <el-input ${chain.length > 0 ? 'v-else' : 'v-if="true"'} v-model="model" :disabled="disabled" />`,
    '</template>',
    '',
  ].join('\n');
}

/** 生成一份 CommonField 配置对象的源码（缩进 12 空格，嵌入 columns 数组） */
function fieldConfigObject(col: SubColumn, indentSpaces = 12): string {
  const body: Record<string, unknown> = {
    type: col.type,
    label: col.label,
    placeholder: col.placeholder || '',
  };
  if (['select', 'radio', 'checkbox'].includes(col.type)) body.options = col.options ?? [];
  if (col.type === 'textarea') body.rows = col.rows ?? 4;
  if (['number', 'slider'].includes(col.type)) {
    if (col.min !== undefined && col.min !== null) body.min = col.min;
    if (col.max !== undefined && col.max !== null) body.max = col.max;
  }
  if (['image', 'file'].includes(col.type)) {
    body.maxCount = col.maxCount ?? 9;
    body.maxSize = col.maxSize ?? 10;
    body.accept = col.accept || '';
    body.acceptTypes = col.acceptTypes ?? [];
  }
  if (['relationForm', 'dialogSelect', 'userSelect', 'roleSelect'].includes(col.type)) {
    body.sourceId = col.sourceId ?? null;
    body.valueField = col.valueField ?? '';
    body.displayField = col.displayField ?? '';
    body.listFields = col.listFields ?? [];
    body.multiple = Boolean(col.multiple);
    body.keywordKey = col.keywordKey ?? '';
    body.pickerTitle = col.pickerTitle || col.label || '';
  }
  const pad = ' '.repeat(indentSpaces);
  const entries = Object.entries(body)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${pad}  ${key}: ${JSON.stringify(value)},`);
  return [`${pad}field: {`, ...entries, `${pad}},`].join('\n');
}

/**
 * 列表页里子表聚合列的 ProTableColumn 定义。
 * 后端 list 返回 row.details[<tableName>][]（见 service 的 aggregate），这里把多行聚合成文本展示。
 */
export function subTableListColumns(details: DetailsCodegenInput): {
  lines: string[];
  setups: string[];
} {
  const lines: string[] = [];
  const setups: string[] = [];
  for (const detail of details) {
    for (const col of detail.listColumns) {
      const prop = `sub_${detail.tableName}_${col.columnName}`;
      const label = `${detail.label}·${col.label}`;
      const fn = `formatSub_${detail.tableName}_${col.columnName}`;
      setups.push([
        `const ${fn} = (row: any): string => {`,
        `  const list: any[] = row?.details?.[${js(detail.tableName)}] ?? [];`,
        `  const values = list`,
        `    .map((item: any) => item?.${col.fieldName})`,
        `    .filter((value: any) => value !== null && value !== undefined && value !== '');`,
        `  return values.length > 0 ? values.join('、') : '-';`,
        `};`,
      ].join('\n'));
      lines.push(`  { prop: ${js(prop)}, label: ${js(label)}, minWidth: 160, sortable: false, formatter: ${fn} },`);
    }
  }
  return { lines, setups };
}

/**
 * 生成 SubTableEditor.vue：管理当前表单的全部子表（行内/弹窗录入、增删改）。
 * column 直接携带 CommonField 配置，模板里用 SubTableFieldControl 渲染。
 */
export function generateSubTableEditor(
  schema: DevFormSchemaInput,
  details: DetailsCodegenInput,
): string {
  const detailByTable = new Map(details.map((d) => [d.tableName, d]));
  const subs = schema.subtables.filter((sub) => detailByTable.has(sub.tableName));
  const needUploadCell = subs.some((sub) =>
    sub.columns.some((col) => ['image', 'file'].includes(col.type)),
  );

  // 生成列配置源码片段（供 subtableMeta 常量使用）
  const subMetaLines: string[] = ['const subtableMeta: SubtableMeta[] = ['];
  for (const sub of subs) {
    const listNames = new Set(sub.listFields);
    subMetaLines.push('  {');
    subMetaLines.push(`    tableName: ${js(sub.tableName)},`);
    subMetaLines.push(`    label: ${js(sub.label)},`);
    subMetaLines.push(`    mode: ${js(sub.mode || 'table')},`);
    subMetaLines.push('    columns: [');
    for (const col of sub.columns.filter((c) => c.visible !== false)) {
      subMetaLines.push('      {');
      subMetaLines.push(`        name: ${js(col.name)},`);
      subMetaLines.push(`        columnName: ${js(col.columnName)},`);
      subMetaLines.push(`        label: ${js(col.label)},`);
      subMetaLines.push(`        type: ${js(col.type)},`);
      subMetaLines.push(`        inList: ${listNames.has(col.columnName) || sub.listFields.length === 0},`);
      subMetaLines.push(`        required: ${Boolean(col.required)},`);
      subMetaLines.push(fieldConfigObject(col, 8));
      subMetaLines.push('      },');
    }
    subMetaLines.push('    ],');
    subMetaLines.push('  },');
  }
  subMetaLines.push('];');

  return [
    '<script setup lang="ts">',
    "defineOptions({ name: 'GeneratedSubTableEditor' });",
    '',
    "import { computed, nextTick, reactive, ref } from 'vue';",
    "import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';",
    "import AppDialog from '@/components/AppDialog/index.vue';",
    "import type { CommonField } from '@/components/form-controls';",
    ...(needUploadCell ? ["import UploadCell from '@/components/form-controls/UploadCell.vue';"] : []),
    "import SubTableFieldControl from './SubTableFieldControl.vue';",
    '',
    'type DetailRow = Record<string, any> & { id?: number; __key?: string };',
    'type SubField = CommonField & { type: string };',
    'interface SubColumn {',
    '  name: string;',
    '  columnName: string;',
    '  label: string;',
    '  type: string;',
    '  inList: boolean;',
    '  required: boolean;',
    '  field: SubField;',
    '}',
    'interface SubtableMeta {',
    '  tableName: string;',
    '  label: string;',
    '  mode: string;',
    '  columns: SubColumn[];',
    '}',
    '',
    'const props = defineProps<{',
    '  modelValue: Record<string, DetailRow[]>;',
    '  readonly?: boolean;',
    '}>();',
    "const emit = defineEmits<{ 'update:modelValue': [value: Record<string, DetailRow[]>] }>();",
    '',
    ...subMetaLines,
    '',
    'const readonly = computed(() => Boolean(props.readonly));',
    'const rows = computed(() => props.modelValue ?? {});',
    'function listOf(tableName: string): DetailRow[] { return rows.value[tableName] ?? []; }',
    'function replaceRows(tableName: string, next: DetailRow[]): void {',
    "  emit('update:modelValue', { ...rows.value, [tableName]: next });",
    '}',
    '',
    'let seed = 0;',
    'function nextKey(): string { seed += 1; return `r${Date.now().toString(36)}_${seed}`; }',
    'function defaultValue(col: SubColumn): any {',
    "  if (col.type === 'switch') return false;",
    "  if (col.type === 'checkbox') return [];",
    "  if (col.type === 'slider') return 0;",
    "  if (['number', 'date', 'datetime'].includes(col.type)) return null;",
    "  return '';",
    '}',
    'function createRow(sub: SubtableMeta): DetailRow {',
    '  const row: DetailRow = { __key: nextKey() };',
    '  for (const col of sub.columns) row[col.name] = defaultValue(col);',
    '  return row;',
    '}',
    '',
    '/* -------- 行内编辑 -------- */',
    'const editingKey = reactive<Record<string, string | null>>({});',
    'const backups = reactive<Record<string, DetailRow | null>>({});',
    'function ensureKey(row: DetailRow): string { if (!row.__key) row.__key = nextKey(); return row.__key; }',
    'function isEditing(tableName: string, row: DetailRow): boolean {',
    '  return editingKey[tableName] != null && row.__key === editingKey[tableName];',
    '}',
    'function startInline(tableName: string, row: DetailRow): void {',
    '  editingKey[tableName] = ensureKey(row);',
    '  backups[tableName] = { ...row };',
    '}',
    'function commitInline(tableName: string, row: DetailRow): void {',
    '  const sub = subtableMeta.find((s) => s.tableName === tableName);',
    '  if (sub) {',
    '    for (const col of sub.columns) {',
    '      if (!col.required) continue;',
    '      const value = row[col.name];',
    "      const empty = value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);",
    '      if (empty) { ElMessage.warning(`请填写${col.label}`); return; }',
    '    }',
    '  }',
    '  editingKey[tableName] = null;',
    '  backups[tableName] = null;',
    '}',
    'function cancelInline(tableName: string, row: DetailRow): void {',
    '  const backup = backups[tableName];',
    '  if (backup) Object.assign(row, backup);',
    '  editingKey[tableName] = null;',
    '  backups[tableName] = null;',
    '}',
    '',
    '/* -------- 弹窗编辑 -------- */',
    'const dialogVisible = ref(false);',
    'const dialogTable = ref(\'\');',
    'const dialogTargetKey = ref<string | null>(null);',
    'const dialogForm = reactive<Record<string, any>>({});',
    'const dialogFormRef = ref<FormInstance>();',
    'const dialogColumns = computed<SubColumn[]>(() => subtableMeta.find((s) => s.tableName === dialogTable.value)?.columns ?? []);',
    'const dialogRules = computed<FormRules>(() => {',
    '  const result: FormRules = {};',
    '  for (const col of dialogColumns.value) {',
    '    if (!col.required) continue;',
    "    const choice = ['select','radio','checkbox','date','datetime','slider','color','file','image','qrcode','barcode'].includes(col.type);",
    "    result[col.name] = [{ required: true, message: `请${choice ? '选择' : '输入'}${col.label}`, trigger: choice ? 'change' : 'blur' }];",
    '  }',
    '  return result;',
    '});',
    'const dialogTitle = computed(() => {',
    '  const sub = subtableMeta.find((s) => s.tableName === dialogTable.value);',
    "  return `${dialogTargetKey.value ? '编辑' : '新增'}${sub?.label ?? '明细'}`;",
    '});',
    'function openDialog(tableName: string, row: DetailRow | null): void {',
    '  dialogTable.value = tableName;',
    '  dialogTargetKey.value = row ? ensureKey(row) : null;',
    '  const sub = subtableMeta.find((s) => s.tableName === tableName)!;',
    '  const source = row ?? createRow(sub);',
    '  for (const key of Object.keys(dialogForm)) delete dialogForm[key];',
    '  for (const col of sub.columns) {',
    '    const value = source[col.name];',
    '    dialogForm[col.name] = value === undefined ? defaultValue(col) : value;',
    '  }',
    '  dialogVisible.value = true;',
    '  void nextTick(() => dialogFormRef.value?.clearValidate());',
    '}',
    'function saveDialog(): void {',
    '  void dialogFormRef.value?.validate((valid) => {',
    '    if (!valid) return;',
    '    const tableName = dialogTable.value;',
    '    if (dialogTargetKey.value) {',
    '      const target = listOf(tableName).find((row) => row.__key === dialogTargetKey.value);',
    '      if (target) Object.assign(target, dialogForm);',
    '    } else {',
    '      replaceRows(tableName, [...listOf(tableName), { ...dialogForm, __key: nextKey() }]);',
    '    }',
    '    dialogVisible.value = false;',
    '  });',
    '}',
    '',
    '/* -------- 公共操作 -------- */',
    'function addRow(sub: SubtableMeta): void {',
    '  if (readonly.value) return;',
    "  if (sub.mode === 'table') {",
    '    const row = createRow(sub);',
    '    replaceRows(sub.tableName, [...listOf(sub.tableName), row]);',
    '    startInline(sub.tableName, row);',
    '  } else {',
    '    openDialog(sub.tableName, null);',
    '  }',
    '}',
    'function editRow(sub: SubtableMeta, row: DetailRow): void {',
    '  if (readonly.value) return;',
    "  if (sub.mode === 'table') startInline(sub.tableName, row);",
    '  else openDialog(sub.tableName, row);',
    '}',
    'async function removeRow(sub: SubtableMeta, row: DetailRow): Promise<void> {',
    '  if (readonly.value) return;',
    '  try {',
    '    await ElMessageBox.confirm(`确定删除该条${sub.label}明细吗？`, \'删除确认\', { type: \'warning\' });',
    '  } catch { return; }',
    '  replaceRows(sub.tableName, listOf(sub.tableName).filter((item) => item !== row));',
    '}',
    'function display(col: SubColumn, row: DetailRow): string {',
    "  const value = row[col.name];",
    "  if (value === null || value === undefined || value === '') return '-';",
    '  return String(value);',
    '}',
    '</script>',
    '',
    '<template>',
    '  <div class="generated-subtable">',
    '    <div v-for="sub in subtableMeta" :key="sub.tableName" class="generated-subtable__block">',
    '      <div class="generated-subtable__head">',
    '        <span class="generated-subtable__title">{{ sub.label }}</span>',
    '        <el-button v-if="!readonly" size="small" type="primary" plain @click="addRow(sub)">添加明细</el-button>',
    '      </div>',
    '      <el-table :data="listOf(sub.tableName)" size="default" border :empty-text="`暂无${sub.label}明细`">',
    '        <el-table-column type="index" label="#" width="48" align="center" />',
    '        <el-table-column v-for="col in sub.columns.filter((c) => c.inList)" :key="col.name" :label="col.label" min-width="160" :show-overflow-tooltip="![\'image\',\'file\'].includes(col.type)">',
    '          <template #default="{ row }">',
    '            <SubTableFieldControl',
    '              v-if="isEditing(sub.tableName, row)"',
    '              :field="col.field"',
    '              v-model="row[col.name]"',
    '              :values="row"',
    '              :code-labels="{}"',
    '            />',
    ...(needUploadCell
      ? ['            <UploadCell v-else-if="col.type === \'image\' || col.type === \'file\'" :type="col.type" :value="row[col.name]" />']
      : []),
    '            <span v-else>{{ display(col, row) }}</span>',
    '          </template>',
    '        </el-table-column>',
    '        <el-table-column v-if="!readonly" label="操作" width="140" fixed="right">',
    '          <template #default="{ row }">',
    '            <template v-if="isEditing(sub.tableName, row)">',
    '              <el-button link type="primary" @click="commitInline(sub.tableName, row)">确定</el-button>',
    '              <el-button link @click="cancelInline(sub.tableName, row)">取消</el-button>',
    '            </template>',
    '            <template v-else>',
    '              <el-button link type="primary" @click="editRow(sub, row)">编辑</el-button>',
    '              <el-button link type="danger" @click="removeRow(sub, row)">删除</el-button>',
    '            </template>',
    '          </template>',
    '        </el-table-column>',
    '      </el-table>',
    '    </div>',
    '',
    '    <AppDialog v-model="dialogVisible" :title="dialogTitle" width="640px">',
    '      <el-form ref="dialogFormRef" :model="dialogForm" :rules="dialogRules" label-width="100px" size="small">',
    '        <el-row :gutter="16">',
    '          <el-col v-for="col in dialogColumns" :key="col.name" :span="12">',
    '            <el-form-item :label="col.label" :prop="col.name">',
    '              <SubTableFieldControl :field="col.field" v-model="dialogForm[col.name]" :values="dialogForm" :code-labels="{}" />',
    '            </el-form-item>',
    '          </el-col>',
    '        </el-row>',
    '      </el-form>',
    '      <template #footer>',
    '        <el-button @click="dialogVisible = false">取消</el-button>',
    '        <el-button type="primary" @click="saveDialog">确定</el-button>',
    '      </template>',
    '    </AppDialog>',
    '  </div>',
    '</template>',
    '',
    '<style scoped lang="scss">',
    '.generated-subtable {',
    '  &__block { margin-bottom: 16px; }',
    '  &__head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }',
    '  &__title { font-size: 14px; font-weight: 600; color: var(--el-text-color-primary); }',
    '  &__head :deep(.el-button) { margin-left: auto; }',
    '}',
    '</style>',
    '',
  ].join('\n');
}

/**
 * 关联数据表的 CRUD 列表页生成器。
 *
 * 表单控件、列表单元格、查询条件全部来自模板注册表：
 * - 控件：control-templates.ts
 * - 列表列 / 查询项：column-templates.ts
 */

import type { DevForm } from '../../../db/entities';
import type { DbColumnInfo, DbTableInfo } from '../../dev-db-table/dev-db-table.introspect';
import type { DetailsCodegenInput } from '../../dev-model/dev-model.codegen';
import type { DevFormFieldInput, DevFormSchemaInput } from '../dev-form.dto';
import { subTableListColumns } from './subtable-page';
import { cellTemplateFor, searchTemplateFor, DECODE_MULTI_SETUP, OPTION_TEXT_SETUP } from './column-templates';
import { buildFields, optionMapsDeclaration } from './fields';
import { formItemLines, formModelLines, resetLines, rulesLines, dialogAttrsOf, elFormSize, fullscreenDialogActions } from './page-shared';
import {
  html,
  js,
  mergeImports,
  toCamel,
  toPascal,
  unique,
  type ImportSpec,
  type ListColumnConfig,
  type QueryColumnConfig,
} from './shared';

/** 数字转换帮助函数：控件可能是文本框，接口要的是 number */
export const TO_NUMBER_SETUP = [
  '/** 表单值 → 数字：空值返回 undefined，非法值也当空处理 */',
  'function toNumber(value: unknown): number | undefined {',
  "  if (value === null || value === undefined || value === '') return undefined;",
  '  const parsed = Number(value);',
  '  return Number.isFinite(parsed) ? parsed : undefined;',
  '}',
].join('\n');

/**
 * 提交值表达式：控件类型决定「怎么取」，数据库列类型决定「转成什么」。
 * 例如文本控件绑到 int 列 → toNumber；多选控件绑到 text 列 → JSON 字符串。
 */
function tablePayloadExpression(
  field: DevFormFieldInput,
  column: DbColumnInfo | null,
  usesNumber: { value: boolean },
): string {
  const value = `form.${field.name}`;

  // 多选值一律按 JSON 字符串写库（text/varchar 都能存，读取时 decodeMulti 还原）
  if (field.type === 'checkbox') return `JSON.stringify(${value} ?? [])`;
  if (column?.type === 'int' || column?.type === 'decimal') {
    usesNumber.value = true;
    return column.nullable ? `toNumber(${value})` : `(toNumber(${value}) ?? 0)`;
  }
  if (column?.type === 'boolean') return `Boolean(${value})`;
  return `String(${value} ?? '')`;
}

interface ResolvedListColumn {
  config: ListColumnConfig;
  column: DbColumnInfo | null;
  field: DevFormFieldInput | null;
  prop: string;
  label: string;
}

function resolveListColumns(
  schema: DevFormSchemaInput,
  tableInfo: DbTableInfo,
): ResolvedListColumn[] {
  const columnByName = new Map(tableInfo.columns.map((column) => [column.columnName, column]));
  const fieldByColumn = new Map(
    schema.fields
      .filter((field) => field.columnName)
      .map((field) => [field.columnName as string, field]),
  );

  const configs: ListColumnConfig[] =
    schema.list.listColumns.length > 0
      ? schema.list.listColumns
      : schema.list.listFields.map((columnName) => ({
          columnName,
          source: 'master',
          tableName: null,
          field: '',
          sortable: false,
          fixed: '',
          align: 'left',
          width: null,
        }));

  return configs
    // 这里只处理主表列；子表列由 subTableListColumns() 单独生成聚合列
    .filter((config) => config.source !== 'subtable')
    .map((config) => {
      const column = columnByName.get(config.columnName) ?? null;
      const field = fieldByColumn.get(config.columnName) ?? null;
      return {
        config,
        column,
        field,
        prop: field?.name ?? toCamel(config.columnName),
        label: field?.label || column?.comment || config.columnName,
      };
    });
}

function columnLine(item: ResolvedListColumn): {
  line: string;
  imports: ImportSpec[];
  setup: string[];
} {
  const cell = cellTemplateFor(item.field, item.column);
  const parts: string[] = [`prop: '${item.prop}'`, `label: ${js(item.label)}`];

  if (item.config.width) {
    parts.push(`width: ${item.config.width}`);
  } else if (!cell.props.some((text) => text.startsWith('width:') || text.startsWith('minWidth:'))) {
    parts.push('minWidth: 140');
  }
  parts.push(...cell.props);

  if (item.config.align && item.config.align !== 'left') parts.push(`align: '${item.config.align}'`);
  if (item.config.fixed === 'left' || item.config.fixed === 'right') {
    parts.push(`fixed: '${item.config.fixed}'`);
  }
  parts.push(item.config.sortable ? `sortable: 'custom', sortParam: '${item.config.columnName}'` : 'sortable: false');

  if (cell.slot) parts.push(`slot: 'upload_${item.prop}'`);
  else if (cell.formatter) parts.push(`formatter: ${cell.formatter}`);

  return {
    line: `  { ${parts.join(', ')} },`,
    imports: cell.imports ?? [],
    setup: cell.setup ?? [],
  };
}

interface MergeSubColumn {
  detail: DetailsCodegenInput[number];
  column: DetailsCodegenInput[number]['listColumns'][number];
  prop: string;
  label: string;
  field: DevFormFieldInput;
  cell: ReturnType<typeof cellTemplateFor>;
  config: ListColumnConfig | null;
}

/**
 * 合并展示的子表列：每列对应明细行里的真实值（不是后端拼接文本）。
 * 用 sub_<表名>_<列名> 作为列标识和合成字段名，与预览的 subColumnKey 一致；
 * 合成字段保留设计器里的控件类型/选项/日期格式，直接复用列表模板做回显。
 */
function resolveMergeSubColumns(
  schema: DevFormSchemaInput,
  details: DetailsCodegenInput,
): MergeSubColumn[] {
  const result: MergeSubColumn[] = [];
  for (const detail of details) {
    const sub = schema.subtables.find((item) => item.tableName === detail.tableName);
    for (const column of detail.listColumns) {
      const designed = sub?.columns.find((item) => item.columnName === column.columnName);
      const fallback = {
        id: column.columnName,
        type: 'input',
        label: column.label,
        name: column.fieldName,
        columnName: column.columnName,
        options: [],
      };
      const field = {
        ...(designed ?? fallback),
        name: `sub_${detail.tableName}_${column.columnName}`,
        columnName: column.columnName,
        label: column.label,
      } as unknown as DevFormFieldInput;
      const config =
        schema.list.listColumns.find(
          (item) =>
            item.source === 'subtable' &&
            item.tableName === detail.tableName &&
            item.columnName === column.columnName,
        ) ?? null;
      result.push({
        detail,
        column,
        prop: field.name,
        label: column.label,
        field,
        cell: cellTemplateFor(field, null),
        config,
      });
    }
  }
  return result;
}

/** 合并展示的子表列 → 列定义：同表连续多列合成两级表头，单列用「表名·字段」 */
function mergeColumnLines(columns: MergeSubColumn[]): string[] {
  const lines: string[] = [];
  const lineOf = (item: MergeSubColumn, label: string, indent = '  '): string => {
    const parts = [`prop: '${item.prop}'`, `label: ${js(label)}`];
    if (item.config?.width) parts.push(`width: ${item.config.width}`);
    else parts.push('minWidth: 160');
    if (item.config?.align && item.config.align !== 'left') {
      parts.push(`align: '${item.config.align}'`);
    }
    if (item.config?.fixed === 'left' || item.config?.fixed === 'right') {
      parts.push(`fixed: '${item.config.fixed}'`);
    }
    parts.push('sortable: false');
    if (item.cell.slot) parts.push(`slot: 'upload_${item.prop}'`);
    else {
      parts.push(
        `formatter: ${item.cell.formatter ?? "(row, _column, value) => (value === null || value === undefined || value === '' ? '-' : String(value))"}`,
      );
    }
    return `${indent}{ ${parts.join(', ')} },`;
  };

  let index = 0;
  while (index < columns.length) {
    const detail = columns[index].detail;
    let end = index;
    while (end < columns.length && columns[end].detail === detail) end += 1;
    if (end - index === 1) {
      lines.push(lineOf(columns[index], `${detail.label}·${columns[index].label}`));
    } else {
      lines.push(`  { label: ${js(detail.label)}, headerAlign: 'center', children: [`);
      for (let i = index; i < end; i += 1) lines.push(lineOf(columns[i], columns[i].label, '    '));
      lines.push('  ] },');
    }
    index = end;
  }
  return lines;
}

/** 合并展示：一条主记录按明细行数拍平，子表列取对应明细行的真实值 */
function flattenRowsSetup(details: DetailsCodegenInput): string {
  return [
    '/** 合并展示：一条主记录按明细行数拍平，主表列由 span-method 跨行合并 */',
    'function flattenRows(list: any[]): any[] {',
    '  const rows: any[] = [];',
    '  list.forEach((master, index) => {',
    '    const groups: any[][] = [',
    ...details.map((detail) => `      (master.details?.[${js(detail.tableName)}] ?? []) as any[],`),
    '    ];',
    '    const count = Math.max(1, ...groups.map((group) => group.length));',
    '    for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {',
    '      const row: Record<string, any> = {',
    '        ...master,',
    '        __flatKey: `${master.id}-${rowIndex}`,',
    '        __span: count,',
    '        __first: rowIndex === 0,',
    '        __index: index + 1,',
    '      };',
    ...details.flatMap((detail, detailIndex) =>
      detail.listColumns.map(
        (column) =>
          `      row[${js(`sub_${detail.tableName}_${column.columnName}`)}] = groups[${detailIndex}][rowIndex]?.[${js(column.fieldName)}] ?? null;`,
      ),
    ),
    '      rows.push(row);',
    '    }',
    '  });',
    '  return rows;',
    '}',
    '',
    '/** 子表列每行独立，其余列（勾选/序号/主表列/操作）按主记录跨行合并 */',
    'function spanMethod({ row, column }: { row: any; column: any }): [number, number] | void {',
    '  const span = Number(row?.__span ?? 1);',
    '  if (span <= 1) return [1, 1];',
    "  const prop = column?.property as string | undefined;",
    "  if (prop && prop.startsWith('sub_')) return [1, 1];",
    '  return row.__first ? [span, 1] : [0, 0];',
    '}',
  ].join('\n');
}

function searchLine(
  config: QueryColumnConfig,
  column: DbColumnInfo | null,
  field: DevFormFieldInput | null,
): string {
  const output = searchTemplateFor(field, column);
  const prop = field?.name ?? toCamel(config.columnName);
  const label = field?.label || column?.comment || config.columnName;
  const parts: string[] = [`prop: '${prop}'`, `label: ${js(label)}`];

  if (config.hidden) parts.push('hidden: true');
  if (config.defaultValue !== undefined && config.defaultValue !== null) {
    parts.push(`defaultValue: ${JSON.stringify(config.defaultValue)}`);
  }
  if (config.keyword) parts.push(`placeholder: ${js(config.keyword)}`);
  parts.push(...output.props);

  return `  { ${parts.join(', ')} },`;
}

export function generateTablePage(
  form: DevForm,
  schema: DevFormSchemaInput,
  tableInfo: DbTableInfo,
  details: DetailsCodegenInput = [],
): string {
  const className = toPascal(form.form_key);
  const hasSubTables = details.length > 0;
  // 与在线预览一致：有子表时默认 merge（明细逐行展示 + 主表单元格跨行合并），
  // expand 保留后端聚合列的旧行为，避免改变已有生成页。
  const mergeView = hasSubTables && (schema.list.subtableView ?? 'merge') === 'merge';
  const subList = subTableListColumns(details);
  const mergeColumns = mergeView ? resolveMergeSubColumns(schema, details) : [];
  const mergeSubBuild = mergeView
    ? buildFields(
        mergeColumns.map((item) => item.field),
        { mode: 'table', columnOf: () => null },
      )
    : null;
  const columnByName = new Map(tableInfo.columns.map((column) => [column.columnName, column]));
  const formFields = schema.fields.filter(
    (field) => field.columnName && columnByName.has(field.columnName),
  );

  const build = buildFields(formFields, {
    mode: 'table',
    columnOf: (field) => (field.columnName ? columnByName.get(field.columnName) ?? null : null),
  });

  const listColumns = resolveListColumns(schema, tableInfo);
  const cellOutputs = listColumns.map(columnLine);
  const mergeUploadColumns: ResolvedListColumn[] = mergeColumns
    .filter((item) => item.cell.slot)
    .map((item) => ({
      config: item.config ?? {
        columnName: item.column.columnName,
        source: 'subtable',
        tableName: item.detail.tableName,
        field: item.prop,
        sortable: false,
        fixed: '',
        align: 'left',
        width: null,
      },
      column: null,
      field: item.field,
      prop: item.prop,
      label: item.label,
    }));
  const uploadSlots = [
    ...listColumns.filter((item) => cellTemplateFor(item.field, item.column).slot),
    ...mergeUploadColumns,
  ];

  const queryConfigs =
    schema.list.queryColumns.length > 0
      ? schema.list.queryColumns.filter((config) => config.source !== 'subtable')
      : schema.list.queryFields.map((columnName) => ({
          columnName,
          source: 'master' as const,
          tableName: null,
          field: '',
          operator: 'like' as const,
          defaultValue: null,
          keyword: '',
          multiple: false,
          hidden: false,
        }));

  const searchItems = queryConfigs.map((config) =>
    searchLine(
      config,
      columnByName.get(config.columnName) ?? null,
      schema.fields.find((field) => field.columnName === config.columnName) ?? null,
    ),
  );

  const needsComputed = formFields.some((field) => field.type === 'datetime');
  const optionMaps = optionMapsDeclaration([
    ...formFields,
    ...mergeColumns.map((item) => item.field),
  ]);
  const usesNumber = { value: false };
  const payloadExpressions = build.items.map((item) => ({
    field: item.field,
    expression: tablePayloadExpression(item.field, item.column, usesNumber),
  }));
  const importSpecs: ImportSpec[] = [
    {
      from: 'vue',
      names: ['reactive', 'ref', ...(needsComputed || mergeView ? ['computed'] : [])],
    },
    { from: 'element-plus', names: ['ElMessage', 'ElMessageBox', 'type FormInstance', 'type FormRules'] },
    { from: '@/components/ProTable/index.vue', default: 'ProTable' },
    { from: '@/components/ProTable/types', names: ['type ProTableColumn', 'type SearchItem'] },
    { from: '@/components/AppDialog/index.vue', default: 'AppDialog' },
    ...(hasSubTables
      ? [
          { from: './SubTableEditor.vue', default: 'SubTableEditor' },
          { from: './api', names: [`get${className}Details`, `type ${className}Details`] },
        ]
      : []),
    ...build.imports,
    ...cellOutputs.flatMap((item) => item.imports),
    ...(mergeView
      ? [
          ...mergeSubBuild!.imports,
          ...mergeColumns.flatMap((item) => item.cell.imports ?? []),
        ]
      : []),
    {
      from: './api',
      names: [
        `create${className}`,
        `delete${className}`,
        `list${className}`,
        `update${className}`,
        `type ${className}Item`,
        `type ${className}Payload`,
        `type ${className}Query`,
      ],
    },
  ];
  const importLines = mergeImports(importSpecs);
  const setups = unique([
    ...build.setups,
    ...cellOutputs.flatMap((item) => item.setup),
    ...(mergeView ? mergeColumns.flatMap((item) => item.cell.setup ?? []) : []),
  ]);
  const usesOptionText =
    listColumns.some((item) => ['select', 'radio', 'checkbox'].includes(item.field?.type ?? '')) ||
    mergeColumns.some((item) => ['select', 'radio', 'checkbox'].includes(item.field.type));
  const usesDecodeMulti =
    build.usesDecodeMulti ||
    listColumns.some((item) => item.field?.type === 'checkbox') ||
    mergeColumns.some((item) => item.field.type === 'checkbox');
  const mergeOptionDeclarations = mergeView
    ? mergeSubBuild!.declarations.filter((declaration) => declaration.includes('Options'))
    : [];

  return [
    '<script setup lang="ts">',
    `defineOptions({ name: 'Biz${className}' });`,
    '',
    ...importLines,
    '',
    'const tableRef = ref<any>(null);',
    '',
    ...(hasSubTables && !mergeView ? subList.setups.flatMap((setup) => [setup, '']) : []),
    ...(mergeView ? [flattenRowsSetup(details), ''] : []),
    'const columns: ProTableColumn[] = [',
    ...(mergeView
      ? ["  { type: 'selection', width: 48 },", "  { label: '序号', width: 70, align: 'center', slot: 'indexCell' },"]
      : ["  { type: 'index', label: '序号', width: 70 },"]),
    ...cellOutputs.map((item) => item.line),
    ...(mergeView ? mergeColumnLines(mergeColumns) : hasSubTables ? subList.lines : []),
    "  { label: '操作', width: 160, fixed: 'right', slot: 'actions' },",
    '];',
    '',
    searchItems.length > 0 ? 'const searchItems: SearchItem[] = [' : 'const searchItems: SearchItem[] = [];',
    ...(searchItems.length > 0 ? [...searchItems, '];'] : []),
    '',
    ...(mergeView
      ? [
          'async function loadData(params: Record<string, unknown>) {',
          `  const result = await list${className}(params as ${className}Query);`,
          '  return { ...result, list: flattenRows(result.list ?? []) };',
          '}',
          '',
          'const selection = ref<any[]>([]);',
          'const selectedCount = computed(() => new Set(selection.value.map((row) => row.id)).size);',
          'function handleSelectionChange(rows: any[]): void {',
          '  selection.value = rows;',
          '}',
          'async function handleBatchDelete(): Promise<void> {',
          "  if (selection.value.length === 0) { ElMessage.warning('请先选择要删除的数据'); return; }",
          '  const ids = [...new Set(selection.value.map((row) => row.id as number))];',
          '  try {',
          '    await ElMessageBox.confirm(`确定删除选中的 ${ids.length} 条数据吗？`, \'删除确认\', {',
          "      type: 'warning',",
          "      confirmButtonText: '删除',",
          "      confirmButtonClass: 'el-button--danger',",
          '    });',
          '  } catch {',
          '    return;',
          '  }',
          '  try {',
          '    for (const id of ids) {',
          `      await delete${className}(id);`,
          '    }',
          '    selection.value = [];',
          '    tableRef.value?.clearSelection();',
          "    ElMessage.success('批量删除成功');",
          '    tableRef.value?.reload();',
          '  } catch {',
          '    // 错误提示由 request 拦截器统一处理',
          '  }',
          '}',
        ]
      : [
          'function loadData(params: Record<string, unknown>) {',
          `  return list${className}(params as ${className}Query);`,
          '}',
        ]),
    '',
    ...build.declarations.flatMap((declaration) => [declaration, '']),
    ...mergeOptionDeclarations.flatMap((declaration) => [declaration, '']),
    ...(optionMaps ? [optionMaps, ''] : []),
    ...(build.codeLabels ? [build.codeLabels, ''] : []),
    ...formModelLines(build, 'FormModel'),
    '',
    'const dialogVisible = ref(false);',
    "const dialogMode = ref<'create' | 'edit' | 'view'>('create');",
    'const editingId = ref<number | null>(null);',
    'const saving = ref(false);',
    'const formRef = ref<FormInstance>();',
    ...(hasSubTables
      ? [
          '',
          '/** 子表明细：键为从表表名，与 schema.subtables 一一对应 */',
          `const details = ref<${className}Details>({});`,
          'const detailsLoading = ref(false);',
          'function resetDetails(): void {',
          '  const next: Record<string, any[]> = {};',
          ...details.map((d) => `  next[${js(d.tableName)}] = [];`),
          '  details.value = next as ' + `${className}Details;`,
          '}',
          'async function loadDetails(id: number): Promise<void> {',
          '  detailsLoading.value = true;',
          '  try {',
          `    details.value = await get${className}Details(id);`,
          '  } finally {',
          '    detailsLoading.value = false;',
          '  }',
          '}',
        ]
      : []),
    '',
    ...rulesLines(build),
    '',
    ...(usesDecodeMulti ? [DECODE_MULTI_SETUP, ''] : []),
    ...(usesOptionText ? [OPTION_TEXT_SETUP, ''] : []),
    ...resetLines(build),
    '',
    `function fillForm(row: ${className}Item): void {`,
    '  resetForm();',
    ...build.items.map((item) => `  ${item.assign}`),
    '}',
    '',
    'function openCreate(): void {',
    "  dialogMode.value = 'create';",
    '  editingId.value = null;',
    '  resetForm();',
    ...(hasSubTables ? ['  resetDetails();'] : []),
    '  dialogVisible.value = true;',
    '}',
    '',
    `function openEdit(row: ${className}Item): void {`,
    "  dialogMode.value = 'edit';",
    '  editingId.value = row.id;',
    '  fillForm(row);',
    ...(hasSubTables
      ? [
          '  resetDetails();',
          '  void loadDetails(row.id);',
        ]
      : []),
    '  dialogVisible.value = true;',
    '}',
    '',
    `/** 查看：与主表编辑共用回填，但弹窗只读、明细不可改 */`,
    `function openView(row: ${className}Item): void {`,
    "  dialogMode.value = 'view';",
    '  editingId.value = row.id;',
    '  fillForm(row);',
    ...(hasSubTables
      ? [
          '  resetDetails();',
          '  void loadDetails(row.id);',
        ]
      : []),
    '  dialogVisible.value = true;',
    '}',
    '',
    ...(usesNumber.value ? [TO_NUMBER_SETUP, ''] : []),
    '/** 表单模型 → 接口字段：控件值与数据库列类型不一致时的转换集中在这里 */',
    `function toPayload(): ${className}Payload {`,
    '  return {',
    ...payloadExpressions.map((item) => `    ${item.field.name}: ${item.expression},`),
    ...(hasSubTables ? ['    details: cleanDetails(),'] : []),
    '  };',
    '}',
    '',
    ...(hasSubTables
      ? [
          '/** 提交明细：去掉本地 __key，保留 id（编辑时用于定位已有行） */',
          'function cleanDetails(): any {',
          '  const result: Record<string, any[]> = {};',
          ...details.map(
            (d) =>
              `  result[${js(d.tableName)}] = (details.value as any)[${js(d.tableName)}]?.map((row: any) => { const copy = { ...row }; delete copy.__key; return copy; }) ?? [];`,
          ),
          '  return result;',
          '}',
        ]
      : []),
    '',
    'async function handleSave(): Promise<void> {',
    '  if (dialogMode.value === \'view\') return;',
    '  if (!formRef.value) return;',
    '  const valid = await formRef.value.validate().catch(() => false);',
    '  if (!valid) return;',
    '',
    '  saving.value = true;',
    '  try {',
    "    if (dialogMode.value === 'create') {",
    `      await create${className}(toPayload());`,
    "      ElMessage.success('创建成功');",
    '    } else if (editingId.value) {',
    `      await update${className}(editingId.value, toPayload());`,
    "      ElMessage.success('更新成功');",
    '    }',
    '    dialogVisible.value = false;',
    '    tableRef.value?.reload();',
    '  } catch {',
    '    // 错误提示由 request 拦截器统一处理',
    '  } finally {',
    '    saving.value = false;',
    '  }',
    '}',
    '',
    `async function handleDelete(row: ${className}Item): Promise<void> {`,
    '  try {',
    "    await ElMessageBox.confirm('确定删除该条数据吗？', '删除确认', {",
    "      type: 'warning',",
    "      confirmButtonText: '删除',",
    "      confirmButtonClass: 'el-button--danger',",
    '    });',
    '  } catch {',
    '    return;',
    '  }',
    '  try {',
    `    await delete${className}(row.id);`,
    "    ElMessage.success('删除成功');",
    '    tableRef.value?.reload();',
    '  } catch {',
    '    // 错误提示由 request 拦截器统一处理',
    '  }',
    '}',
    '</script>',
    '',
    '<template>',
    '  <div class="page">',
    mergeView
      ? '    <ProTable ref="tableRef" :columns="columns" :search-items="searchItems" :request="loadData" row-key="__flatKey" :span-method="spanMethod" @selection-change="handleSelectionChange">'
      : '    <ProTable ref="tableRef" :columns="columns" :search-items="searchItems" :request="loadData" row-key="id">',
    '      <template #toolbar>',
    `        <el-button v-permission="'biz_${form.form_key}:create'" type="primary" @click="openCreate">新增</el-button>`,
    ...(mergeView
      ? [
          `        <el-button v-permission="'biz_${form.form_key}:delete'" type="danger" plain :disabled="selection.length === 0" @click="handleBatchDelete">批量删除<span v-if="selection.length > 0">（{{ selectedCount }}）</span></el-button>`,
          "        <el-button @click=\"tableRef?.reload()\">刷新</el-button>",
        ]
      : []),
    '      </template>',
    '',
    ...(mergeView ? ['      <template #indexCell="{ row }">{{ row.__index }}</template>', ''] : []),
    ...uploadSlots.flatMap((item) => {
      const cell = cellTemplateFor(item.field, item.column);
      return [
        `      <template #upload_${item.prop}="{ row }">`,
        `        <UploadCell type="${cell.slot}" :value="row.${item.prop}" />`,
        '      </template>',
        '',
      ];
    }),
    '      <template #actions="{ row }">',
    `        <el-button v-permission="'biz_${form.form_key}:list'" link type="primary" @click="openView(row)">查看</el-button>`,
    `        <el-button v-permission="'biz_${form.form_key}:update'" link type="primary" @click="openEdit(row)">编辑</el-button>`,
    `        <el-button v-permission="'biz_${form.form_key}:delete'" link type="danger" @click="handleDelete(row)">删除</el-button>`,
    '      </template>',
    '    </ProTable>',
    '',
    `    <AppDialog v-model="dialogVisible" :title="dialogMode === 'create' ? '新增' : dialogMode === 'edit' ? '编辑' : '查看'" ${dialogAttrsOf(schema)}${fullscreenDialogActions(schema)}${schema.dialogType === 'fullscreen' ? ` :show-confirm="dialogMode !== 'view'" :cancel-text="dialogMode === 'view' ? '关闭' : '取消'"` : ''}>`,
    `      <el-form ref="formRef" :model="form" :rules="rules" label-width="${schema.labelWidth}px" label-position="${schema.labelPosition}" size="${elFormSize(schema)}" :disabled="dialogMode === 'view' || ${schema.disabled}" label-suffix="${html(schema.labelSuffix)}" :hide-required-asterisk="${schema.hideRequiredAsterisk}" :show-message="${schema.showMessage}" :status-icon="${schema.statusIcon}">`,
    '        <el-row :gutter="16">',
    ...formItemLines(build, (field) =>
      // 上传控件不读 el-form 的 disabled，查看模式要显式禁用选择按钮
      ['image', 'file'].includes(field.type) ? `:disabled="dialogMode === 'view'"` : '',
    ),
    '        </el-row>',
    '      </el-form>',
    ...(hasSubTables
      ? [
          '',
          '      <div v-loading="detailsLoading">',
          '        <SubTableEditor v-model="details" :readonly="dialogMode === \'view\'" />',
          '      </div>',
        ]
      : []),
    ...(schema.dialogType === 'fullscreen'
      ? []
      : [
          '      <template #footer>',
          '        <el-button @click="dialogVisible = false">{{ dialogMode === \'view\' ? \'关闭\' : \'取消\' }}</el-button>',
          '        <el-button v-if="dialogMode !== \'view\'" type="primary" :loading="saving" @click="handleSave">保存</el-button>',
          '      </template>',
        ]),
    '    </AppDialog>',
    '  </div>',
    '</template>',
    '',
  ].join('\n');
}

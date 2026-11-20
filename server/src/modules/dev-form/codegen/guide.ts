/** 生成代码附带的接入说明（README.md） */

import type { DevForm } from '../../../db/entities';
import type { DbTableInfo } from '../../dev-db-table/dev-db-table.introspect';
import type { DevFormSchemaInput } from '../dev-form.dto';
import { toPascal } from './shared';

const TEMPLATE_NOTE = [
  '## 想改生成效果？改模板',
  '',
  '生成逻辑在 `server/src/modules/dev-form/codegen/`：',
  '',
  '- `control-templates.ts`：每种控件的表单代码（控件标签 / import / setup / 初始值 / 回填 / 提交值）；',
  '- `column-templates.ts`：每种控件的列表展示、查询条件、建表列类型与校验；',
  '- `page-table.ts` / `page-form.ts`：把上面两张表拼成页面，新增控件不用动；',
  '- `subtable-meta.ts` / `subtable-page.ts`：子表明细上下文与 `SubTableEditor.vue` 生成。',
  '',
  '新增一个控件时：先在 `admin/src/components/form-controls/` 实现控件，再在两张模板表里各加一条。',
  '',
];

export function generateFormGuide(form: DevForm, schema: DevFormSchemaInput): string {
  const className = toPascal(form.form_key);
  const key = form.form_key;
  const perm = `biz_${key}`;
  return [
    `# ${form.name}（${key}）接入说明`,
    '',
    '## 生成的文件',
    '',
    '```text',
    `server/src/biz/${key}/${key}.entity.ts`,
    `server/src/biz/${key}/${key}.dto.ts`,
    `server/src/biz/${key}/${key}.service.ts`,
    `server/src/biz/${key}/${key}.controller.ts`,
    `server/src/biz/${key}/${key}.route.ts`,
    `admin/src/views/biz/${key}/index.vue`,
    `admin/src/views/biz/${key}/api.ts`,
    '```',
    '',
    '## 落地方式',
    '',
    '1. 把 zip 解压到项目根目录（保持 `server/` 与 `admin/` 两层即可）。',
    '2. 重启后端：`server/src/biz` 启动时会扫描每个模块目录，',
    `   - \`${key}.entity.ts\` → 注册到 TypeORM，开发环境 \`synchronize\` 自动建表；`,
    `   - \`${key}.route.ts\` → 挂载到 \`/api/admin/${key}\`。`,
    '   不需要改 `server/src/app.ts`，也不需要改 `server/src/db/entities/index.ts`。',
    `3. 前端组件由 \`views/**/*.vue\` 自动收集，菜单组件路径就是 \`biz/${key}/index\`。`,
    '4. 菜单与权限随代码一起生成：当前库下载时已建好；换环境执行同目录的 `menu.sql`',
    '   （按权限标识判重，可重复执行）。',
    '',
    '## 菜单与权限',
    '',
    '```text',
    `页面权限：${perm}:list`,
    `按钮权限：${perm}:create / ${perm}:update / ${perm}:delete`,
    `菜单组件：biz/${key}/index`,
    `菜单路径：/biz/${key}`,
    '```',
    '',
    ...TEMPLATE_NOTE,
    '## 说明',
    '',
    `- 组件名 \`Biz${className}\` 已按 keep-alive 约定命名，菜单缓存依赖它，不要改名。`,
    '- 图片/文件字段存 URL（多值存 JSON 数组字符串），关联表单/弹框选择存 `{v,l}` JSON，列类型统一用 `text`。',
    '- 日期字段存 `YYYY-MM-DD`，时间控件存完整时间戳（锚定日期 2000-01-01）。',
    `- 表单字段数：${schema.fields.length}，后端数据表：biz_${key}。`,
    '',
  ].join('\n');
}

export function generateTableGuide(
  form: DevForm,
  schema: DevFormSchemaInput,
  tableInfo: DbTableInfo,
): string {
  const className = toPascal(form.form_key);
  const key = form.form_key;
  const perm = `biz_${key}`;
  const subs = schema.subtables ?? [];
  return [
    `# ${form.name}（${key}）接入说明`,
    '',
    `- 关联表：${form.table_name}（${tableInfo.tableComment || '无注释'}）`,
    `- 表单字段：${schema.fields.length}；查询条件：${schema.list.queryColumns.length || schema.list.queryFields.length}；列表列：${schema.list.listColumns.length || schema.list.listFields.length}`,
    '',
    '## 生成文件',
    '',
    '```text',
    `server/src/biz/${key}/${key}.entity.ts`,
    `server/src/biz/${key}/${key}.dto.ts`,
    `server/src/biz/${key}/${key}.service.ts`,
    `server/src/biz/${key}/${key}.controller.ts`,
    `server/src/biz/${key}/${key}.route.ts`,
    `admin/src/views/biz/${key}/index.vue`,
    `admin/src/views/biz/${key}/api.ts`,
    ...subs.flatMap((sub) => [`server/src/biz/${key}/${key}_${sub.tableName}.entity.ts`]),
    ...(subs.length ? [
      `admin/src/views/biz/${key}/SubTableEditor.vue`,
      `admin/src/views/biz/${key}/SubTableFieldControl.vue`,
    ] : []),
    '```',
    '',
    '## 落地方式',
    '',
    '1. 把 zip 解压到项目根目录（保持 `server/` 与 `admin/` 两层即可）。',
    '2. 重启后端：`server/src/biz` 启动时会扫描每个模块目录，',
    `   - \`${key}.entity.ts\` → 注册到 TypeORM；`,
    `   - \`${key}.route.ts\` → 挂载到 \`/api/admin/${key}\`。`,
    '   不需要改 `server/src/app.ts`，也不需要改 `server/src/db/entities/index.ts`。',
    `3. 前端组件由 \`views/**/*.vue\` 自动收集，菜单组件路径就是 \`biz/${key}/index\`。`,
    '4. 菜单与权限随代码一起生成：当前库下载时已建好；换环境执行同目录的 `menu.sql`',
    '   （按权限标识判重，可重复执行）。',
    '',
    '## 菜单与权限',
    '',
    '```text',
    `页面权限：${perm}:list`,
    `按钮权限：${perm}:create / ${perm}:update / ${perm}:delete`,
    `菜单组件：biz/${key}/index`,
    `菜单路径：/biz/${key}`,
    '```',
    '',
    '维护菜单后执行 `pnpm seed` 生效。',
    '',
    ...TEMPLATE_NOTE,
    '## 说明',
    '',
    '- 查询条件与列表列按步骤 3 的配置生成，控件类型跟随字段控件（下拉/日期/开关等各自不同）。',
    '- 图片/文件列渲染为缩略图或下载链接，关联表单/弹框选择列按回显文本展示，不会露出 JSON。',
    '- 列表带「查看 / 编辑 / 删除」：查看用 `biz_<key>:list`，弹窗只读（含明细），',
    '  顶部只保留关闭；编辑/新增仍按各自按钮权限控制。',
    ...(subs.length ? [
      `- 已生成 ${subs.length} 个子表：\`SubTableEditor.vue\` 按明细列的控件类型渲染行内/弹窗录入，`,
      '  新增/编辑/删除与主表同事务提交，编辑时按 `GET /:id/details` 回显。',
      '  列表与在线预览一致：`merge` 模式下每条明细单独一行，主表列（含勾选/序号/操作）',
      '  通过 `span-method` 跨行合并，同表连续明细列合成两级表头；`expand` 模式保留聚合列。',
      '  明细行本地标识 `__key` 仅用于前端行定位，提交前会剥离；已有明细按 `id` upsert。',
    ] : []),
    `- 后端实体使用现有表名 \`${form.table_name}\`，列类型来自同步的数据库元数据。`,
    `- 组件名 \`Biz${className}\` 已按 keep-alive 约定命名，菜单缓存依赖它，不要改名。`,
    '',
  ].join('\n');
}

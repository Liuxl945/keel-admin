/**
 * 独立表单页（未关联数据表）生成器：一张卡片式表单 + 提交按钮。
 * 控件同样来自 control-templates.ts，新增控件不需要改这里。
 */

import type { DevForm } from '../../../db/entities';
import type { DevFormSchemaInput } from '../dev-form.dto';
import { buildFields } from './fields';
import { formItemLines, elFormSize } from './page-shared';
import { html, js, mergeImports, toPascal, unique } from './shared';

export function generateFormPage(form: DevForm, schema: DevFormSchemaInput): string {
  const className = toPascal(form.form_key);
  const build = buildFields(schema.fields, { mode: 'form' });
  const needsComputed = schema.fields.some((field) => field.type === 'datetime');
  const importLines = mergeImports([
    { from: 'vue', names: ['reactive', 'ref', ...(needsComputed ? ['computed'] : [])] },
    {
      from: 'element-plus',
      names: ['ElMessage', 'type FormInstance', 'type FormRules'],
    },
    ...build.imports,
    {
      from: './api',
      names: [`create${className}`, `type ${className}Payload`],
    },
  ]);
  const rules = build.items.map((item) => item.rule).filter(Boolean) as string[];

  return [
    '<script setup lang="ts">',
    `defineOptions({ name: 'Biz${className}' });`,
    '',
    ...importLines,
    '',
    `const formTitle = ${js(form.name)};`,
    `const formDescription = ${js(form.description ?? '')};`,
    'const formRef = ref<FormInstance>();',
    'const loading = ref(false);',
    '',
    ...build.declarations.flatMap((declaration) => [declaration, '']),
    ...(build.codeLabels ? [build.codeLabels, ''] : []),
    `const form = reactive<${className}Payload>({`,
    ...build.items.map((item) => `  ${item.field.name}: ${item.initial},`),
    '});',
    ...unique(build.setups).flatMap((setup) => ['', setup]),
    '',
    rules.length > 0 ? 'const rules: FormRules = {' : 'const rules: FormRules = {};',
    ...(rules.length > 0 ? [...rules, '};'] : []),
    '',
    'async function handleSubmit(): Promise<void> {',
    '  if (!formRef.value) return;',
    "  const valid = await formRef.value.validate().catch(() => false);",
    '  if (!valid) return;',
    '',
    '  loading.value = true;',
    '  try {',
    `    await create${className}({ ...form });`,
    "    ElMessage.success('提交成功');",
    '    formRef.value.resetFields();',
    '  } finally {',
    '    loading.value = false;',
    '  }',
    '}',
    '</script>',
    '',
    '<template>',
    '  <div class="page">',
    '    <div class="form-card">',
    '      <h2 class="form-card__title">{{ formTitle }}</h2>',
    '      <p v-if="formDescription" class="form-card__desc">{{ formDescription }}</p>',
    `      <el-form ref="formRef" :model="form" :rules="rules" label-width="${schema.labelWidth}px" label-position="${schema.labelPosition}" size="${elFormSize(schema)}" :disabled="${schema.disabled}" label-suffix="${html(schema.labelSuffix)}" :hide-required-asterisk="${schema.hideRequiredAsterisk}" :show-message="${schema.showMessage}" :status-icon="${schema.statusIcon}">`,
    '        <el-row :gutter="16">',
    ...formItemLines(build),
    '        </el-row>',
    '        <el-form-item>',
    '          <el-button type="primary" :loading="loading" @click="handleSubmit">提交</el-button>',
    '        </el-form-item>',
    '      </el-form>',
    '    </div>',
    '  </div>',
    '</template>',
    '',
    '<style scoped lang="scss">',
    '.form-card {',
    '  box-sizing: border-box;',
    '  max-width: 960px;',
    '  padding: 24px;',
    '  margin: 0 auto;',
    '  background: var(--el-bg-color);',
    '  border-radius: 8px;',
    '}',
    '',
    '.form-card__title {',
    '  margin: 0 0 8px;',
    '  font-size: 20px;',
    '  color: var(--el-text-color-primary);',
    '}',
    '',
    '.form-card__desc {',
    '  margin: 0 0 20px;',
    '  font-size: 13px;',
    '  line-height: 1.7;',
    '  color: var(--el-text-color-secondary);',
    '}',
    '</style>',
    '',
  ].join('\n');
}

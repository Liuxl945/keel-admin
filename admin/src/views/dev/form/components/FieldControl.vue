<script setup lang="ts">
import { computed } from 'vue';
import type { DevFormField } from '@/types/dev';
import { uploadFile } from '@/api/upload';
import { listPreviewRecords } from '@/api/dev-form-preview';
import { runDevApi } from '@/api/dev-api';
import { listUsers } from '@/api/user';
import { listRoles } from '@/api/role';
import {
  BarCodeControl,
  ChoiceControl,
  ColorPickerControl,
  DateControl,
  DialogSelectControl,
  FileUploadControl,
  ImageUploadControl,
  QrCodeControl,
  RelationFormControl,
  RoleSelectControl,
  SliderControl,
  SwitchControl,
  TextControl,
  UserSelectControl,
  type DataFetchHandler,
  type UploadHandler,
} from '@/components/form-controls';

const props = defineProps<{
  field: DevFormField;
  modelValue: any;
  /** 表单级禁用，与字段自身禁用合并 */
  disabled?: boolean;
  /** 当前表单的所有字段值：二维码/条码联动模式从这里取数 */
  values?: Record<string, any>;
  /** 字段名 → 显示标题：联动模式展示用 */
  codeLabels?: Record<string, string>;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: any] }>();
const model = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

// 业务入口只负责分发和注入能力，控件实现全部在公共控件库中
const uploadHandler: UploadHandler = async (file, onProgress) => {
  // api/upload 内部统一走分片上传：进度、重试、断点续传都由它处理
  const result = await uploadFile(file, { onProgress });
  return { url: result.url, name: result.name };
};

/** 关联表单：读取目标表单的预览数据（动态 SQL 直连，行键为表单字段名） */
const relationFormFetch: DataFetchHandler = async (query) => {
  const params: Record<string, unknown> = { page: query.page, pageSize: query.pageSize };
  // 搜索字段名来自目标表单的字段名；是否生效取决于目标表单是否把它配成查询字段
  if (query.keyword && query.keywordKey) params[query.keywordKey] = query.keyword;
  const result = await listPreviewRecords(Number(query.sourceId), params);
  return { rows: result.list as Record<string, unknown>[], total: result.total };
};

/** 弹框选择：执行数据接口，行键为接口字段映射里的 outputKey */
const dialogSelectFetch: DataFetchHandler = async (query) => {
  const params: Record<string, string | number | boolean | null> = {};
  // 搜索值绑定到接口声明的同名参数，未声明的参数会被后端拒绝，故只在配置了搜索字段时传
  if (query.keyword && query.keywordKey) params[query.keywordKey] = query.keyword;
  const result = await runDevApi(Number(query.sourceId), {
    params,
    page: query.page,
    pageSize: query.pageSize,
  });
  const rows = (result.rows ?? []).filter(
    (row): row is Record<string, unknown> =>
      Boolean(row) && typeof row === 'object' && !Array.isArray(row),
  );
  return { rows, total: result.total ?? rows.length };
};

/** 用户选择：系统用户分页列表（内置数据源，不需要 sourceId） */
const userSelectFetch: DataFetchHandler = async (query) => {
  const result = await listUsers({
    page: query.page,
    pageSize: query.pageSize,
    keyword: query.keyword || undefined,
  });
  return {
    rows: (result.list ?? []) as unknown as Record<string, unknown>[],
    total: result.total ?? 0,
  };
};

/** 角色选择：系统角色分页列表（内置数据源，不需要 sourceId） */
const roleSelectFetch: DataFetchHandler = async (query) => {
  const result = await listRoles({
    page: query.page,
    pageSize: query.pageSize,
    keyword: query.keyword || undefined,
  });
  return {
    rows: (result.list ?? []) as unknown as Record<string, unknown>[],
    total: result.total ?? 0,
  };
};
</script>

<template>
  <TextControl
    v-if="['input', 'textarea', 'number'].includes(field.type)"
    :field="field"
    v-model="model"
    :disabled="disabled"
  />
  <ChoiceControl
    v-else-if="['select', 'radio', 'checkbox'].includes(field.type)"
    :field="field"
    v-model="model"
    :disabled="disabled"
  />
  <DateControl
    v-else-if="['date', 'datetime'].includes(field.type)"
    :field="field"
    v-model="model"
    :disabled="disabled"
  />
  <SwitchControl
    v-else-if="field.type === 'switch'"
    :field="field"
    v-model="model"
    :disabled="disabled"
  />
  <SliderControl
    v-else-if="field.type === 'slider'"
    :field="field"
    v-model="model"
    :disabled="disabled"
  />
  <ColorPickerControl
    v-else-if="field.type === 'color'"
    :field="field"
    v-model="model"
    :disabled="disabled"
  />
  <FileUploadControl
    v-else-if="field.type === 'file'"
    :field="field"
    v-model="model"
    :upload="uploadHandler"
    :disabled="disabled"
  />
  <ImageUploadControl
    v-else-if="field.type === 'image'"
    :field="field"
    v-model="model"
    :upload="uploadHandler"
    :disabled="disabled"
  />
  <QrCodeControl
    v-else-if="field.type === 'qrcode'"
    :field="field"
    v-model="model"
    :disabled="disabled"
    :values="values"
    :code-labels="codeLabels"
  />
  <BarCodeControl
    v-else-if="field.type === 'barcode'"
    :field="field"
    v-model="model"
    :disabled="disabled"
    :values="values"
    :code-labels="codeLabels"
  />
  <RelationFormControl
    v-else-if="field.type === 'relationForm'"
    :field="field"
    v-model="model"
    :disabled="disabled"
    :fetch="relationFormFetch"
  />
  <DialogSelectControl
    v-else-if="field.type === 'dialogSelect'"
    :field="field"
    v-model="model"
    :disabled="disabled"
    :fetch="dialogSelectFetch"
  />
  <UserSelectControl
    v-else-if="field.type === 'userSelect'"
    :field="field"
    v-model="model"
    :disabled="disabled"
    :fetch="userSelectFetch"
  />
  <RoleSelectControl
    v-else-if="field.type === 'roleSelect'"
    :field="field"
    v-model="model"
    :disabled="disabled"
    :fetch="roleSelectFetch"
  />
</template>

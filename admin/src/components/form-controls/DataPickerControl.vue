<script setup lang="ts">
/**
 * 弹框选择器通用模板：关联表单 / 弹框选择共用。
 * 控件库本身不引用业务 API，数据由调用方注入的 fetch 回调提供；
 * 弹窗使用项目统一的 AppDialog（纯 UI 组件，不含业务依赖）。
 */
import { computed } from 'vue';
import { ArrowDown, Close } from '@element-plus/icons-vue';
import AppDialog from '@/components/AppDialog/index.vue';
import { useDataPicker } from './useDataPicker';
import { formatSmartCell } from './picker-value';
import type { CommonField, DataFetchHandler } from './types';

const props = defineProps<{
  field: CommonField;
  modelValue: string | null | undefined;
  disabled?: boolean;
  fetch?: DataFetchHandler;
  /** 数据来源名称，仅用于标题 / 占位兜底 */
  sourceLabel?: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const picker = useDataPicker(props, emit);
const {
  isDisabled,
  isMultiple,
  columns,
  checkedCount,
  items,
  displayText,
  placeholder,
  dialogVisible,
  loading,
  rows,
  total,
  page,
  pageSize,
  pageSizes,
  keyword,
  tableRef,
  activeRowKey,
  rowKey,
  openDialog,
  handleSearch,
  handlePageChange,
  handleSizeChange,
  handleSelect,
  handleSelectAll,
  handleRadioChange,
  handleRowClick,
  confirm,
  clear,
  removeItem,
} = picker;

const dialogTitle = computed(
  () => props.field.pickerTitle || `选择${props.field.label || props.sourceLabel || '数据'}`,
);
const searchPlaceholder = computed(
  () =>
    props.field.keywordPlaceholder ||
    (props.field.keywordKey ? `按 ${props.field.keywordKey} 搜索` : '输入关键词搜索'),
);
/** 有值、未禁用且未关闭可清空时，才在控件内部露出清空图标 */
const showClear = computed(
  () => Boolean(displayText.value) && !isDisabled.value && props.field.clearable !== false,
);
</script>

<template>
  <div class="data-picker">
    <!-- 多选回填：每个选中项一个标签，便于辨认与单独移除 -->
    <div
      v-if="isMultiple && items.length"
      class="data-picker__tags"
      :class="{ 'is-disabled': isDisabled }"
      @click="openDialog"
    >
      <el-tag
        v-for="item in items"
        :key="item.v"
        class="data-picker__tag"
        size="small"
        type="info"
        effect="light"
        :closable="!isDisabled"
        :disable-transitions="false"
        @close.stop="removeItem(item.v)"
      >
        {{ item.l || item.v }}
      </el-tag>
      <el-tooltip v-if="showClear" content="清空" placement="top">
        <el-icon class="data-picker__clear" @click.stop="clear">
          <Close />
        </el-icon>
      </el-tooltip>
      <el-icon class="data-picker__arrow" :class="{ 'is-open': dialogVisible }">
        <ArrowDown />
      </el-icon>
    </div>
    <el-input
      v-else
      :model-value="displayText"
      :placeholder="placeholder"
      :disabled="isDisabled"
      readonly
      class="data-picker__input"
      @click="openDialog"
    >
      <template #suffix>
        <el-tooltip v-if="showClear" content="清空" placement="top">
          <el-icon class="data-picker__clear" @click.stop="clear">
            <Close />
          </el-icon>
        </el-tooltip>
        <el-icon class="data-picker__arrow" :class="{ 'is-open': dialogVisible }">
          <ArrowDown />
        </el-icon>
      </template>
    </el-input>

    <AppDialog
      v-model="dialogVisible"
      class="data-picker-dialog"
      :title="dialogTitle"
      width="880px"
      top="6vh"
    >
      <div v-loading="loading" class="data-picker__dialog">
        <div v-if="field.keywordKey" class="data-picker__search">
          <el-input
            v-model="keyword"
            :placeholder="searchPlaceholder"
            clearable
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          >
            <template #append>
              <el-button @click="handleSearch">搜索</el-button>
            </template>
          </el-input>
        </div>

        <div class="data-picker__table">
          <el-table
            ref="tableRef"
            :data="rows"
            :row-key="rowKey"
            border
            size="default"
            height="100%"
            @select="handleSelect"
            @select-all="handleSelectAll"
            @row-click="handleRowClick"
          >
            <el-table-column v-if="isMultiple" type="selection" width="46" />
            <el-table-column v-else width="50" align="center">
              <template #default="{ row }">
                <el-radio
                  :model-value="activeRowKey"
                  :value="rowKey(row)"
                  @change="handleRadioChange(row)"
                >
                  <span />
                </el-radio>
              </template>
            </el-table-column>
            <el-table-column
              v-for="column in columns"
              :key="column.key"
              :prop="column.key"
              :label="column.label || column.key"
              min-width="130"
              show-overflow-tooltip
              :formatter="(row: any, _col: any, value: any) => row[`${column.key}Label`] || formatSmartCell(value)"
            />
            <template #empty>暂无数据，请检查数据源配置</template>
          </el-table>
        </div>

        <div class="data-picker__pager">
          <el-pagination
            background
            layout="total, sizes, prev, pager, next, jumper"
            :current-page="page"
            :page-size="pageSize"
            :page-sizes="pageSizes"
            :total="total"
            @current-change="handlePageChange"
            @size-change="handleSizeChange"
          />
        </div>
      </div>
      <template #footer>
        <span class="data-picker__footer-hint">
          {{ isMultiple ? `已选 ${checkedCount} 条` : '单选' }}
        </span>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirm">确定</el-button>
      </template>
    </AppDialog>
  </div>
</template>

<style scoped lang="scss">
.data-picker {
  display: flex;
  align-items: center;
  width: 100%;
}

.data-picker__input {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

/* 多选回填的标签容器：外观对齐 el-input，可换行 */
.data-picker__tags {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  position: relative;
  min-width: 0;
  min-height: 32px;
  padding: 4px 28px 4px 6px;
  cursor: pointer;
  background: var(--el-input-bg-color, var(--el-fill-color-blank));
  border: 1px solid var(--el-input-border-color, var(--el-border-color));
  border-radius: var(--el-input-border-radius, 4px);
  transition: border-color 0.2s;

  &:hover {
    border-color: var(--el-input-hover-border-color, var(--el-border-color-hover));
  }

  &.is-disabled {
    cursor: not-allowed;
    background: var(--el-disabled-bg-color);
    border-color: var(--el-disabled-border-color);

    .data-picker__tag {
      cursor: not-allowed;
    }
  }
}

.data-picker__tag {
  max-width: 100%;
  margin: 0;
  cursor: default;

  :deep(.el-tag__content) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

/* 清空图标内聚在输入框 / 标签容器中，悬停变主色，避免原来游离在外的红色文字按钮 */
.data-picker__clear {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  height: 24px;
  color: var(--el-text-color-placeholder);
  cursor: pointer;
  transition: color 0.2s;

  &:hover {
    color: var(--el-color-primary);
  }
}

/* 右侧下拉箭头：模仿 el-select，暗示整个控件可点击选择；弹框打开时翻转 */
.data-picker__arrow {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 24px;
  color: var(--el-text-color-placeholder);
  font-size: 14px;
  cursor: pointer;
  transition: transform 0.2s, color 0.2s;

  &.is-open {
    transform: rotate(180deg);
  }
}

.data-picker:hover .data-picker__arrow {
  color: var(--el-color-primary);
}

/* 多选标签会换行，箭头固定在容器右侧，不随标签挤到中间 */
.data-picker__tags > .data-picker__arrow {
  position: absolute;
  top: 50%;
  right: 8px;
  margin-top: -12px;
}

.data-picker__dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

.data-picker__search {
  flex: none;
  max-width: 360px;
}

.data-picker__table {
  flex: 1;
  min-height: 0;
}

.data-picker__pager {
  display: flex;
  flex: none;
  justify-content: flex-end;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.data-picker__footer-hint {
  float: left;
  padding-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>

<!-- 弹框内容 teleport 到 body，脱离组件 scoped 作用域，这里用独立样式块固定高度 -->
<style lang="scss">
.data-picker-dialog {
  .el-dialog__body {
    height: 520px;
    padding: 0;

    /* 只约束弹框外层滚动条，避免误伤表格自带的滚动容器 */
    > .el-scrollbar,
    > .el-scrollbar > .el-scrollbar__wrap,
    > .el-scrollbar > .el-scrollbar__wrap > .el-scrollbar__view {
      height: 100%;
    }

    > .el-scrollbar > .el-scrollbar__wrap {
      overflow: hidden;
    }

    > .el-scrollbar > .el-scrollbar__wrap > .el-scrollbar__view > .app-dialog__body {
      height: 100%;
    }
  }
}
</style>

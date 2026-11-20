<template>
  <div class="step-panel step-panel--scroll">
    <el-scrollbar>
      <div class="step-card step-card--wide">
        <div class="step-card__head">
          <div>
            <h3 class="step-card__title">查询字段</h3>
            <p class="step-hint">
              列表页顶部的查询条件，拖动左侧手柄可调整顺序；列名可选主表字段或子表字段。
            </p>
          </div>
          <el-button type="primary" plain size="small" @click="addQueryColumn">
            添加查询字段
          </el-button>
        </div>

        <el-table
          :data="listConfig.queryColumns"
          size="small"
          border
          row-key="key"
          empty-text="暂无查询条件，点击「添加查询字段」"
          class="list-config-table"
        >
          <el-table-column label="拖动" width="52" align="center">
            <template #default="{ $index }">
              <span
                class="drag-handle"
                draggable="true"
                title="按住拖动排序"
                @dragstart="onColumnDragStart('query', $index, $event)"
                @dragover="onColumnDragOver"
                @drop="onColumnDrop('query', $index)"
                @dragend="columnDrag = null"
              >
                <el-icon><Grid /></el-icon>
              </span>
            </template>
          </el-table-column>
          <el-table-column label="列名" min-width="230">
            <template #default="{ row }">
              <el-select
                :model-value="columnKeyOf(row)"
                filterable
                placeholder="选择列名"
                style="width: 100%"
                @change="(value: string) => changeQueryColumn(row, value)"
              >
                <el-option
                  v-for="option in columnOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="字段" min-width="135">
            <template #default="{ row }">
              <span class="text-muted">{{ rowFieldLabel(row) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="条件类型" width="120">
            <template #default="{ row }">
              <el-select v-model="row.operator" size="small">
                <el-option
                  v-for="item in OPERATOR_OPTIONS"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="默认值" min-width="130">
            <template #default="{ row }">
              <el-input v-model="row.defaultValue" size="small" clearable placeholder="默认值" />
            </template>
          </el-table-column>
          <el-table-column label="关键词" min-width="160">
            <template #default="{ row }">
              <el-input
                v-model="row.keyword"
                size="small"
                clearable
                placeholder="查询框提示，如：请输入名称"
              />
            </template>
          </el-table-column>
          <el-table-column label="是否多选" width="86" align="center">
            <template #default="{ row }">
              <el-switch v-model="row.multiple" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="是否隐藏" width="86" align="center">
            <template #default="{ row }">
              <el-switch v-model="row.hidden" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="68" align="center">
            <template #default="{ $index }">
              <el-button link type="danger" @click="removeQueryColumn($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div v-if="subtables.length > 0" class="subtable-view">
          <span class="subtable-view__label">明细展示</span>
          <el-radio-group v-model="listConfig.subTableView" size="small">
            <el-radio-button value="merge">合并到列表</el-radio-button>
            <el-radio-button value="expand">展开行</el-radio-button>
          </el-radio-group>
          <span class="subtable-view__hint">
            {{
              listConfig.subTableView === 'merge'
                ? '主表列与子表列放在同一张表，主表单元格按明细行数跨行合并。'
                : '主表一行，点行首箭头用嵌套表格查看明细。'
            }}
          </span>
        </div>

        <div class="step-card__head step-card__head--spaced">
          <div>
            <h3 class="step-card__title">列表字段</h3>
            <p class="step-hint">
              列表表格显示的列，按顺序排列；列名可选主表列或子表列，两种列可以混排。
            </p>
          </div>
          <el-button type="primary" plain size="small" @click="addListColumn">
            添加列表字段
          </el-button>
        </div>

        <el-table
          :data="listConfig.listColumns"
          size="small"
          border
          row-key="key"
          empty-text="至少添加一个列表字段"
          class="list-config-table"
        >
          <el-table-column label="拖动" width="52" align="center">
            <template #default="{ $index }">
              <span
                class="drag-handle"
                draggable="true"
                title="按住拖动排序"
                @dragstart="onColumnDragStart('list', $index, $event)"
                @dragover="onColumnDragOver"
                @drop="onColumnDrop('list', $index)"
                @dragend="columnDrag = null"
              >
                <el-icon><Grid /></el-icon>
              </span>
            </template>
          </el-table-column>
          <el-table-column label="列名" min-width="250">
            <template #default="{ row }">
              <el-select
                :model-value="columnKeyOf(row)"
                filterable
                placeholder="选择列名"
                style="width: 100%"
                @change="(value: string) => changeListColumn(row, value)"
              >
                <el-option
                  v-for="option in columnOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="字段" min-width="135">
            <template #default="{ row }">
              <span class="text-muted">{{ rowFieldLabel(row) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="排序" width="72" align="center">
            <template #default="{ row }">
              <el-switch
                v-model="row.sortable"
                size="small"
                :disabled="row.source === 'subtable'"
              />
            </template>
          </el-table-column>
          <el-table-column label="冻结" width="130">
            <template #default="{ row }">
              <el-select v-model="row.fixed" size="small" placeholder="不冻结">
                <el-option
                  v-for="item in FIXED_OPTIONS"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="对齐" width="112">
            <template #default="{ row }">
              <el-select v-model="row.align" size="small">
                <el-option
                  v-for="item in ALIGN_OPTIONS"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="宽度(px)" width="126">
            <template #default="{ row }">
              <el-input-number
                v-model="row.width"
                size="small"
                :min="60"
                :max="800"
                :step="20"
                :value-on-clear="null"
                controls-position="right"
                placeholder="自适应"
                style="width: 100%"
              />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="68" align="center">
            <template #default="{ $index }">
              <el-button link type="danger" @click="removeListColumn($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-alert
          v-if="subtables.length > 0"
          class="list-config__tip"
          type="info"
          :closable="false"
          show-icon
          :title="subtableListTip"
        />
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ALIGN_OPTIONS, FIXED_OPTIONS, OPERATOR_OPTIONS } from '../designer/model';
import { useDesigner } from '../designer/store';

const {
  addListColumn, addQueryColumn, changeListColumn, changeQueryColumn, columnDrag,
  columnKeyOf, columnOptions, listConfig, onColumnDragOver, onColumnDragStart,
  onColumnDrop, removeListColumn, removeQueryColumn, rowFieldLabel, step,
  subtableListTip, subtables,
} = useDesigner();
</script>

<style scoped lang="scss">
.step-panel {
  flex: 1;
  padding: 16px;
}

.step-panel--scroll {
  min-height: 0;
}

.step-card {
  max-width: 760px;
  padding: 20px;
  margin: 0 auto;
  background: var(--el-fill-color-lighter);
  border-radius: 10px;
}

.step-card__title {
  margin: 0 0 16px;
  font-size: 15px;
  color: var(--el-text-color-primary);
}

.step-card__title--spaced {
  margin-top: 28px;
}

/* 列表设计列多，卡片放宽，超出时表格自己横向滚动 */
.step-card--wide {
  max-width: 1180px;
}

.step-card__head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.step-card__head .step-card__title {
  margin-bottom: 4px;
}

.step-card__head--spaced {
  margin-top: 26px;
}

.subtable-view {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  margin-top: 22px;
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
}

.subtable-view__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.subtable-view__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.list-config-table {
  margin-top: 12px;
}

.list-config-table :deep(.el-table__cell) {
  padding: 6px 0;
}

.drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 28px;
  color: var(--el-text-color-secondary);
  cursor: grab;
}

.drag-handle:active {
  cursor: grabbing;
}

.list-config__tip {
  margin-top: 14px;
}

.step-form {
  max-width: 640px;
}

.step-hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}
</style>

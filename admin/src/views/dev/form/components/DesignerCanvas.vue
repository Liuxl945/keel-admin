<template>
  <main class="designer__canvas" @dragover.prevent="onCanvasDragOver" @drop="onCanvasDrop">
    <el-scrollbar class="canvas__scroll">
      <div class="canvas__inner">
        <div v-if="canvasItems.length === 0 && !dropHint" class="canvas__empty">
          <el-icon class="canvas__empty-icon"><Plus /></el-icon>
          <p>请从左侧拖入控件</p>
        </div>

        <el-form
          :label-width="`${labelWidth}px`"
          :label-position="formSettings.labelPosition"
          :size="elSizeOf(formSettings.formSize)"
          :disabled="formSettings.disabled"
          :label-suffix="formSettings.labelSuffix"
          :hide-required-asterisk="formSettings.hideRequiredAsterisk"
          :show-message="formSettings.showMessage"
          :status-icon="formSettings.statusIcon"
          class="canvas__form"
        >
          <!-- 控件与子表统一混排：子表可以插在任意两个控件中间，插入线就是松手后的位置 -->
          <el-row :gutter="16">
            <template v-for="(item, index) in canvasItems" :key="item.id">
              <el-col
                :span="item.span"
                class="canvas-col"
                @dragover.prevent.stop="onCanvasItemDragOver($event, item)"
              >
                <!-- 落点预览：插入线画在目标卡片的左/右侧 -->
                <span v-if="caretAt(index, 'before')" class="field-caret is-before">
                  <span class="field-caret__chip">{{ dropHintLabel }}</span>
                </span>

                <template v-if="item.kind === 'field' && item.field">
                  <div
                    class="field-card"
                    :class="{
                      'is-selected': selectedId === item.field.id,
                      'is-unbound': !item.field.columnName,
                      'is-dragging': dragFieldId === item.field.id,
                    }"
                    draggable="true"
                    title="拖动卡片可调整位置"
                    @dragstart.stop="onFieldDragStart($event, item.field)"
                    @dragend.stop="onFieldDragEnd"
                    @click.capture="selectField(item.field.id)"
                  >
                    <div class="field-card__bar">
                      <div class="field-card__meta">
                        <span class="field-card__type">
                          {{ typeLabels[item.field.type] }} ·
                          {{ item.field.columnName || '未绑定字段' }}
                        </span>
                        <el-tag
                          v-if="!item.field.columnName"
                          size="small"
                          type="warning"
                          effect="plain"
                          class="field-card__tag"
                        >
                          待绑定
                        </el-tag>
                      </div>
                      <div class="field-card__actions">
                        <!-- <span class="field-card__handle" title="拖动卡片调整位置" @click.stop>
                          <el-icon><Rank /></el-icon>
                        </span> -->
                        <el-icon
                          class="field-card__action"
                          title="复制控件"
                          @click.stop="duplicateField(item.field)"
                        >
                          <CopyDocument />
                        </el-icon>
                        <el-icon
                          v-if="columnMap.get(item.field.columnName || '')?.nullable !== false"
                          class="field-card__action is-danger"
                          title="从表单移除"
                          @click.stop="removeField(item.field)"
                        >
                          <Delete />
                        </el-icon>
                      </div>
                    </div>
                    <el-form-item
                      :label="item.field.label"
                      :required="item.field.required"
                      :label-width="labelWidthOf(item.field)"
                    >
                      <div class="field-card__control" :style="controlBoxStyle(item.field)">
                        <FieldControl
                          :field="item.field"
                          v-model="previewModel[item.field.name]"
                          :values="previewModel"
                          :code-labels="codeFieldLabels"
                        />
                      </div>
                    </el-form-item>
                  </div>
                </template>

                <!-- 子表组件：和普通控件共用同一套栅格，控件可以插在它前后 -->
                <div
                  v-else-if="item.kind === 'subtable' && item.sub"
                  class="subtable-card"
                  :class="{
                    'is-selected':
                      selectedSubtableId === item.sub.id ||
                      selectedSubColumnSubtable?.id === item.sub.id,
                    'is-unbound': !item.sub.tableName,
                    'is-dragging': subtableDragId === item.sub.id,
                    'is-dragover': detailTargetId === item.sub.id,
                  }"
                  @click="selectSubtable(item.sub)"
                  @drop="onSubtableDrop($event, item.sub, item)"
                >
                  <div
                    class="subtable-card__bar"
                    draggable="true"
                    title="按住标题栏拖动可调整子表顺序"
                    @dragstart.stop="onSubtableDragStart($event, item.sub)"
                    @dragend.stop="onSubtableDragEnd"
                  >
                    <span class="subtable-card__handle" title="拖动调整子表顺序" @click.stop>
                      <el-icon><Rank /></el-icon>
                    </span>
                    <el-icon class="subtable-card__icon"><Grid /></el-icon>
                    <span class="subtable-card__title">{{ item.sub.label }}</span>
                    <el-tag v-if="!item.sub.tableName" size="small" type="warning" effect="plain">
                      待关联从表
                    </el-tag>
                    <span v-else class="subtable-card__table">{{ item.sub.tableName }}</span>
                    <el-tag v-if="item.sub.tableName" size="small" type="info" effect="plain">
                      {{ item.sub.mode === 'table' ? '表格录入' : '弹窗编辑' }}
                    </el-tag>
                    <span v-if="item.sub.tableName" class="subtable-card__link">
                      {{ item.sub.foreignKey || '—' }} → {{ item.sub.masterColumn || '—' }}
                    </span>
                    <div class="subtable-card__actions">
                      <el-icon
                        class="subtable-card__action"
                        title="复制子表组件"
                        @click.stop="duplicateSubtable(item.sub)"
                      >
                        <CopyDocument />
                      </el-icon>
                      <el-icon
                        class="subtable-card__action is-danger"
                        title="删除子表"
                        @click.stop="removeSubtable(item.sub)"
                      >
                        <Delete />
                      </el-icon>
                    </div>
                  </div>

                  <div class="subtable-card__fields">
                    <div
                      v-for="(column, columnIndex) in item.sub.columns"
                      :key="column.id"
                      class="sub-col"
                      :class="{
                        'is-hidden': !column.visible,
                        'is-selected': selectedSubColumnRef?.columnId === column.id,
                        'is-unbound': !column.columnName,
                      }"
                      draggable="true"
                      :title="column.required ? '必填字段' : '选填字段'"
                      @dragstart.stop="onSubColumnDragStart($event, item.sub, columnIndex)"
                      @dragover.prevent.stop
                      @drop.stop="onSubColumnDropAt($event, item.sub, columnIndex)"
                      @click.stop="selectSubColumn(item.sub, column)"
                    >
                      <span class="sub-col__label">{{ column.label }}</span>
                      <span class="sub-col__meta">
                        {{ typeLabels[column.type] }} ·
                        {{ column.columnName || '未关联字段' }}
                      </span>
                      <el-icon
                        class="sub-col__action"
                        title="从明细中移除"
                        @click.stop="removeSubColumn(item.sub, columnIndex)"
                      >
                        <Close />
                      </el-icon>
                    </div>
                    <div
                      v-if="item.sub.columns.length === 0"
                      class="subtable-card__empty"
                      draggable="true"
                      title="按住可拖动调整子表顺序"
                      @dragstart.stop="onSubtableDragStart($event, item.sub)"
                      @dragend.stop="onSubtableDragEnd"
                    >
                      {{
                        item.sub.tableName
                          ? '把控件库的控件拖到这里作为明细列'
                          : '先在右侧「组件属性」选择关联的子表，再拖入控件'
                      }}
                    </div>
                  </div>
                </div>

                <span
                  v-if="
                    caretAt(index, 'after') || (appendCaret && index === canvasItems.length - 1)
                  "
                  class="field-caret is-after"
                >
                  <span class="field-caret__chip">{{ dropHintLabel }}</span>
                </span>
              </el-col>
            </template>

            <!-- 空表单：落点提示直接铺在画布上（松手就落成第一个控件） -->
            <el-col v-if="dropHint && canvasItems.length === 0" :span="24">
              <div class="field-dropzone">{{ dropHintLabel }}</div>
            </el-col>

            <el-col v-if="subtables.length === 0 && slaveTables.length > 0" :span="24">
              <div class="subtable-hint">
                把左侧「子表」组件拖到这里，再在右侧选择关联的从表
              </div>
            </el-col>
          </el-row>
        </el-form>
      </div>
    </el-scrollbar>
  </main>
</template>

<script setup lang="ts">
import FieldControl from './FieldControl.vue';
import { controlBoxStyle, labelWidthOf } from './field-style';
import { elSizeOf, typeLabels } from '../designer/model';
import { useDesigner } from '../designer/store';

const {
  appendCaret, canvasItems, caretAt, codeFieldLabels, columnMap, detailTargetId, dragFieldId,
  dropHint, dropHintLabel, duplicateField, duplicateSubtable, formSettings, labelWidth,
  onCanvasDragOver, onCanvasDrop, onCanvasItemDragOver, onFieldDragEnd,
  onFieldDragStart, onSubColumnDragStart, onSubColumnDropAt, onSubtableDragEnd,
  onSubtableDragStart, onSubtableDrop, previewModel, removeField, removeSubColumn,
  removeSubtable, selectField, selectSubColumn, selectSubtable, selectedId,
  selectedSubColumnRef, selectedSubColumnSubtable, selectedSubtableId, slaveTables,
  status, subtableDragId, subtables,
} = useDesigner();
</script>

<style scoped lang="scss">
.designer__canvas {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--el-fill-color-lighter);
}

.canvas__scroll {
  flex: 1;
  min-height: 0;
}

.canvas__inner {
  box-sizing: border-box;
  min-height: 100%;
  padding: 20px;
}

.canvas__empty {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  justify-content: center;
  height: 320px;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
  border: 1px dashed var(--el-border-color);
  border-radius: 10px;
}

.canvas__empty-icon {
  font-size: 28px;
}

.canvas__form :deep(.el-form-item) {
  margin-bottom: 8px;
}

.field-card {
  position: relative;
  padding: 8px 12px 2px;
  margin-bottom: 14px;
  cursor: grab;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    opacity 0.18s ease;
}

.field-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 10px rgb(0 0 0 / 6%);
}

.field-card:active {
  cursor: grabbing;
}

.field-card.is-selected {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-8);
}

/* 正在拖动的卡片：半透明留在原位，实时让位给下方的虚线占位块 */
.field-card.is-dragging {
  opacity: 0.4;
  border-style: dashed;
  box-shadow: none;
}

/* 控件所在栅格：插入线以它为定位基准 */
.canvas-col {
  position: relative;
}

/* 落点预览：插到卡片左侧 / 右侧的竖线 + 悬浮标签，不改变现有排版 */
.field-caret {
  position: absolute;
  top: 5px;
  bottom: 5px;
  z-index: 6;
  width: 3px;
  pointer-events: none;
  background: var(--el-color-primary);
  border-radius: 2px;
  box-shadow: 0 0 0 3px var(--el-color-primary-light-8);
}

.field-caret.is-before {
  left: 2px;
}

.field-caret.is-after {
  right: 2px;
}

.field-caret__chip {
  position: absolute;
  top: 0;
  padding: 2px 8px;
  font-size: 11px;
  line-height: 16px;
  color: #fff;
  white-space: nowrap;
  background: var(--el-color-primary);
  border-radius: 9px;
  box-shadow: 0 2px 6px rgb(0 0 0 / 15%);
}

.field-caret.is-before .field-caret__chip {
  left: 6px;
}

.field-caret.is-after .field-caret__chip {
  right: 6px;
}

/* 空表单时的落点提示 */
.field-dropzone {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-height: 96px;
  font-size: 13px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border: 2px dashed var(--el-color-primary-light-5);
  border-radius: 10px;
}

/* 未绑定字段：虚线 + 提示色，提示还需要在右侧选「控件字段」 */
.field-card.is-unbound {
  background: var(--el-color-warning-light-9);
  border-style: dashed;
  border-color: var(--el-color-warning-light-5);
}

.field-card__bar {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  height: 22px;
  margin-bottom: 4px;
}

.field-card__meta {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.field-card__type {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-card__tag {
  flex: none;
}

/* 控件宽度：外层限宽，内部控件 100% 跟随 */
.field-card__control {
  max-width: 100%;
}

.field-card__actions {
  display: flex;
  gap: 6px;
  align-items: center;
  color: var(--el-text-color-secondary);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.field-card:hover .field-card__actions,
.field-card.is-selected .field-card__actions {
  opacity: 1;
}

.field-card__handle {
  cursor: grab;
}

.field-card:active .field-card__handle {
  cursor: grabbing;
}

.field-card__action {
  font-size: 14px;
  cursor: pointer;
}

.field-card__action.is-danger:hover {
  color: var(--el-color-danger);
}

.subtable-card {
  margin-bottom: 14px;
  overflow: hidden;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.subtable-card.is-selected {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-8);
}

/* 区块拖拽排序：落点区块描边提示 */
.subtable-card.is-dragover {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-5);
}

/* 正在拖动的子表区块 */
.subtable-card.is-dragging {
  opacity: 0.4;
  border-style: dashed;
  box-shadow: none;
}

.subtable-card__handle {
  display: inline-flex;
  align-items: center;
  color: var(--el-text-color-placeholder);
  cursor: grab;
}

.subtable-card__handle:hover {
  color: var(--el-color-primary);
}

.subtable-card__bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  cursor: grab;
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.subtable-card__bar:active {
  cursor: grabbing;
}

.subtable-card__icon {
  color: var(--el-color-primary);
}

.subtable-card__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.subtable-card__table {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.subtable-card__link {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.subtable-card__actions {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-left: auto;
  color: var(--el-text-color-secondary);
}

.subtable-card__action {
  font-size: 14px;
  cursor: pointer;
}

.subtable-card__action:hover {
  color: var(--el-color-primary);
}

.subtable-card__action.is-danger:hover {
  color: var(--el-color-danger);
}

.subtable-card__action.is-disabled {
  color: var(--el-text-color-disabled);
  pointer-events: none;
}

.subtable-card__fields {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 56px;
  padding: 12px;
}

.sub-col {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 150px;
  padding: 6px 22px 6px 10px;
  cursor: grab;
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 6px;
}

.sub-col.is-hidden {
  opacity: 0.55;
  border-style: dashed;
}

.sub-col.is-unbound {
  background: var(--el-color-warning-light-9);
  border-color: var(--el-color-warning-light-5);
  border-style: dashed;
}

.sub-col.is-selected {
  border-color: var(--el-color-primary);
  border-style: solid;
  box-shadow: 0 0 0 1px var(--el-color-primary-light-5);
}

.subtable-card.is-unbound {
  background: var(--el-fill-color-lighter);
  border-style: dashed;
  border-color: var(--el-color-warning-light-5);
}

.sub-col__label {
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub-col__meta {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.sub-col__action {
  position: absolute;
  top: 5px;
  right: 5px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.sub-col__action:hover {
  color: var(--el-color-danger);
}

.subtable-card__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 16px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
}

.subtable-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 64px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  border: 1px dashed var(--el-border-color);
  border-radius: 10px;
}
</style>

<template>
  <aside class="designer__palette">
    <el-scrollbar class="designer__panel-scroll">
      <div class="designer__panel-title designer__panel-title--row">
        <span>控件库</span>
        <el-button link type="primary" size="small" @click="handleGenerateAll">按表生成</el-button>
      </div>
      <div v-for="group in controlGroups" :key="group.key" class="palette-group">
        <div class="palette-group__head">
          <span class="palette-group__title">{{ group.label }}</span>
          <span class="palette-group__count">{{ group.items.length }} 个</span>
        </div>
        <div v-if="group.items.length > 0" class="control-palette">
          <div
            v-for="control in group.items"
            :key="control.type"
            class="control-palette__item"
            draggable="true"
            :title="`${group.hint}${control.label}`"
            @dragstart="onControlDragStart($event, control.type)"
            @click="addControl(control.type)"
          >
            <el-icon><component :is="control.icon" /></el-icon>
            <span>{{ control.label }}</span>
          </div>
        </div>
        <div v-else class="palette-group__empty">该分组暂无控件</div>
      </div>

      <p class="designer__tip">
        控件可以一直拖：有可用的数据库字段会自动关联，没有就先建成「未绑定」。
        画布里的卡片整块都能按住拖动，拖动时虚线框就是松手后的位置。
        进入下一步前，需要在右侧给每个控件选择「控件字段」；非空字段必须保留
      </p>

      <div class="designer__panel-title designer__panel-title--row designer__panel-title--spaced">
        <span>布局组件</span>
        <span class="designer__panel-hint">{{ slaveTables.length }} 张从表可用</span>
      </div>
      <div class="control-palette">
        <div
          class="control-palette__item"
          draggable="true"
          title="拖入表单或点击添加子表组件"
          @dragstart="onSubtableBlockDragStart($event)"
          @click="addSubtableBlock()"
        >
          <el-icon><Grid /></el-icon>
          <span>子表</span>
        </div>
      </div>
      <p class="designer__tip">
        子表组件可以放多个：拖进画布后到右侧「组件属性」选择关联的子表；
        明细列直接从上面的控件库拖进子表区块，再给每一列选择从表字段
      </p>
    </el-scrollbar>
  </aside>
</template>

<script setup lang="ts">
import { controlGroups } from '../designer/model';
import { useDesigner } from '../designer/store';

const {
  addControl, addSubtableBlock, handleGenerateAll, onControlDragStart,
  onSubtableBlockDragStart, slaveTables,
} = useDesigner();
</script>

<style scoped lang="scss">
.designer__palette {
  display: flex;
  flex: none;
  flex-direction: column;
  width: 230px;
  min-height: 0;
  padding: 12px;
  border-right: 1px solid var(--el-border-color-lighter);
}

.designer__panel-title {
  flex: none;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.designer__panel-title--row {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.palette-group + .palette-group {
  padding-top: 12px;
  margin-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.palette-group__head {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.palette-group__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.palette-group__count {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.palette-group__empty {
  padding: 12px 8px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  text-align: center;
  background: var(--el-fill-color-lighter);
  border: 1px dashed var(--el-border-color-lighter);
  border-radius: 8px;
}

.control-palette {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 8px;
}

.control-palette__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  justify-content: center;
  padding: 8px 4px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  cursor: grab;
  user-select: none;
  background: var(--el-fill-color-lighter);
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  transition:
    color 0.16s ease,
    background 0.16s ease,
    border-color 0.16s ease;
}

.control-palette__item:hover {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
}

.control-palette__item:active {
  cursor: grabbing;
}

.control-palette__item .el-icon {
  font-size: 16px;
}

.designer__panel-scroll {
  flex: 1;
  min-height: 0;
}

.designer__tip {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-placeholder);
}

.designer__panel-title--spaced {
  margin-top: 18px;
}

.designer__panel-hint {
  font-size: 11px;
  font-weight: 400;
  color: var(--el-text-color-placeholder);
}
</style>

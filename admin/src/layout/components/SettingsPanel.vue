<script setup lang="ts">
import { PRESET_COLORS, useSettingsStore } from '@/stores/settings';

const settings = useSettingsStore();
</script>

<template>
  <el-drawer v-model="settings.panelVisible" title="界面设置" size="300px" append-to-body>
    <el-scrollbar>
      <div class="settings">
        <section class="settings__section">
          <h4 class="settings__title">主题色</h4>
          <div class="settings__colors">
            <button
              v-for="color in PRESET_COLORS"
              :key="color.value"
              type="button"
              class="settings__color"
              :class="{ 'is-active': settings.primary === color.value }"
              :style="{ background: color.value }"
              :title="color.name"
              @click="settings.setPrimary(color.value)"
            />
          </div>
        </section>

        <section class="settings__section">
          <h4 class="settings__title">深色模式</h4>
          <el-switch
            :model-value="settings.dark"
            active-text="开启"
            inactive-text="关闭"
            @change="settings.setDark(Boolean($event))"
          />
        </section>

        <section class="settings__section">
          <h4 class="settings__title">布局说明</h4>
          <p class="settings__tip">多页签在顶部展示已访问页面，点击可切换，右侧可关闭；首页页签固定保留。</p>
        </section>

        <el-button class="settings__reset" @click="settings.reset">恢复默认</el-button>
      </div>
    </el-scrollbar>
  </el-drawer>
</template>

<style scoped lang="scss">
.settings {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 4px 4px 16px;
}

.settings__title {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.settings__colors {
  display: flex;
  gap: 12px;
}

.settings__color {
  width: 30px;
  height: 30px;
  padding: 0;
  cursor: pointer;
  border: 2px solid transparent;
  border-radius: 8px;
  transition: transform 0.15s ease;
}

.settings__color:hover {
  transform: scale(1.08);
}

.settings__color.is-active {
  border-color: var(--el-text-color-primary);
  box-shadow: 0 0 0 2px #fff inset;
}

.settings__tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.settings__reset {
  align-self: flex-start;
}
</style>

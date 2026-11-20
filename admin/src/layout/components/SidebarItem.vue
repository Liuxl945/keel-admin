<script setup lang="ts">
import type { MenuNode } from '@/types/entities';

defineOptions({ name: 'SidebarItem' });

withDefaults(defineProps<{ item: MenuNode; depth?: number }>(), { depth: 0 });
</script>

<template>
  <template v-if="item.visible">
    <el-sub-menu v-if="item.children?.length" :index="item.path || `dir-${item.id}`">
      <template #title>
        <!-- 只有一级菜单展示图标，二级菜单保持纯文字更清爽 -->
        <el-icon v-if="item.icon && depth === 0"><component :is="item.icon" /></el-icon>
        <span>{{ item.name }}</span>
      </template>
      <SidebarItem v-for="child in item.children" :key="child.id" :item="child" :depth="depth + 1" />
    </el-sub-menu>
    <el-menu-item v-else-if="item.path" :index="item.path">
      <el-icon v-if="item.icon && depth === 0"><component :is="item.icon" /></el-icon>
      <template #title>{{ item.name }}</template>
    </el-menu-item>
  </template>
</template>

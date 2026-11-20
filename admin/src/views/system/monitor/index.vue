<script setup lang="ts">
defineOptions({ name: 'SystemMonitor' });

import { computed, onMounted, onUnmounted, ref } from 'vue';
import { getServerInfo } from '@/api/monitor';
import { formatDateTime } from '@/utils/datetime';
import type { ServerInfo } from '@/types/entities';

const loading = ref(false);
const info = ref<ServerInfo | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;

async function load(): Promise<void> {
  loading.value = true;
  try {
    info.value = await getServerInfo();
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    loading.value = false;
  }
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时 ${minutes} 分`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分钟`;
}

function progressColor(percent: number): string {
  if (percent >= 90) return '#f56c6c';
  if (percent >= 75) return '#e6a23c';
  return '#409eff';
}

const processPercent = computed(() => {
  if (!info.value || !info.value.processMemory.heapTotal) return 0;
  return Math.round((info.value.processMemory.heapUsed / info.value.processMemory.heapTotal) * 1000) / 10;
});

onMounted(() => {
  void load();
  timer = setInterval(() => void load(), 10000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
  timer = null;
});
</script>

<template>
  <div v-loading="loading" class="monitor">
    <div class="monitor__head">
      <div>
        <h2 class="monitor__title">服务监控</h2>
        <p class="monitor__subtitle">每 10 秒自动刷新，展示 Node 进程与宿主机的实时状态</p>
      </div>
      <el-button :loading="loading" @click="load">刷新</el-button>
    </div>

    <template v-if="info">
      <el-row :gutter="16">
        <el-col :xs="24" :sm="12" :md="8">
          <div class="monitor-card">
            <div class="monitor-card__head">
              <span>CPU</span>
              <span class="monitor-card__value">{{ info.cpu.usagePercent }}%</span>
            </div>
            <el-progress :percentage="info.cpu.usagePercent" :color="progressColor(info.cpu.usagePercent)" :show-text="false" />
            <div class="monitor-card__meta">
              {{ info.cpu.cores }} 核 · 负载 {{ info.cpu.load1.toFixed(2) }} / {{ info.cpu.load5.toFixed(2) }} / {{ info.cpu.load15.toFixed(2) }}
            </div>
            <div class="monitor-card__hint">{{ info.cpu.model }}</div>
          </div>
        </el-col>

        <el-col :xs="24" :sm="12" :md="8">
          <div class="monitor-card">
            <div class="monitor-card__head">
              <span>内存</span>
              <span class="monitor-card__value">{{ info.memory.usagePercent }}%</span>
            </div>
            <el-progress :percentage="info.memory.usagePercent" :color="progressColor(info.memory.usagePercent)" :show-text="false" />
            <div class="monitor-card__meta">
              已用 {{ formatBytes(info.memory.used) }} / 共 {{ formatBytes(info.memory.total) }}
            </div>
            <div class="monitor-card__hint">空闲 {{ formatBytes(info.memory.free) }}</div>
          </div>
        </el-col>

        <el-col :xs="24" :sm="12" :md="8">
          <div class="monitor-card">
            <div class="monitor-card__head">
              <span>磁盘</span>
              <span class="monitor-card__value">{{ info.disk.usagePercent }}%</span>
            </div>
            <el-progress :percentage="info.disk.usagePercent" :color="progressColor(info.disk.usagePercent)" :show-text="false" />
            <div class="monitor-card__meta">
              已用 {{ formatBytes(info.disk.used) }} / 共 {{ formatBytes(info.disk.total) }}
            </div>
            <div class="monitor-card__hint">空闲 {{ formatBytes(info.disk.free) }}</div>
          </div>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :xs="24" :md="12">
          <div class="monitor-panel">
            <h3 class="monitor-panel__title">主机信息</h3>
            <el-descriptions :column="1" border>
              <el-descriptions-item label="主机名">{{ info.hostname }}</el-descriptions-item>
              <el-descriptions-item label="操作系统">
                {{ info.platform }} {{ info.release }}（{{ info.arch }}）
              </el-descriptions-item>
              <el-descriptions-item label="Node 版本">{{ info.nodeVersion }}</el-descriptions-item>
              <el-descriptions-item label="系统运行时长">{{ formatUptime(info.uptime) }}</el-descriptions-item>
              <el-descriptions-item label="进程运行时长">{{ formatUptime(info.processUptime) }}</el-descriptions-item>
            </el-descriptions>
          </div>
        </el-col>

        <el-col :xs="24" :md="12">
          <div class="monitor-panel">
            <h3 class="monitor-panel__title">进程与数据库</h3>
            <el-descriptions :column="1" border>
              <el-descriptions-item label="进程 RSS">{{ formatBytes(info.processMemory.rss) }}</el-descriptions-item>
              <el-descriptions-item label="堆内存">
                {{ formatBytes(info.processMemory.heapUsed) }} / {{ formatBytes(info.processMemory.heapTotal) }}
                （{{ processPercent }}%）
              </el-descriptions-item>
              <el-descriptions-item label="External">{{ formatBytes(info.processMemory.external) }}</el-descriptions-item>
              <el-descriptions-item label="数据库">
                {{ info.database.type }}
                <el-tag :type="info.database.status === 'UP' ? 'success' : 'danger'" class="ml-8">
                  {{ info.database.status }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="采集时间">{{ formatDateTime(info.time, true) }}</el-descriptions-item>
            </el-descriptions>
          </div>
        </el-col>
      </el-row>
    </template>
  </div>
</template>

<style scoped lang="scss">
.monitor {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.monitor__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.monitor__title {
  margin: 0;
  font-size: 18px;
  color: #1f2d3d;
}

.monitor__subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: #8a94a6;
}

.monitor-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 150px;
  padding: 20px;
  margin-bottom: 16px;
  background: #fff;
  border-radius: 10px;
}

.monitor-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  color: #606266;
}

.monitor-card__value {
  font-size: 24px;
  font-weight: 700;
  color: #1f2d3d;
}

.monitor-card__meta {
  font-size: 13px;
  color: #606266;
}

.monitor-card__hint {
  overflow: hidden;
  font-size: 12px;
  color: #a0a9b8;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.monitor-panel {
  padding: 20px;
  margin-bottom: 16px;
  background: #fff;
  border-radius: 10px;
}

.monitor-panel__title {
  margin: 0 0 14px;
  font-size: 15px;
  color: #1f2d3d;
}

.ml-8 {
  margin-left: 8px;
}
</style>

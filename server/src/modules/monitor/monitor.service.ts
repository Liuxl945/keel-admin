import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from '../../config';
import { AppDataSource } from '../../db/data-source';

function percent(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((used / total) * 1000) / 10;
}

export async function getServerInfo() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const cpus = os.cpus();
  const [load1, load5, load15] = os.loadavg();
  const processMemory = process.memoryUsage();

  let disk = { total: 0, free: 0, used: 0, usagePercent: 0 };
  try {
    const stats = await fs.statfs(path.parse(process.cwd()).root);
    const blockSize = Number(stats.bsize);
    const total = Number(stats.blocks) * blockSize;
    const free = Number(stats.bavail) * blockSize;
    const used = total - free;
    disk = { total, free, used, usagePercent: percent(used, total) };
  } catch {
    // 某些文件系统不支持 statfs，监控页展示为 0 即可，不影响其他指标
  }

  let databaseStatus = 'DOWN';
  try {
    if (AppDataSource.isInitialized) {
      await AppDataSource.query('SELECT 1');
      databaseStatus = 'UP';
    }
  } catch {
    databaseStatus = 'DOWN';
  }

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    nodeVersion: process.version,
    time: new Date(),
    uptime: os.uptime(),
    processUptime: process.uptime(),
    cpu: {
      model: cpus[0]?.model ?? '-',
      cores: cpus.length,
      load1,
      load5,
      load15,
      usagePercent: Math.min(100, percent(load1, cpus.length || 1)),
    },
    memory: {
      total: totalMemory,
      free: freeMemory,
      used: usedMemory,
      usagePercent: percent(usedMemory, totalMemory),
    },
    processMemory: {
      rss: processMemory.rss,
      heapTotal: processMemory.heapTotal,
      heapUsed: processMemory.heapUsed,
      external: processMemory.external,
    },
    disk,
    database: {
      type: config.DB_TYPE,
      status: databaseStatus,
    },
  };
}

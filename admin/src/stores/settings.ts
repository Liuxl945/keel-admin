import { defineStore } from 'pinia';
import { ref } from 'vue';

const DARK_KEY = 'admin_theme_dark';
const PRIMARY_KEY = 'admin_theme_primary';

export const PRESET_COLORS = [
  { name: '拂晓蓝', value: '#409eff' },
  { name: '极光绿', value: '#18a058' },
  { name: '日暮橙', value: '#e6a23c' },
  { name: '玫瑰红', value: '#f56c6c' },
  { name: '暮山紫', value: '#7c4dff' },
];

function mixColor(hex: string, target: string, weight: number): string {
  const parse = (value: string) => {
    const raw = value.replace('#', '');
    const full = raw.length === 3 ? raw.split('').map((char) => char + char).join('') : raw;
    return [
      Number.parseInt(full.slice(0, 2), 16),
      Number.parseInt(full.slice(2, 4), 16),
      Number.parseInt(full.slice(4, 6), 16),
    ];
  };

  const base = parse(hex);
  const goal = parse(target);
  const mixed = base.map((channel, index) => Math.round(channel * (1 - weight) + goal[index] * weight));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export const useSettingsStore = defineStore('settings', () => {
  const dark = ref(localStorage.getItem(DARK_KEY) === '1');
  const primary = ref(localStorage.getItem(PRIMARY_KEY) || PRESET_COLORS[0].value);
  const panelVisible = ref(false);

  /** 同步 Element Plus 主题变量：主色 + light-3/5/7/8/9 + dark-2 */
  function apply(): void {
    const root = document.documentElement;
    root.classList.toggle('dark', dark.value);
    root.style.setProperty('--el-color-primary', primary.value);
    for (const [level, weight] of [
      [3, 0.3],
      [5, 0.5],
      [7, 0.7],
      [8, 0.8],
      [9, 0.9],
    ] as const) {
      root.style.setProperty(`--el-color-primary-light-${level}`, mixColor(primary.value, '#ffffff', weight));
    }
    root.style.setProperty('--el-color-primary-dark-2', mixColor(primary.value, '#000000', 0.2));
  }

  function setDark(value: boolean): void {
    dark.value = value;
    localStorage.setItem(DARK_KEY, value ? '1' : '0');
    apply();
  }

  function setPrimary(value: string): void {
    primary.value = value;
    localStorage.setItem(PRIMARY_KEY, value);
    apply();
  }

  function reset(): void {
    setDark(false);
    setPrimary(PRESET_COLORS[0].value);
  }

  function togglePanel(): void {
    panelVisible.value = !panelVisible.value;
  }

  apply();

  return { dark, primary, panelVisible, setDark, setPrimary, reset, togglePanel };
});

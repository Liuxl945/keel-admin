import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getDictOptions } from '@/api/dict';
import type { DictData, DictTagType } from '@/types/entities';

export const useDictStore = defineStore('dict', () => {
  const dicts = ref<Record<string, DictData[]>>({});
  const loaded = ref(false);
  let loadingPromise: Promise<void> | null = null;

  /** 所有字典标签共享一次请求，避免表格每行都查一次 */
  async function load(force = false): Promise<void> {
    if (loaded.value && !force) return;
    if (loadingPromise) return loadingPromise;
    loadingPromise = getDictOptions()
      .then((data) => {
        dicts.value = data;
        loaded.value = true;
      })
      .catch(() => {
        // 字典失败不阻塞页面，标签回退显示原始值
      })
      .finally(() => {
        loadingPromise = null;
      });
    return loadingPromise;
  }

  function getData(type: string): DictData[] {
    return dicts.value[type] ?? [];
  }

  function getLabel(type: string, value: string | null | undefined): string {
    if (!value) return '-';
    return getData(type).find((item) => item.dictValue === value)?.dictLabel ?? value;
  }

  function getTagType(type: string, value: string | null | undefined): DictTagType {
    return getData(type).find((item) => item.dictValue === value)?.tagType ?? 'info';
  }

  function clear(): void {
    dicts.value = {};
    loaded.value = false;
  }

  return { dicts, loaded, load, getData, getLabel, getTagType, clear };
});

/** 一张子表的明细行集合 */
export type SubTableDetailMap = Record<string, Record<string, unknown>[]>;

const cache = new Map<string, SubTableDetailMap>();
const inflight = new Map<string, Promise<SubTableDetailMap>>();

/**
 * 带缓存的明细读取。
 *
 * el-table 存在固定列时会把展开行渲染两份，两个组件实例会各请求一次明细接口；
 * 这里按 key 合并并发请求并缓存结果。key 由调用方带上明细版本号，
 * 主表写操作后清空缓存即可读到最新明细。
 */
export async function loadDetailsCached(
  key: string,
  loader: () => Promise<SubTableDetailMap>,
): Promise<SubTableDetailMap> {
  const cached = cache.get(key);
  if (cached) return cached;

  let pending = inflight.get(key);
  if (!pending) {
    pending = loader();
    inflight.set(key, pending);
  }

  try {
    const data = await pending;
    cache.set(key, data);
    return data;
  } finally {
    inflight.delete(key);
  }
}

/** 主表新增/编辑/删除后调用，避免展开区残留旧明细 */
export function clearSubTableDetailCache(): void {
  cache.clear();
  inflight.clear();
}

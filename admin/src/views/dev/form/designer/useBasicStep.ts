/**
 * 第 1 步「基础设计」：数据连接、主表结构、主从表关系。
 * 只负责表相关状态，字段/子表/列表由其它模型响应式派生。
 */
import { computed, ref, type Ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getSyncedTable, listSyncedTables, syncTables } from '@/api/dev-db-table';
import type { DevDataSourceOption, SyncedColumn, SyncedTableSummary } from '@/types/dev-db';
import { SYSTEM_COLUMNS, newId, type SlaveTableDraft } from './model';

export interface BasicStepDeps {
  formId: Ref<number>;
  markDirty: () => void;
  /** 切换连接/主表时清空后续步骤的设计结果（tables＝字段由调用方按新表重建） */
  resetDesign: (mode: 'all' | 'tables') => void;
  /** 从表关系变化后裁剪失效的明细区块 */
  pruneSubtables: () => void;
  /** 当前是否已有表单字段 */
  hasFields: () => boolean;
  /** 按主表结构重建字段（切换主表 / 按表生成时用） */
  regenerateFields: () => void;
}

export function useBasicStep(deps: BasicStepDeps) {
  const dataSources = ref<DevDataSourceOption[]>([]);
  const connectionId = ref<number | null>(null);
  const activeConnectionId = ref<number | null>(null);
  const syncedTables = ref<SyncedTableSummary[]>([]);
  const tableName = ref('');
  const activeTableName = ref('');
  const tableColumns = ref<SyncedColumn[]>([]);
  const tableComment = ref('');
  const tableLoading = ref(false);
  const syncing = ref(false);
  const slaveTables = ref<SlaveTableDraft[]>([]);

  /** 表选择器只展示结构兼容、可作为表单数据源的表 */
  const selectableTables = computed(() => syncedTables.value.filter((item) => item.importable));

  /** 只允许关联主表主键，和后端 validateTableRelations 的规则一致 */
  const masterKeyColumns = computed(() => tableColumns.value.filter((column) => column.primary));
  const defaultMasterColumn = computed(() => masterKeyColumns.value[0]?.columnName ?? '');

  /** 从表候选：同连接下已同步的表，排除主表本身；明细表不要求具备 id/时间戳 */
  const slaveTableOptions = computed(() =>
    syncedTables.value.filter((item) => item.tableName !== tableName.value),
  );

  /** 主表业务列：排除系统列与不支持的类型 */
  const businessColumns = computed(() =>
    tableColumns.value.filter(
      (column) => !SYSTEM_COLUMNS.has(column.columnName) && column.supported && column.type,
    ),
  );

  // 新表单没有历史连接时，默认选中数据连接里标记的默认项
  function defaultConnectionId(): number | null {
    return dataSources.value.find((item) => item.isDefault)?.id ?? dataSources.value[0]?.id ?? null;
  }

  async function loadSyncedTables(): Promise<void> {
    if (!connectionId.value) {
      syncedTables.value = [];
      return;
    }
    const result = await listSyncedTables({
      connectionId: connectionId.value,
      page: 1,
      pageSize: 200,
    }).catch(() => null);
    syncedTables.value = result?.list ?? [];
  }

  /**
   * 读取主表结构。
   * @param regenerate 表换了之后是否按新列重建字段
   */
  async function loadTableDetail(name: string, regenerate: boolean): Promise<boolean> {
    const summary = syncedTables.value.find((item) => item.tableName === name);
    if (!summary) {
      ElMessage.warning('该表尚未同步，请先点击「同步表结构」');
      return false;
    }
    if (!summary.importable) {
      ElMessage.error(`该表不能作为表单数据源：${summary.importMessage || '结构不兼容'}`);
      return false;
    }
    tableLoading.value = true;
    try {
      const detail = await getSyncedTable(summary.id);
      tableColumns.value = detail.columns;
      tableComment.value = detail.tableComment ?? '';
      if (regenerate) deps.regenerateFields();
      return true;
    } finally {
      tableLoading.value = false;
    }
  }

  async function handleConnectionChange(value: number | null): Promise<void> {
    const previous = activeConnectionId.value;
    if (value === previous) return;
    if (deps.hasFields()) {
      try {
        await ElMessageBox.confirm(
          '切换数据连接会清空当前表关联和已设计字段，确定继续吗？',
          '切换连接',
          { type: 'warning', confirmButtonText: '切换' },
        );
      } catch {
        connectionId.value = previous;
        return;
      }
    }
    activeConnectionId.value = value;
    tableName.value = '';
    activeTableName.value = '';
    tableColumns.value = [];
    tableComment.value = '';
    slaveTables.value = [];
    syncedTables.value = [];
    deps.resetDesign('all');
    deps.markDirty();
    await loadSyncedTables();
  }

  async function handleTableChange(value: string): Promise<void> {
    const previous = activeTableName.value;
    if (value === previous) return;
    if (deps.hasFields() || slaveTables.value.length > 0) {
      try {
        await ElMessageBox.confirm(
          '切换主表会按新表字段重新生成表单，并清空已有的从表关联，确定继续吗？',
          '切换主表',
          { type: 'warning', confirmButtonText: '切换' },
        );
      } catch {
        tableName.value = previous;
        return;
      }
    }
    const loaded = await loadTableDetail(value, true);
    if (!loaded) {
      tableName.value = previous;
      return;
    }
    activeTableName.value = value;
    // 主表一换，原有外键关系全部失效，明细也要跟着清空
    slaveTables.value = [];
    deps.resetDesign('tables');
    deps.markDirty();
  }

  async function handleSyncTables(): Promise<void> {
    if (!connectionId.value) return;
    syncing.value = true;
    try {
      const result = await syncTables(connectionId.value);
      ElMessage.success(`已同步 ${result.count} 张表`);
      await loadSyncedTables();
      if (tableName.value) await loadTableDetail(tableName.value, false);
      // 表结构可能变了，从表的外键/列信息要一起刷新
      if (slaveTables.value.length > 0) {
        await Promise.all(slaveTables.value.map((slave) => loadSlaveColumns(slave)));
      }
    } catch {
      // 错误提示由 request 拦截器统一处理
    } finally {
      syncing.value = false;
    }
  }

  /**
   * 从表外键候选：除自身自增主键 id 之外的列。
   * 不能按 primary 排除——多对多关联表的外键往往是复合主键的一部分。
   */
  function slaveForeignKeyOptions(slave: SlaveTableDraft): SyncedColumn[] {
    return slave.columns.filter((column) => column.columnName !== 'id');
  }

  /**
   * 按命名约定猜外键：order_items.order_id → orders / order。
   * 猜不中时退回任意 *_id 列，仍猜不到就留空让用户手选。
   */
  function guessForeignKey(columns: SyncedColumn[]): string {
    const names = new Set(
      columns.filter((column) => column.columnName !== 'id').map((column) => column.columnName),
    );
    const master = tableName.value;
    if (master) {
      const bases = new Set([
        master,
        master.replace(/ies$/, 'y'),
        master.replace(/es$/, ''),
        master.replace(/s$/, ''),
      ]);
      for (const base of bases) {
        if (base && names.has(`${base}_id`)) return `${base}_id`;
      }
    }
    return [...names].find((name) => name.endsWith('_id')) ?? '';
  }

  async function loadSlaveColumns(slave: SlaveTableDraft): Promise<void> {
    const summary = syncedTables.value.find((item) => item.tableName === slave.tableName);
    if (!summary) {
      slave.columns = [];
      return;
    }
    slave.loading = true;
    try {
      const detail = await getSyncedTable(summary.id);
      slave.columns = detail.columns;
      slave.tableComment = detail.tableComment ?? '';
      // 回显时保留已配置的外键，只有失效或未填才重新推断
      if (!slave.foreignKey || !slave.columns.some((column) => column.columnName === slave.foreignKey)) {
        slave.foreignKey = guessForeignKey(slave.columns);
      }
      if (!slave.masterColumn) slave.masterColumn = defaultMasterColumn.value;
    } catch {
      slave.columns = [];
    } finally {
      slave.loading = false;
    }
  }

  function addSlaveTable(): void {
    slaveTables.value.push({
      key: newId(),
      tableName: '',
      tableComment: '',
      foreignKey: '',
      masterColumn: defaultMasterColumn.value,
      columns: [],
      loading: false,
    });
    deps.markDirty();
  }

  function removeSlaveTable(index: number): void {
    slaveTables.value.splice(index, 1);
    deps.pruneSubtables();
    deps.markDirty();
  }

  async function handleSlaveTableChange(slave: SlaveTableDraft): Promise<void> {
    slave.columns = [];
    slave.foreignKey = '';
    slave.masterColumn = defaultMasterColumn.value;
    await loadSlaveColumns(slave);
    deps.markDirty();
  }

  /** 同一张从表只能挂一次，否则一条主记录会对出重复明细 */
  function isSlavePicked(name: string, exceptKey: string): boolean {
    return slaveTables.value.some((slave) => slave.key !== exceptKey && slave.tableName === name);
  }

  function validateTableRelations(): string | null {
    const seen = new Set<string>();
    for (const slave of slaveTables.value) {
      if (!slave.tableName) return '请为每一张从表选择数据表';
      if (slave.tableName === tableName.value) return '从表不能与主表相同';
      if (seen.has(slave.tableName)) return `从表重复关联：${slave.tableName}`;
      seen.add(slave.tableName);
      if (!slave.foreignKey) return `请为从表「${slave.tableName}」选择外键字段`;
      if (!slave.masterColumn) return `请为从表「${slave.tableName}」选择关联的主表主键`;
      if (slave.columns.length === 0) return `从表「${slave.tableName}」的字段尚未加载，请重新选择该表`;
    }
    return null;
  }

  /** 只校验表相关：表单名/连接由调用方先校验 */
  function validateTableStep(): string | null {
    if (!tableName.value) return '请选择数据库表';
    if (businessColumns.value.length === 0) return '该表没有可用的业务字段，请检查表结构或同步状态';
    if (slaveTables.value.length > 0 && masterKeyColumns.value.length === 0) {
      return '主表缺少主键字段，无法建立主从关联';
    }
    return validateTableRelations();
  }

  return {
    dataSources,
    connectionId,
    activeConnectionId,
    syncedTables,
    tableName,
    activeTableName,
    tableColumns,
    tableComment,
    tableLoading,
    syncing,
    slaveTables,
    selectableTables,
    masterKeyColumns,
    defaultMasterColumn,
    slaveTableOptions,
    businessColumns,
    defaultConnectionId,
    loadSyncedTables,
    loadTableDetail,
    handleConnectionChange,
    handleTableChange,
    handleSyncTables,
    slaveForeignKeyOptions,
    loadSlaveColumns,
    addSlaveTable,
    removeSlaveTable,
    handleSlaveTableChange,
    isSlavePicked,
    validateTableRelations,
    validateTableStep,
  };
}

export type BasicStepModel = ReturnType<typeof useBasicStep>;

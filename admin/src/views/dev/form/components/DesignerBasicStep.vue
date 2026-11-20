<template>
  <div v-if="step === 1" class="step-panel step-panel--scroll">
    <el-scrollbar>
      <div class="step-card">
        <h3 class="step-card__title">基础信息</h3>
        <el-form label-width="110px" class="step-form">
          <el-form-item label="表单名称" required>
            <el-input v-model="formName" maxlength="100" placeholder="如 客户信息登记" />
          </el-form-item>
          <el-form-item label="表单说明">
            <el-input v-model="formDescription" type="textarea" :rows="2" maxlength="500" />
          </el-form-item>
          <el-form-item label="数据连接" required>
            <el-select
              v-model="connectionId"
              placeholder="请选择数据连接"
              style="width: 100%"
              @change="handleConnectionChange"
            >
              <el-option
                v-for="item in dataSources"
                :key="item.id"
                :label="`${item.name}（${item.dbType} / ${item.databaseName}）`"
                :value="item.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="主表" required>
            <div class="table-select-row">
              <el-select
                v-model="tableName"
                placeholder="请选择数据库表"
                filterable
                style="flex: 1"
                :disabled="!connectionId"
                :loading="tableLoading"
                @change="handleTableChange"
              >
                <el-option
                  v-for="item in selectableTables"
                  :key="item.id"
                  :label="`${item.tableName}${item.tableComment ? `（${item.tableComment}）` : ''}`"
                  :value="item.tableName"
                />
              </el-select>
              <el-button :loading="syncing" :disabled="!connectionId" @click="handleSyncTables">
                同步表结构
              </el-button>
            </div>
            <p class="step-hint">
              表单字段、查询与列表都基于主表；表必须包含 id 主键和 created_at / updated_at / deleted_at 字段。
            </p>
          </el-form-item>
          <el-form-item label="从表">
            <div class="slave-tables">
              <p v-if="slaveTables.length === 0" class="step-hint slave-tables__empty">
                暂无从表。「订单 + 订单明细」这类一对多数据，把明细表加为从表，用外键指向主表主键即可。
              </p>
              <div v-for="(slave, index) in slaveTables" :key="slave.key" class="slave-row">
                <el-select
                  v-model="slave.tableName"
                  placeholder="选择从表"
                  filterable
                  class="slave-row__table"
                  :loading="slave.loading"
                  @change="handleSlaveTableChange(slave)"
                >
                  <el-option
                    v-for="item in slaveTableOptions"
                    :key="item.id"
                    :label="`${item.tableName}${item.tableComment ? `（${item.tableComment}）` : ''}`"
                    :value="item.tableName"
                    :disabled="isSlavePicked(item.tableName, slave.key)"
                  />
                </el-select>
                <el-select
                  v-model="slave.foreignKey"
                  placeholder="外键字段"
                  class="slave-row__column"
                  :disabled="slave.columns.length === 0"
                >
                  <el-option
                    v-for="column in slaveForeignKeyOptions(slave)"
                    :key="column.columnName"
                    :label="`${column.columnName}（${column.rawType}）`"
                    :value="column.columnName"
                  />
                </el-select>
                <span class="slave-row__link">→</span>
                <el-select
                  v-model="slave.masterColumn"
                  placeholder="主表主键"
                  class="slave-row__column"
                >
                  <el-option
                    v-for="column in masterKeyColumns"
                    :key="column.columnName"
                    :label="`${column.columnName}（${column.rawType}）`"
                    :value="column.columnName"
                  />
                </el-select>
                <el-button link type="danger" @click="removeSlaveTable(index)">删除</el-button>
              </div>
              <el-button
                link
                type="primary"
                :disabled="!connectionId || !tableName"
                @click="addSlaveTable"
              >
                + 添加从表
              </el-button>
            </div>
          </el-form-item>
        </el-form>

        <el-alert
          v-if="connectionId && syncedTables.length === 0"
          type="warning"
          :closable="false"
          show-icon
          title="该连接还没有同步表信息，请点击「同步表结构」"
        />
        <el-alert
          v-else-if="tableName && tableColumns.length > 0"
          type="success"
          :closable="false"
          show-icon
          :title="`已关联 ${tableName}（${tableComment || '无注释'}），共 ${businessColumns.length} 个业务字段${
            slaveTables.length > 0 ? `，另有 ${slaveTables.length} 张从表` : ''
          }`"
        />
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { useDesigner } from '../designer/store';

const {
  addSlaveTable, businessColumns, connectionId, dataSources, formDescription, formName,
  handleConnectionChange, handleSlaveTableChange, handleSyncTables, handleTableChange,
  isSlavePicked, loading, masterKeyColumns, removeSlaveTable, selectableTables,
  slaveForeignKeyOptions, slaveTableOptions, slaveTables, step, syncedTables, syncing,
  tableColumns, tableComment, tableLoading, tableName,
} = useDesigner();
</script>

<style scoped lang="scss">
.step-panel {
  flex: 1;
  padding: 16px;
}

.step-panel--scroll {
  min-height: 0;
}

.step-card {
  max-width: 760px;
  padding: 20px;
  margin: 0 auto;
  background: var(--el-fill-color-lighter);
  border-radius: 10px;
}

.step-card__title {
  margin: 0 0 16px;
  font-size: 15px;
  color: var(--el-text-color-primary);
}

.step-card__title--spaced {
  margin-top: 28px;
}

.step-form {
  max-width: 640px;
}

.step-hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.table-select-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.slave-tables {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.slave-tables__empty {
  margin: 0;
}

.slave-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.slave-row__table {
  flex: 1.2;
  min-width: 0;
}

.slave-row__column {
  flex: 1;
  min-width: 0;
}

.slave-row__link {
  flex: none;
  color: var(--el-text-color-secondary);
}
</style>

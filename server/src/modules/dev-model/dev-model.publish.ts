import type { DevDataSource, DevModel } from '../../db/entities';
import { AppError, ERROR_CODES } from '../../utils/app-error';
import { tableExists } from '../dev-data-source/data-source.client';
import { introspectTable } from '../dev-db-table/dev-db-table.introspect';
import type { DevModelFieldInput } from './dev-model.dto';
import {
  buildAlterTableStatements,
  buildCreateTableStatements,
  buildRenameTableStatements,
  formatSql,
} from './dev-model.ddl';

export type PublishAction = 'CREATE' | 'ALTER' | 'NONE';

export interface PublishPlan {
  action: PublishAction;
  dbType: DevDataSource['db_type'];
  tableName: string;
  previousTableName: string | null;
  statements: string[];
  sql: string;
  message: string;
  warnings: string[];
  destructive: boolean;
}

const SYSTEM_COLUMNS = ['id', 'created_at', 'updated_at', 'deleted_at'];

/**
 * 发布计划既用于预览也用于真正执行，保证用户看到的 SQL 和实际执行完全一致。
 * 已发布模型按数据库当前结构生成 ALTER；新模型生成 CREATE。
 */
export async function buildPublishPlan(
  connection: DevDataSource,
  model: DevModel,
  fields: DevModelFieldInput[],
): Promise<PublishPlan> {
  const tableComment = model.table_comment ?? model.name;
  const previousTableName =
    model.published_table_name ?? (model.created_table_at ? model.table_name : null);

  if (!previousTableName) {
    if (await tableExists(connection, model.table_name)) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `目标库中已存在表「${model.table_name}」，请更换表名或使用「从数据库导入」`,
      );
    }
    const statements = buildCreateTableStatements(
      connection.db_type,
      model.table_name,
      tableComment,
      fields,
    );
    return {
      action: 'CREATE',
      dbType: connection.db_type,
      tableName: model.table_name,
      previousTableName: null,
      statements,
      sql: formatSql(statements),
      message: `将在目标库创建新表 ${model.table_name}`,
      warnings: [],
      destructive: false,
    };
  }

  const previousExists = await tableExists(connection, previousTableName);
  if (!previousExists) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      `已发布的表「${previousTableName}」不存在，无法继续发布；请检查数据库或新建模型`,
    );
  }
  if (previousTableName !== model.table_name && (await tableExists(connection, model.table_name))) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      `新表名「${model.table_name}」在目标库中已存在，请更换表名`,
    );
  }

  const current = await introspectTable(connection, previousTableName);
  if (!current) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, `无法读取表「${previousTableName}」结构`);
  }
  const currentColumns = new Set(current.columns.map((column) => column.columnName));
  const missingSystem = SYSTEM_COLUMNS.filter((name) => !currentColumns.has(name));
  if (missingSystem.length > 0) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      `目标表缺少系统字段：${missingSystem.join('、')}，不能继续发布`,
    );
  }

  const renameStatements = buildRenameTableStatements(
    connection.db_type,
    previousTableName,
    model.table_name,
  );
  const alter = buildAlterTableStatements(
    connection.db_type,
    model.table_name,
    tableComment,
    fields,
    current,
  );
  const warnings = [...alter.warnings];
  if (previousTableName !== model.table_name) {
    warnings.unshift(
      `表将重命名：${previousTableName} → ${model.table_name}，已生成代码和外部引用需要同步调整`,
    );
  }

  const statements = [...renameStatements, ...alter.statements];
  const action = statements.length > 0 ? 'ALTER' : 'NONE';
  const message =
    action === 'ALTER'
      ? `将按差异更新表 ${model.table_name}`
      : '当前模型与数据库结构一致，没有需要执行的变更';
  return {
    action,
    dbType: connection.db_type,
    tableName: model.table_name,
    previousTableName,
    statements,
    sql: statements.length > 0 ? formatSql(statements) : `-- ${message}`,
    message,
    warnings,
    destructive: alter.destructive,
  };
}

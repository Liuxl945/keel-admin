import crypto from 'node:crypto';
import type { DevDataSourceType } from '../../db/entities';
import { AppError, ERROR_CODES } from '../../utils/app-error';
import type { DbColumnInfo, DbTableInfo } from '../dev-db-table/dev-db-table.introspect';
import type { DevModelFieldInput } from './dev-model.dto';

function assertIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(value)) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, `非法标识符：${value}`);
  }
  return value;
}

function shortName(value: string): string {
  if (value.length <= 60) return value;
  const hash = crypto.createHash('sha1').update(value).digest('hex').slice(0, 6);
  return `${value.slice(0, 53)}_${hash}`;
}

function commentText(value: string | null | undefined): string {
  return String(value ?? '').replace(/'/g, "''").replace(/\r?\n/g, ' ');
}

function mysqlColumnType(field: DevModelFieldInput): string {
  switch (field.type) {
    case 'varchar':
      return `VARCHAR(${field.length})`;
    case 'text':
      return 'TEXT';
    case 'int':
      return 'INT';
    case 'decimal':
      return `DECIMAL(${field.precision},${field.scale})`;
    case 'boolean':
      return 'TINYINT(1)';
    case 'date':
      return 'DATE';
    case 'datetime':
      return 'DATETIME';
    default:
      return 'VARCHAR(255)';
  }
}

function postgresColumnType(field: DevModelFieldInput): string {
  switch (field.type) {
    case 'varchar':
      return `VARCHAR(${field.length})`;
    case 'text':
      return 'TEXT';
    case 'int':
      return 'INTEGER';
    case 'decimal':
      return `NUMERIC(${field.precision},${field.scale})`;
    case 'boolean':
      return 'BOOLEAN';
    case 'date':
      return 'DATE';
    case 'datetime':
      return 'TIMESTAMP';
    default:
      return 'VARCHAR(255)';
  }
}

export function buildCreateTableStatements(
  dbType: DevDataSourceType,
  tableName: string,
  tableComment: string,
  fields: DevModelFieldInput[],
): string[] {
  assertIdentifier(tableName);
  fields.forEach((field) => assertIdentifier(field.columnName));

  if (dbType === 'mysql') {
    const lines: string[] = [
      "  `id` INT NOT NULL AUTO_INCREMENT COMMENT '主键'",
      `${fields
        .map((field) => {
          const nullability = field.nullable ? 'NULL' : 'NOT NULL';
          const defaultValue =
            field.type === 'boolean' && !field.nullable ? ' DEFAULT 0' : '';
          return `  \`${field.columnName}\` ${mysqlColumnType(field)} ${nullability}${defaultValue} COMMENT '${commentText(field.label)}'`;
        })
        .join(',\n')}`,
      "  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'",
      "  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'",
      "  `deleted_at` DATETIME NULL COMMENT '删除时间'",
      '  PRIMARY KEY (`id`)',
      ...fields
        .filter((field) => field.unique)
        .map(
          (field) =>
            `  UNIQUE KEY \`${shortName(`UQ_${tableName}_${field.columnName}`)}\` (\`${field.columnName}\`)`,
        ),
    ];
    const tableCommentSql = tableComment ? ` COMMENT='${commentText(tableComment)}'` : '';
    return [
      `CREATE TABLE \`${tableName}\` (\n${lines.join(',\n')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4${tableCommentSql}`,
    ];
  }

  const lines: string[] = [
    '  "id" SERIAL PRIMARY KEY',
    ...fields.map((field) => {
      const nullability = field.nullable ? 'NULL' : 'NOT NULL';
      const defaultValue = field.type === 'boolean' && !field.nullable ? ' DEFAULT FALSE' : '';
      return `  "${field.columnName}" ${postgresColumnType(field)} ${nullability}${defaultValue}`;
    }),
    '  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()',
    '  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()',
    '  "deleted_at" TIMESTAMP NULL',
    ...fields
      .filter((field) => field.unique)
      .map(
        (field) =>
          `  CONSTRAINT "${shortName(`UQ_${tableName}_${field.columnName}`)}" UNIQUE ("${field.columnName}")`,
      ),
  ];

  const statements = [`CREATE TABLE "${tableName}" (\n${lines.join(',\n')}\n)`];
  if (tableComment) {
    statements.push(`COMMENT ON TABLE "${tableName}" IS '${commentText(tableComment)}'`);
  }
  statements.push(`COMMENT ON COLUMN "${tableName}"."id" IS '主键'`);
  for (const field of fields) {
    statements.push(
      `COMMENT ON COLUMN "${tableName}"."${field.columnName}" IS '${commentText(field.label)}'`,
    );
  }
  statements.push(`COMMENT ON COLUMN "${tableName}"."created_at" IS '创建时间'`);
  statements.push(`COMMENT ON COLUMN "${tableName}"."updated_at" IS '更新时间'`);
  statements.push(`COMMENT ON COLUMN "${tableName}"."deleted_at" IS '删除时间'`);
  return statements;
}

function quoteMysql(value: string): string {
  return `\`${assertIdentifier(value)}\``;
}

function quotePostgres(value: string): string {
  return `"${assertIdentifier(value)}"`;
}

function mysqlColumnDefinition(field: DevModelFieldInput): string {
  const nullability = field.nullable ? 'NULL' : 'NOT NULL';
  const defaultValue = field.type === 'boolean' && !field.nullable ? ' DEFAULT 0' : '';
  return `${mysqlColumnType(field)} ${nullability}${defaultValue} COMMENT '${commentText(field.label)}'`;
}

function postgresColumnDefinition(field: DevModelFieldInput): string {
  const nullability = field.nullable ? 'NULL' : 'NOT NULL';
  const defaultValue = field.type === 'boolean' && !field.nullable ? ' DEFAULT FALSE' : '';
  return `${postgresColumnType(field)} ${nullability}${defaultValue}`;
}

function sameColumnType(field: DevModelFieldInput, current: DbColumnInfo): boolean {
  if (current.type !== field.type) return false;
  if (field.type === 'varchar') return current.length === Number(field.length);
  if (field.type === 'decimal') {
    return current.precision === Number(field.precision) && current.scale === Number(field.scale);
  }
  return true;
}

function sameComment(current: string | null | undefined, next: string): boolean {
  return String(current ?? '').trim() === next.trim();
}

export interface AlterTableResult {
  statements: string[];
  warnings: string[];
  destructive: boolean;
}

/**
 * 已发布表再次发布时按字段差异生成 ALTER。
 * 列顺序、唯一约束不在增量发布里处理，避免不同数据库方言差异导致误操作。
 */
export function buildAlterTableStatements(
  dbType: DevDataSourceType,
  tableName: string,
  tableComment: string,
  fields: DevModelFieldInput[],
  current: DbTableInfo,
): AlterTableResult {
  assertIdentifier(tableName);
  fields.forEach((field) => assertIdentifier(field.columnName));

  const systemColumns = new Set(['id', 'created_at', 'updated_at', 'deleted_at']);
  const currentColumns = new Map(
    current.columns.filter((column) => !systemColumns.has(column.columnName)).map((column) => [
      column.columnName,
      column,
    ]),
  );
  const desired = new Map(fields.map((field) => [field.columnName, field]));
  const statements: string[] = [];
  const warnings: string[] = [];
  let destructive = false;

  const table = dbType === 'mysql' ? quoteMysql(tableName) : quotePostgres(tableName);

  for (const field of fields) {
    const col = dbType === 'mysql' ? quoteMysql(field.columnName) : quotePostgres(field.columnName);
    const existing = currentColumns.get(field.columnName);

    if (!existing) {
      if (!field.nullable) {
        warnings.push(`新增非空字段「${field.label}」在已有数据表上可能因缺少默认值而发布失败`);
      }
      statements.push(
        dbType === 'mysql'
          ? `ALTER TABLE ${table} ADD COLUMN ${col} ${mysqlColumnDefinition(field)}`
          : `ALTER TABLE ${table} ADD COLUMN ${col} ${postgresColumnDefinition(field)}`,
      );
      if (dbType !== 'mysql') {
        statements.push(
          `COMMENT ON COLUMN ${quotePostgres(tableName)}.${col} IS '${commentText(field.label)}'`,
        );
      }
      continue;
    }

    const typeChanged = !sameColumnType(field, existing);
    const nullableChanged = existing.nullable !== field.nullable;
    const commentChanged = !sameComment(existing.comment, field.label);

    if (typeChanged) {
      destructive = true;
      const nextType =
        field.type === 'varchar'
          ? `varchar(${field.length})`
          : field.type === 'decimal'
            ? `decimal(${field.precision},${field.scale})`
            : field.type;
      warnings.push(
        `字段「${field.label}」类型/长度由 ${existing.rawType || existing.type || '未知'} 调整为 ${nextType}，可能因存量数据转换失败`,
      );
    }
    if (!field.nullable && existing.nullable) {
      warnings.push(`字段「${field.label}」改为非空，存量 NULL 数据会导致发布失败`);
    }

    if (dbType === 'mysql') {
      if (typeChanged || nullableChanged || commentChanged) {
        statements.push(`ALTER TABLE ${table} MODIFY COLUMN ${col} ${mysqlColumnDefinition(field)}`);
      }
    } else {
      if (typeChanged) {
        const pgType = postgresColumnType(field);
        statements.push(
          `ALTER TABLE ${table} ALTER COLUMN ${col} TYPE ${pgType} USING ${col}::${pgType}`,
        );
      }
      if (nullableChanged) {
        statements.push(
          `ALTER TABLE ${table} ALTER COLUMN ${col} ${field.nullable ? 'DROP NOT NULL' : 'SET NOT NULL'}`,
        );
      }
      if (commentChanged) {
        statements.push(
          `COMMENT ON COLUMN ${quotePostgres(tableName)}.${col} IS '${commentText(field.label)}'`,
        );
      }
    }
  }

  for (const [columnName, column] of currentColumns) {
    if (desired.has(columnName)) continue;
    assertIdentifier(columnName);
    destructive = true;
    warnings.push(`删除字段「${column.comment || columnName}」会丢失该列全部数据`);
    statements.push(
      `ALTER TABLE ${table} DROP COLUMN ${
        dbType === 'mysql' ? quoteMysql(columnName) : quotePostgres(columnName)
      }`,
    );
  }

  if (!sameComment(current.tableComment, tableComment)) {
    statements.push(
      dbType === 'mysql'
        ? `ALTER TABLE ${table} COMMENT='${commentText(tableComment)}'`
        : `COMMENT ON TABLE ${quotePostgres(tableName)} IS '${commentText(tableComment)}'`,
    );
  }

  return { statements, warnings, destructive };
}

export function buildRenameTableStatements(
  dbType: DevDataSourceType,
  previousTableName: string,
  tableName: string,
): string[] {
  assertIdentifier(previousTableName);
  assertIdentifier(tableName);
  if (previousTableName === tableName) return [];
  if (dbType === 'mysql') {
    return [`RENAME TABLE ${quoteMysql(previousTableName)} TO ${quoteMysql(tableName)}`];
  }
  return [`ALTER TABLE ${quotePostgres(previousTableName)} RENAME TO ${quotePostgres(tableName)}`];
}

export function formatSql(statements: string[]): string {
  return statements.length > 0 ? `${statements.join(';\n\n')};` : '';
}

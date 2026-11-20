import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { DATE_TIME_COLUMN_TYPE } from '../column-types';

@Entity('dev_db_tables')
@Index('UQ_dev_db_tables_connection_table', ['connection_id', 'table_name'], { unique: true })
@Index('IDX_dev_db_tables_connection', ['connection_id'])
export class DevDbTable extends BaseEntity {
  @Column({ name: 'connection_id', type: 'int', comment: '数据连接 id' })
  connection_id!: number;

  @Column({ name: 'table_name', type: 'varchar', length: 128, comment: '表名' })
  table_name!: string;

  @Column({ name: 'table_comment', type: 'varchar', length: 255, nullable: true, comment: '表注释' })
  table_comment!: string | null;

  @Column({ name: 'columns_json', type: 'text', comment: '字段元数据 JSON' })
  columns_json!: string;

  @Column({ name: 'column_count', type: 'int', default: 0, comment: '字段数量' })
  column_count!: number;

  @Column({ name: 'synced_at', type: DATE_TIME_COLUMN_TYPE, comment: '同步时间' })
  synced_at!: Date;
}

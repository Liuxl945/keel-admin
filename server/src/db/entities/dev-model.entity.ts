import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { DATE_TIME_COLUMN_TYPE } from '../column-types';

export type DevModelStatus = 'DRAFT' | 'CREATED';

@Entity('dev_models')
@Index('UQ_dev_models_model_key', ['model_key'], { unique: true })
@Index('UQ_dev_models_connection_table', ['connection_id', 'table_name'], { unique: true })
export class DevModel extends BaseEntity {
  @Column({ name: 'name', type: 'varchar', length: 100, comment: '模型名称' })
  name!: string;

  @Column({ name: 'model_key', type: 'varchar', length: 50, comment: '模型编码（唯一）' })
  model_key!: string;

  @Column({ name: 'connection_id', type: 'int', comment: '数据连接 id' })
  connection_id!: number;

  @Column({ name: 'table_name', type: 'varchar', length: 64, comment: '目标表名' })
  table_name!: string;

  @Column({
    name: 'published_table_name',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '最近一次发布时的表名（用于识别重命名）',
  })
  published_table_name!: string | null;

  @Column({ name: 'table_comment', type: 'varchar', length: 255, nullable: true, comment: '表注释' })
  table_comment!: string | null;

  @Column({ name: 'fields_json', type: 'text', comment: '字段定义 JSON' })
  fields_json!: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'DRAFT', comment: '状态：DRAFT/CREATED' })
  status!: DevModelStatus;

  @Column({ name: 'created_table_at', type: DATE_TIME_COLUMN_TYPE, nullable: true, comment: '建表时间' })
  created_table_at!: Date | null;

  @Column({ name: 'updated_by', type: 'varchar', length: 50, nullable: true, comment: '最后操作人' })
  updated_by!: string | null;
}

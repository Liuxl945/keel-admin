import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { DATE_TIME_COLUMN_TYPE } from '../column-types';

export type DevApiCategory = 'STATIC' | 'SQL';
export type DevApiStatus = 'DRAFT' | 'PUBLISHED';
export type DevApiAction = 'QUERY' | 'INSERT' | 'UPDATE' | 'DELETE';

@Entity('dev_apis')
@Index('UQ_dev_apis_api_key', ['api_key'], { unique: true })
@Index('IDX_dev_apis_updated_at', ['updatedAt'])
export class DevApi extends BaseEntity {
  @Column({ name: 'name', type: 'varchar', length: 100, comment: '接口名称' })
  name!: string;

  @Column({ name: 'api_key', type: 'varchar', length: 50, comment: '接口编码（唯一，snake_case）' })
  api_key!: string;

  @Column({ name: 'category', type: 'varchar', length: 20, comment: '接口类型：STATIC/SQL' })
  category!: DevApiCategory;

  @Column({ name: 'description', type: 'varchar', length: 500, nullable: true, comment: '接口说明' })
  description!: string | null;

  // 静态数据不查库，连接/模型/动作只对 SQL 类接口有意义，故允许为空
  @Column({ name: 'connection_id', type: 'int', nullable: true, comment: '关联数据连接 id' })
  connection_id!: number | null;

  @Column({ name: 'model_id', type: 'int', nullable: true, comment: '关联建模数据 id' })
  model_id!: number | null;

  @Column({ name: 'table_name', type: 'varchar', length: 128, nullable: true, comment: '目标表名' })
  table_name!: string | null;

  @Column({ name: 'action', type: 'varchar', length: 20, nullable: true, comment: 'SQL 动作：QUERY/INSERT/UPDATE/DELETE' })
  action!: DevApiAction | null;

  @Column({ name: 'config_json', type: 'text', comment: '接口配置 JSON（静态数据/SQL 模板/参数/字段映射/数据处理）' })
  config_json!: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'DRAFT', comment: '状态：DRAFT/PUBLISHED' })
  status!: DevApiStatus;

  @Column({ name: 'version', type: 'int', default: 1, comment: '发布版本号' })
  version!: number;

  @Column({ name: 'published_at', type: DATE_TIME_COLUMN_TYPE, nullable: true, comment: '发布时间' })
  published_at!: Date | null;

  @Column({ name: 'updated_by', type: 'varchar', length: 50, nullable: true, comment: '最后操作人' })
  updated_by!: string | null;
}

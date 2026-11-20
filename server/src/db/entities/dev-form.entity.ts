import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { DATE_TIME_COLUMN_TYPE } from '../column-types';

export type DevFormStatus = 'DRAFT' | 'PUBLISHED';

@Entity('dev_forms')
@Index('UQ_dev_forms_form_key', ['form_key'], { unique: true })
@Index('IDX_dev_forms_updated_at', ['updatedAt'])
export class DevForm extends BaseEntity {
  @Column({ name: 'name', type: 'varchar', length: 100, comment: '表单名称' })
  name!: string;

  @Column({ name: 'form_key', type: 'varchar', length: 50, comment: '表单编码（唯一，snake_case）' })
  form_key!: string;

  @Column({ name: 'description', type: 'varchar', length: 500, nullable: true, comment: '表单说明' })
  description!: string | null;

  @Column({ name: 'connection_id', type: 'int', nullable: true, comment: '关联数据连接 id' })
  connection_id!: number | null;

  @Column({ name: 'table_name', type: 'varchar', length: 128, nullable: true, comment: '关联数据库表' })
  table_name!: string | null;

  @Column({ name: 'schema_json', type: 'text', comment: '表单设计 JSON' })
  schema_json!: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'DRAFT', comment: '状态：DRAFT/PUBLISHED' })
  status!: DevFormStatus;

  @Column({ name: 'version', type: 'int', default: 1, comment: '发布版本号' })
  version!: number;

  @Column({ name: 'published_at', type: DATE_TIME_COLUMN_TYPE, nullable: true, comment: '发布时间' })
  published_at!: Date | null;

  @Column({ name: 'updated_by', type: 'varchar', length: 50, nullable: true, comment: '最后操作人' })
  updated_by!: string | null;
}

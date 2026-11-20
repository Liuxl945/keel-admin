import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

export type ConfigCategory = 'CONTENT' | 'SYSTEM';

@Entity('system_configs')
@Index('UQ_system_configs_key', ['key'], { unique: true })
export class SystemConfig extends BaseEntity {
  @Column({ name: 'key', type: 'varchar', length: 100, comment: '配置键（唯一）' })
  key!: string;

  @Column({ name: 'value', type: 'text', comment: '配置值（统一字符串存储）' })
  value!: string;

  @Column({ name: 'name', type: 'varchar', length: 100, comment: '配置名称' })
  name!: string;

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true, comment: '配置说明' })
  description!: string | null;

  @Column({ name: 'category', type: 'varchar', length: 20, default: 'SYSTEM', comment: '分类：CONTENT/SYSTEM' })
  category!: ConfigCategory;
}

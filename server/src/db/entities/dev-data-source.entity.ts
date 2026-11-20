import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { DATE_TIME_COLUMN_TYPE } from '../column-types';

export type DevDataSourceType = 'mysql' | 'postgres';
export type DevDataSourceTestStatus = 'SUCCESS' | 'FAILED';

@Entity('dev_data_sources')
@Index('UQ_dev_data_sources_code', ['code'], { unique: true })
export class DevDataSource extends BaseEntity {
  @Column({ name: 'name', type: 'varchar', length: 100, comment: '连接名称' })
  name!: string;

  @Column({ name: 'code', type: 'varchar', length: 50, comment: '连接编码（唯一）' })
  code!: string;

  @Column({ name: 'db_type', type: 'varchar', length: 20, comment: '数据库类型：mysql/postgres' })
  db_type!: DevDataSourceType;

  @Column({ name: 'host', type: 'varchar', length: 255, comment: '主机地址' })
  host!: string;

  @Column({ name: 'port', type: 'int', comment: '端口' })
  port!: number;

  @Column({ name: 'database_name', type: 'varchar', length: 100, comment: '数据库名' })
  database_name!: string;

  @Column({ name: 'username', type: 'varchar', length: 100, comment: '用户名' })
  username!: string;

  @Column({ name: 'password_encrypted', type: 'text', comment: '加密后的密码' })
  password_encrypted!: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'ENABLED', comment: '状态：ENABLED/DISABLED' })
  status!: 'ENABLED' | 'DISABLED';

  @Column({ name: 'is_default', type: 'boolean', default: false, comment: '是否默认数据连接' })
  is_default!: boolean;

  @Column({ name: 'remark', type: 'varchar', length: 500, nullable: true, comment: '备注' })
  remark!: string | null;

  @Column({ name: 'last_test_at', type: DATE_TIME_COLUMN_TYPE, nullable: true, comment: '最后测试时间' })
  last_test_at!: Date | null;

  @Column({ name: 'last_test_status', type: 'varchar', length: 20, nullable: true, comment: '最后测试结果' })
  last_test_status!: DevDataSourceTestStatus | null;

  @Column({ name: 'last_test_message', type: 'varchar', length: 500, nullable: true, comment: '最后测试消息' })
  last_test_message!: string | null;
}

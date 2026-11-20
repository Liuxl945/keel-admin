import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('operation_logs')
@Index('IDX_operation_logs_created_at', ['createdAt'])
@Index('IDX_operation_logs_user_id', ['user_id'])
export class OperationLog extends BaseEntity {
  @Column({ name: 'user_id', type: 'int', nullable: true, comment: '操作人 id' })
  user_id!: number | null;

  @Column({ name: 'username', type: 'varchar', length: 50, nullable: true, comment: '操作人账号' })
  username!: string | null;

  @Column({ name: 'method', type: 'varchar', length: 10, comment: 'HTTP 方法' })
  method!: string;

  @Column({ name: 'path', type: 'varchar', length: 500, comment: '请求路径（不含查询串）' })
  path!: string;

  @Column({ name: 'status_code', type: 'int', comment: 'HTTP 状态码' })
  status_code!: number;

  @Column({ name: 'biz_code', type: 'int', nullable: true, comment: '响应信封中的业务 code' })
  biz_code!: number | null;

  @Column({ name: 'duration_ms', type: 'int', comment: '耗时毫秒' })
  duration_ms!: number;

  @Column({ name: 'ip', type: 'varchar', length: 64, nullable: true, comment: '客户端 IP' })
  ip!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true, comment: '客户端 UA' })
  user_agent!: string | null;

  @Column({ name: 'query', type: 'text', nullable: true, comment: '查询参数（已脱敏截断）' })
  query!: string | null;

  @Column({ name: 'body', type: 'text', nullable: true, comment: '请求体（已脱敏截断）' })
  body!: string | null;

  @Column({ name: 'response', type: 'text', nullable: true, comment: '响应信封（已脱敏截断）' })
  response!: string | null;
}

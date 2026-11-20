import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

export type LoginUserType = 'ADMIN' | 'APP';

@Entity('login_logs')
@Index('IDX_login_logs_created_at', ['createdAt'])
@Index('IDX_login_logs_username', ['username'])
export class LoginLog extends BaseEntity {
  @Column({ name: 'user_id', type: 'int', nullable: true, comment: '登录用户 id（失败时可能为空）' })
  user_id!: number | null;

  @Column({ name: 'username', type: 'varchar', length: 100, nullable: true, comment: '登录账号/标识' })
  username!: string | null;

  @Column({ name: 'user_type', type: 'varchar', length: 20, comment: '端类型：ADMIN/APP' })
  user_type!: LoginUserType;

  @Column({ name: 'success', type: 'boolean', default: false, comment: '是否成功' })
  success!: boolean;

  @Column({ name: 'message', type: 'varchar', length: 255, nullable: true, comment: '结果说明' })
  message!: string | null;

  @Column({ name: 'ip', type: 'varchar', length: 64, nullable: true, comment: '客户端 IP' })
  ip!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true, comment: '客户端 UA' })
  user_agent!: string | null;
}

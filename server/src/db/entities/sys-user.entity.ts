import { Column, Entity, Index, JoinTable, ManyToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { DATE_TIME_COLUMN_TYPE } from '../column-types';
import { SysRole } from './sys-role.entity';

@Entity('sys_users')
@Index('UQ_sys_users_username', ['username'], { unique: true })
@Index('IDX_sys_users_status', ['status'])
export class SysUser extends BaseEntity {
  @Column({ name: 'username', type: 'varchar', length: 50, comment: '登录账号' })
  username!: string;

  /** select: false 防止查询列表时把哈希顺手带出去，登录时显式 addSelect */
  @Column({ name: 'password_hash', type: 'varchar', length: 100, select: false, comment: '密码哈希' })
  password_hash!: string;

  @Column({ name: 'nickname', type: 'varchar', length: 50, comment: '昵称' })
  nickname!: string;

  @Column({ name: 'avatar', type: 'varchar', length: 500, nullable: true, comment: '头像地址' })
  avatar!: string | null;

  @Column({ name: 'email', type: 'varchar', length: 100, nullable: true, comment: '邮箱' })
  email!: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 20, nullable: true, comment: '手机号' })
  phone!: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'ENABLED', comment: '状态：ENABLED/DISABLED' })
  status!: 'ENABLED' | 'DISABLED';

  @Column({ name: 'is_super_admin', type: 'boolean', default: false, comment: '是否超管（绕过权限校验）' })
  is_super_admin!: boolean;

  @Column({ name: 'last_login_at', type: DATE_TIME_COLUMN_TYPE, nullable: true, comment: '最后登录时间' })
  last_login_at!: Date | null;

  @ManyToMany(() => SysRole, (role) => role.users)
  @JoinTable({
    name: 'sys_user_roles',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  roles!: SysRole[];
}

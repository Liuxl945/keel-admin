import { Column, Entity, Index, JoinTable, ManyToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { SysMenu } from './sys-menu.entity';
import { SysUser } from './sys-user.entity';

@Entity('sys_roles')
@Index('UQ_sys_roles_code', ['code'], { unique: true })
export class SysRole extends BaseEntity {
  @Column({ name: 'name', type: 'varchar', length: 50, comment: '角色名称' })
  name!: string;

  @Column({ name: 'code', type: 'varchar', length: 50, comment: '角色编码（唯一）' })
  code!: string;

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true, comment: '角色描述' })
  description!: string | null;

  @Column({ name: 'sort', type: 'int', default: 0, comment: '排序值' })
  sort!: number;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'ENABLED', comment: '状态：ENABLED/DISABLED' })
  status!: 'ENABLED' | 'DISABLED';

  @ManyToMany(() => SysMenu, (menu) => menu.roles, { cascade: false })
  @JoinTable({
    name: 'sys_role_menus',
    joinColumn: { name: 'role_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'menu_id', referencedColumnName: 'id' },
  })
  menus!: SysMenu[];

  @ManyToMany(() => SysUser, (user) => user.roles)
  users!: SysUser[];
}

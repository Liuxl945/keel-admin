import { Column, Entity, Index, ManyToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { SysRole } from './sys-role.entity';

export type SysMenuType = 'DIR' | 'MENU' | 'BUTTON' | 'FORM';

@Entity('sys_menus')
@Index('IDX_sys_menus_parent_id', ['parent_id'])
@Index('IDX_sys_menus_perm', ['perm'])
export class SysMenu extends BaseEntity {
  @Column({ name: 'parent_id', type: 'int', nullable: true, comment: '父级菜单 id，空为顶级' })
  parent_id!: number | null;

  @Column({ name: 'name', type: 'varchar', length: 50, comment: '菜单名称' })
  name!: string;

  @Column({ name: 'type', type: 'varchar', length: 20, comment: '类型：DIR/MENU/BUTTON/FORM' })
  type!: SysMenuType;

  @Column({ name: 'form_id', type: 'int', nullable: true, comment: '关联在线表单 id（type=FORM）' })
  form_id!: number | null;

  @Column({ name: 'path', type: 'varchar', length: 200, nullable: true, comment: '前端路由路径' })
  path!: string | null;

  @Column({ name: 'component', type: 'varchar', length: 200, nullable: true, comment: '前端组件路径' })
  component!: string | null;

  @Column({ name: 'perm', type: 'varchar', length: 100, nullable: true, comment: '权限标识' })
  perm!: string | null;

  @Column({ name: 'icon', type: 'varchar', length: 50, nullable: true, comment: '图标名称' })
  icon!: string | null;

  @Column({ name: 'sort', type: 'int', default: 0, comment: '排序值' })
  sort!: number;

  @Column({ name: 'visible', type: 'boolean', default: true, comment: '是否在侧边栏显示' })
  visible!: boolean;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'ENABLED', comment: '状态：ENABLED/DISABLED' })
  status!: 'ENABLED' | 'DISABLED';

  @ManyToMany(() => SysRole, (role) => role.menus)
  roles!: SysRole[];
}

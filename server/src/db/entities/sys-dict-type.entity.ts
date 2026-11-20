import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('sys_dict_types')
@Index('UQ_sys_dict_types_dict_type', ['dict_type'], { unique: true })
export class SysDictType extends BaseEntity {
  @Column({ name: 'dict_name', type: 'varchar', length: 100, comment: '字典名称' })
  dict_name!: string;

  @Column({ name: 'dict_type', type: 'varchar', length: 100, comment: '字典类型编码' })
  dict_type!: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'ENABLED', comment: '状态：ENABLED/DISABLED' })
  status!: 'ENABLED' | 'DISABLED';

  @Column({ name: 'remark', type: 'varchar', length: 500, nullable: true, comment: '备注' })
  remark!: string | null;
}

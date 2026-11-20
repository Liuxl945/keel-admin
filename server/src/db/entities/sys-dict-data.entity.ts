import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

export type DictTagType = 'primary' | 'success' | 'info' | 'warning' | 'danger';

@Entity('sys_dict_data')
@Index('IDX_sys_dict_data_type', ['dict_type'])
@Index('IDX_sys_dict_data_sort', ['dict_type', 'dict_sort'])
@Index('UQ_sys_dict_data_type_value', ['dict_type', 'dict_value'], { unique: true })
export class SysDictData extends BaseEntity {
  @Column({ name: 'dict_type', type: 'varchar', length: 100, comment: '所属字典类型' })
  dict_type!: string;

  @Column({ name: 'dict_label', type: 'varchar', length: 100, comment: '显示标签' })
  dict_label!: string;

  @Column({ name: 'dict_value', type: 'varchar', length: 100, comment: '数据值' })
  dict_value!: string;

  @Column({ name: 'dict_sort', type: 'int', default: 0, comment: '排序值' })
  dict_sort!: number;

  @Column({ name: 'tag_type', type: 'varchar', length: 20, default: 'primary', comment: '标签样式：primary/success/info/warning/danger' })
  tag_type!: DictTagType;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'ENABLED', comment: '状态：ENABLED/DISABLED' })
  status!: 'ENABLED' | 'DISABLED';

  @Column({ name: 'remark', type: 'varchar', length: 500, nullable: true, comment: '备注' })
  remark!: string | null;
}

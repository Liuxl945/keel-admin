import {
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 公共字段统一收敛在这里。时间戳是唯一允许的驼峰实体属性，
 * 物理列仍为 snake_case。
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('increment', { comment: '主键' })
  id!: number;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true, comment: '删除时间（软删除）' })
  deletedAt?: Date | null;
}

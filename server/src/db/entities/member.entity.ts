import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { DATE_TIME_COLUMN_TYPE } from '../column-types';

/**
 * App 用户骨架。业务项目按需扩展资料字段，
 * 微信标识必须由服务端 code2session 获取，前端不可直接写入。
 */
@Entity('members')
@Index('UQ_members_openid', ['openid'], { unique: true })
export class Member extends BaseEntity {
  @Column({ name: 'openid', type: 'varchar', length: 100, comment: '微信 openid' })
  openid!: string;

  @Column({ name: 'unionid', type: 'varchar', length: 100, nullable: true, comment: '微信 unionid' })
  unionid!: string | null;

  @Column({ name: 'nickname', type: 'varchar', length: 50, default: '微信用户', comment: '昵称' })
  nickname!: string;

  @Column({ name: 'avatar', type: 'varchar', length: 500, nullable: true, comment: '头像地址' })
  avatar!: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 20, nullable: true, comment: '手机号' })
  phone!: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'ENABLED', comment: '状态：ENABLED/DISABLED' })
  status!: 'ENABLED' | 'DISABLED';

  @Column({ name: 'last_login_at', type: DATE_TIME_COLUMN_TYPE, nullable: true, comment: '最后登录时间' })
  last_login_at!: Date | null;
}

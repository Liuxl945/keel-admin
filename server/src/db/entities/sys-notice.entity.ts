import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { DATE_TIME_COLUMN_TYPE } from '../column-types';

export type NoticeType = 'NOTICE' | 'ANNOUNCEMENT';
export type NoticeStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';

@Entity('sys_notices')
@Index('IDX_sys_notices_status', ['status'])
export class SysNotice extends BaseEntity {
  @Column({ name: 'title', type: 'varchar', length: 200, comment: '公告标题' })
  title!: string;

  @Column({ name: 'notice_type', type: 'varchar', length: 20, default: 'NOTICE', comment: '类型：NOTICE/ANNOUNCEMENT' })
  notice_type!: NoticeType;

  @Column({ name: 'content', type: 'text', comment: '正文内容（纯文本，保留换行）' })
  content!: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'DRAFT', comment: '状态：DRAFT/PUBLISHED/CLOSED' })
  status!: NoticeStatus;

  @Column({ name: 'publisher_id', type: 'int', nullable: true, comment: '发布人 id' })
  publisher_id!: number | null;

  @Column({ name: 'publisher_name', type: 'varchar', length: 50, nullable: true, comment: '发布人昵称快照' })
  publisher_name!: string | null;

  @Column({ name: 'published_at', type: DATE_TIME_COLUMN_TYPE, nullable: true, comment: '发布时间' })
  published_at!: Date | null;
}

import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('uploaded_files')
@Index('IDX_uploaded_files_created_at', ['createdAt'])
export class UploadedFile extends BaseEntity {
  @Column({ name: 'filename', type: 'varchar', length: 255, comment: '落盘文件名' })
  filename!: string;

  @Column({ name: 'original_name', type: 'varchar', length: 255, comment: '原始文件名' })
  original_name!: string;

  @Column({ name: 'url', type: 'varchar', length: 500, comment: '访问地址' })
  url!: string;

  @Column({ name: 'size', type: 'int', comment: '文件大小（字节）' })
  size!: number;

  @Column({ name: 'mime_type', type: 'varchar', length: 100, comment: 'MIME 类型' })
  mime_type!: string;

  @Column({ name: 'uploader_id', type: 'int', nullable: true, comment: '上传人 id' })
  uploader_id!: number | null;

  @Column({ name: 'uploader_name', type: 'varchar', length: 50, nullable: true, comment: '上传人账号快照' })
  uploader_name!: string | null;
}

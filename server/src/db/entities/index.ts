import { DevApi } from './dev-api.entity';
import { DevDataSource } from './dev-data-source.entity';
import { DevDbTable } from './dev-db-table.entity';
import { DevForm } from './dev-form.entity';
import { DevModel } from './dev-model.entity';
import { LoginLog } from './login-log.entity';
import { Member } from './member.entity';
import { OperationLog } from './operation-log.entity';
import { SysDictData } from './sys-dict-data.entity';
import { SysDictType } from './sys-dict-type.entity';
import { SysMenu } from './sys-menu.entity';
import { SysNotice } from './sys-notice.entity';
import { SysRole } from './sys-role.entity';
import { SysUser } from './sys-user.entity';
import { SystemConfig } from './system-config.entity';
import { UploadedFile } from './uploaded-file.entity';

/** 显式列出实体，避免编译后 glob 路径失效 */
export const entities = [
  SysUser,
  SysRole,
  SysMenu,
  SystemConfig,
  OperationLog,
  LoginLog,
  Member,
  SysDictType,
  SysDictData,
  SysNotice,
  UploadedFile,
  DevForm,
  DevApi,
  DevDataSource,
  DevModel,
  DevDbTable,
];

export {
  SysUser,
  SysRole,
  SysMenu,
  SystemConfig,
  OperationLog,
  LoginLog,
  Member,
  SysDictType,
  SysDictData,
  SysNotice,
  UploadedFile,
  DevForm,
  DevApi,
  DevDataSource,
  DevModel,
  DevDbTable,
};
export { BaseEntity } from './base.entity';
export type { SysMenuType } from './sys-menu.entity';
export type { ConfigCategory } from './system-config.entity';
export type { LoginUserType } from './login-log.entity';
export type { DictTagType } from './sys-dict-data.entity';
export type { NoticeType, NoticeStatus } from './sys-notice.entity';
export type { DevFormStatus } from './dev-form.entity';
export type { DevApiCategory, DevApiStatus, DevApiAction } from './dev-api.entity';
export type { DevDataSourceType, DevDataSourceTestStatus } from './dev-data-source.entity';
export type { DevModelStatus } from './dev-model.entity';

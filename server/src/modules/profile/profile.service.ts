import { AppDataSource } from '../../db/data-source';
import { SysUser } from '../../db/entities';
import { AppError, ERROR_CODES } from '../../utils/app-error';
import { hashPassword, verifyPassword } from '../../utils/password';
import { toUserProfile } from '../user/user.mapper';
import type { ChangePasswordInput, UpdateProfileInput } from './profile.dto';

function userRepo() {
  return AppDataSource.getRepository(SysUser);
}

export async function getProfile(user: SysUser) {
  return toUserProfile(user);
}

export async function updateProfile(userId: number, input: UpdateProfileInput) {
  const patch = {
    ...(input.nickname !== undefined ? { nickname: input.nickname } : {}),
    ...(input.avatar !== undefined ? { avatar: input.avatar ?? null } : {}),
    ...(input.email !== undefined ? { email: input.email ?? null } : {}),
    ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
  };
  if (Object.keys(patch).length > 0) await userRepo().update(userId, patch);

  const user = await userRepo().findOne({
    where: { id: userId },
    relations: { roles: true },
  });
  if (!user) throw new AppError(ERROR_CODES.NOT_FOUND, '用户不存在');
  return toUserProfile(user);
}

export async function changePassword(userId: number, input: ChangePasswordInput) {
  const user = await userRepo()
    .createQueryBuilder('user')
    .addSelect('user.password_hash')
    .where('user.id = :id', { id: userId })
    .getOne();

  if (!user) throw new AppError(ERROR_CODES.NOT_FOUND, '用户不存在');
  if (!(await verifyPassword(input.oldPassword, user.password_hash))) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '原密码不正确');
  }

  await userRepo().update(userId, { password_hash: await hashPassword(input.newPassword) });
}

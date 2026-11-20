import type { Request } from 'express';
import { ok } from '../../utils/response';
import type { ChangePasswordInput, UpdateProfileInput } from './profile.dto';
import { changePassword, getProfile, updateProfile } from './profile.service';

export async function getProfileController(req: Request) {
  return ok(await getProfile(req.authUser!));
}

export async function updateProfileController(req: Request) {
  return ok(await updateProfile(req.auth!.userId, req.body as UpdateProfileInput), '资料已更新');
}

export async function changePasswordController(req: Request) {
  await changePassword(req.auth!.userId, req.body as ChangePasswordInput);
  return ok(null, '密码已修改，请重新登录');
}

import { Router } from 'express';
import { validateBody } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/async-handler';
import {
  changePasswordController,
  getProfileController,
  updateProfileController,
} from './profile.controller';
import { changePasswordSchema, updateProfileSchema } from './profile.dto';

export const profileRouter = Router();

profileRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await getProfileController(req));
  }),
);

profileRouter.put(
  '/',
  validateBody(updateProfileSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateProfileController(req));
  }),
);

profileRouter.put(
  '/password',
  validateBody(changePasswordSchema),
  asyncHandler(async (req, res) => {
    res.json(await changePasswordController(req));
  }),
);

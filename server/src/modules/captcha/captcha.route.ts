import { Router } from 'express';
import { captchaController } from './captcha.controller';

export const captchaRouter = Router();

/** 公开接口：登录前获取验证码，返回 base64 SVG 与一次性 captchaId */
captchaRouter.get('/captcha', (_req, res) => {
  res.json(captchaController());
});

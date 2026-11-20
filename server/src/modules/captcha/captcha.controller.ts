import { ok } from '../../utils/response';
import { createCaptcha } from './captcha.service';

export function captchaController() {
  return ok(createCaptcha());
}

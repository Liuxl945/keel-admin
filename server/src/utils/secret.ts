import crypto from 'node:crypto';
import { config } from '../config';

const KEY = crypto.scryptSync(config.DATA_SOURCE_SECRET, 'admin-base-data-source', 32);
const ALGORITHM = 'aes-256-gcm';

/** 数据源密码加密存储，接口永远不返回明文 */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  const [version, ivText, tagText, dataText] = payload.split(':');
  if (version !== 'v1' || !ivText || !tagText || !dataText) {
    throw new Error('数据源密码格式无效，请重新保存密码');
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivText, 'base64'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataText, 'base64')), decipher.final()]).toString('utf8');
}

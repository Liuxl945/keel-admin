import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { config } from './config';
import { logger } from './utils/logger';
import { ok } from './utils/response';
import { authRequired } from './middlewares/auth';
import { errorHandler, notFoundHandler } from './middlewares/error-handler';
import { operationLogger } from './middlewares/operation-logger';
import { loadBizRouters } from './biz';
import { authRouter } from './modules/auth/auth.route';
import { captchaRouter } from './modules/captcha/captcha.route';
import { publicConfigRouter, configRouter } from './modules/config/config.route';
import { devApiRouter } from './modules/dev-api/dev-api.route';
import { devDataSourceRouter } from './modules/dev-data-source/dev-data-source.route';
import { devDbTableRouter } from './modules/dev-db-table/dev-db-table.route';
import { devFormRouter } from './modules/dev-form/dev-form.route';
import { devModelRouter } from './modules/dev-model/dev-model.route';
import { dictRouter } from './modules/dict/dict.route';
import { fileRouter } from './modules/file/file.route';
import { logRouter } from './modules/log/log.route';
import { menuRouter } from './modules/menu/menu.route';
import { monitorRouter } from './modules/monitor/monitor.route';
import { noticeRouter } from './modules/notice/notice.route';
import { profileRouter } from './modules/profile/profile.route';
import { roleRouter } from './modules/role/role.route';
import { uploadRouter } from './modules/upload/upload.route';
import { userRouter } from './modules/user/user.route';

export function createApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
  app.use(
    cors({
      origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',').map((item) => item.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  const uploadDir = config.resolvePath(config.UPLOAD_DIR);
  fs.mkdirSync(uploadDir, { recursive: true });
  app.use('/uploads', express.static(uploadDir, { maxAge: '1d' }));

  app.get('/api/health', (_req, res) => {
    res.json(ok({ status: 'ok', time: new Date().toISOString() }));
  });

  app.use('/api/auth', captchaRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/configs', publicConfigRouter);

  /**
   * admin 路由统一在此装配：先登录、再写操作留痕、最后按接口挂 hasPerm。
   * 新增模块只在这里加一行，避免每条路由重复鉴权顺序。
   */
  const adminRouter = express.Router();
  adminRouter.use(authRequired);
  adminRouter.use(operationLogger);
  adminRouter.use('/users', userRouter);
  adminRouter.use('/roles', roleRouter);
  adminRouter.use('/menus', menuRouter);
  adminRouter.use('/configs', configRouter);
  adminRouter.use('/logs', logRouter);
  adminRouter.use('/upload', uploadRouter);
  adminRouter.use('/dicts', dictRouter);
  adminRouter.use('/notices', noticeRouter);
  adminRouter.use('/profile', profileRouter);
  adminRouter.use('/files', fileRouter);
  adminRouter.use('/monitor', monitorRouter);
  adminRouter.use('/dev/forms', devFormRouter);
  adminRouter.use('/dev/apis', devApiRouter);
  adminRouter.use('/dev/data-sources', devDataSourceRouter);
  adminRouter.use('/dev/db-tables', devDbTableRouter);
  adminRouter.use('/dev/models', devModelRouter);
  // 业务模块由 server/src/biz/<模块>/<模块>.route.ts 自动发现，按目录名挂到 /<模块>
  for (const { basePath, router } of loadBizRouters()) {
    adminRouter.use(basePath, router);
  }
  app.use('/api/admin', adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

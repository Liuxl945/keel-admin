import { z } from 'zod';
import { pageQuerySchema, pageSizeQuerySchema } from '../../utils/pagination';
import { extractSqlParams } from './dev-api.sql';

export const DEV_API_CATEGORIES = ['STATIC', 'SQL'] as const;
export const DEV_API_ACTIONS = ['QUERY', 'INSERT', 'UPDATE', 'DELETE'] as const;
export const DEV_API_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export const DEV_API_PARAM_TYPES = ['string', 'number', 'boolean', 'date', 'datetime'] as const;
export const DEV_API_RETURN_MODES = ['list', 'one', 'count'] as const;

export type DevApiCategory = (typeof DEV_API_CATEGORIES)[number];
export type DevApiAction = (typeof DEV_API_ACTIONS)[number];
export type DevApiStatus = (typeof DEV_API_STATUSES)[number];
export type DevApiParamType = (typeof DEV_API_PARAM_TYPES)[number];
export type DevApiReturnMode = (typeof DEV_API_RETURN_MODES)[number];

const API_KEY_RULE = /^[a-z][a-z0-9_]{2,49}$/;
const PARAM_KEY_RULE = /^[a-zA-Z_][a-zA-Z0-9_]{0,49}$/;
const OUTPUT_KEY_RULE = /^[a-zA-Z_][a-zA-Z0-9_]{0,49}$/;
const COLUMN_NAME_RULE = /^[a-z][a-z0-9_]{0,63}$/;

/** SQL 模板里的命名参数声明：调试时的示例值与默认值都以字符串录入，运行时按 type 转换 */
export const devApiParamSchema = z.object({
  key: z.string().trim().regex(PARAM_KEY_RULE, '参数名需为字母/下划线开头的标识符'),
  label: z.string().trim().max(100, '参数说明不能超过 100').default(''),
  type: z.enum(DEV_API_PARAM_TYPES).default('string'),
  required: z.boolean().default(false),
  defaultValue: z.string().max(500, '默认值不能超过 500').default(''),
  sampleValue: z.string().max(500, '示例值不能超过 500').default(''),
});

/** 结果列 → 输出 key 的映射，columnName 必须是目标表白名单里的列 */
export const devApiFieldMappingSchema = z.object({
  columnName: z.string().trim().regex(COLUMN_NAME_RULE, '列名需为 snake_case'),
  outputKey: z.string().trim().regex(OUTPUT_KEY_RULE, '输出 key 需为字母/下划线开头的标识符'),
  label: z.string().trim().max(100, '字段说明不能超过 100').default(''),
  hidden: z.boolean().default(false),
});

/** 数据处理：返回形态、分页、排序、只输出映射字段、行数上限 */
export const devApiDataProcessSchema = z.object({
  returnMode: z.enum(DEV_API_RETURN_MODES).default('list'),
  paging: z.boolean().default(false),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  orderBy: z.string().trim().max(64).default(''),
  orderDir: z.enum(['ASC', 'DESC']).default('ASC'),
  mappedOnly: z.boolean().default(false),
  maxRows: z.coerce.number().int().min(1).max(5000).default(1000),
});

export const devApiConfigSchema = z
  .object({
    // 静态数据：手写 JSON 文本，原样保存，运行时解析后返回
    staticData: z.string().max(200000, '静态数据不能超过 200000 字符').default(''),
    // SQL 操作：模板、参数、字段映射
    sql: z.string().max(20000, 'SQL 模板不能超过 20000 字符').default(''),
    params: z.array(devApiParamSchema).max(50, '最多 50 个参数').default([]),
    fieldMappings: z.array(devApiFieldMappingSchema).max(200, '最多 200 个字段映射').default([]),
    dataProcess: devApiDataProcessSchema.default({
      returnMode: 'list',
      paging: false,
      pageSize: 20,
      orderBy: '',
      orderDir: 'ASC',
      mappedOnly: false,
      maxRows: 1000,
    }),
  })
  .superRefine((config, ctx) => {
    if (config.staticData.trim()) {
      try {
        const parsed = JSON.parse(config.staticData);
        if (parsed === null || typeof parsed !== 'object') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: '静态数据必须是 JSON 对象或数组',
            path: ['staticData'],
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '静态数据不是合法的 JSON',
          path: ['staticData'],
        });
      }
    }

    const declared = new Set(config.params.map((item) => item.key));
    for (const key of extractSqlParams(config.sql)) {
      if (!declared.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `SQL 中的参数 :${key} 尚未在参数列表中声明`,
          path: ['params'],
        });
      }
    }

    const paramKeys = new Set<string>();
    config.params.forEach((item, index) => {
      if (paramKeys.has(item.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `参数名重复：${item.key}`,
          path: ['params', index, 'key'],
        });
      }
      paramKeys.add(item.key);
    });

    const columns = new Set<string>();
    const keys = new Set<string>();
    config.fieldMappings.forEach((item, index) => {
      if (columns.has(item.columnName)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `结果列重复映射：${item.columnName}`,
          path: ['fieldMappings', index, 'columnName'],
        });
      }
      columns.add(item.columnName);
      if (keys.has(item.outputKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `输出 key 重复：${item.outputKey}`,
          path: ['fieldMappings', index, 'outputKey'],
        });
      }
      keys.add(item.outputKey);
    });

    if (config.dataProcess.orderBy && !COLUMN_NAME_RULE.test(config.dataProcess.orderBy)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '排序字段需为 snake_case 列名',
        path: ['dataProcess', 'orderBy'],
      });
    }
  });

export type DevApiConfig = z.infer<typeof devApiConfigSchema>;
export type DevApiParam = z.infer<typeof devApiParamSchema>;
export type DevApiFieldMapping = z.infer<typeof devApiFieldMappingSchema>;
export type DevApiDataProcess = z.infer<typeof devApiDataProcessSchema>;

const baseFields = {
  name: z.string().trim().min(1, '请输入接口名称').max(100, '接口名称不能超过 100'),
  apiKey: z.string().trim().regex(API_KEY_RULE, '接口编码需为 snake_case，小写字母开头，2-50 位'),
  category: z.enum(DEV_API_CATEGORIES),
  description: z.string().trim().max(500, '接口说明不能超过 500').nullable().optional(),
  connectionId: z.coerce.number().int().positive().nullable().optional(),
  modelId: z.coerce.number().int().positive().nullable().optional(),
  tableName: z.string().trim().max(128).nullable().optional(),
  action: z.enum(DEV_API_ACTIONS).nullable().optional(),
  config: devApiConfigSchema.optional(),
};

/**
 * 创建只落基本信息，配置在设计器里补齐；完整性在保存 / 发布 / 执行时校验，
 * 否则「先建接口再配置」的流程会被空配置卡住。
 */
export const createDevApiSchema = z.object(baseFields);

/** 编码创建后不可改：它是接口的稳定标识，后续运行时按它寻址 */
export const updateDevApiSchema = z
  .object({
    name: baseFields.name.optional(),
    description: baseFields.description,
    connectionId: baseFields.connectionId,
    modelId: baseFields.modelId,
    tableName: baseFields.tableName,
    action: baseFields.action,
    status: z.enum(DEV_API_STATUSES).optional(),
    config: devApiConfigSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: '没有需要更新的内容' });

export const devApiQuerySchema = z.object({
  page: pageQuerySchema,
  pageSize: pageSizeQuerySchema,
  keyword: z.string().trim().max(100).optional(),
  category: z.enum(DEV_API_CATEGORIES).optional(),
  status: z.enum(DEV_API_STATUSES).optional(),
  action: z.enum(DEV_API_ACTIONS).optional(),
  connectionId: z.coerce.number().int().positive().optional(),
});

/** 在线调试入参：值按参数定义转换，额外键会被忽略 */
export const runDevApiSchema = z.object({
  params: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

export type CreateDevApiInput = z.infer<typeof createDevApiSchema>;
export type UpdateDevApiInput = z.infer<typeof updateDevApiSchema>;
export type DevApiQuery = z.infer<typeof devApiQuerySchema>;
export type RunDevApiInput = z.infer<typeof runDevApiSchema>;

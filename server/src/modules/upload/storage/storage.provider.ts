export interface UploadFileInput {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

/** 落盘输入：分片合并完成后直接由临时文件入库，避免大文件整块读进内存 */
export interface UploadFileFromPathInput {
  /** 已合并完成的临时文件绝对路径，保存后由调用方负责清理 */
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface StoredFile {
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

/**
 * 存储抽象：业务只依赖这个接口，未来换 OSS 只新增实现。
 */
export interface StorageProvider {
  save(file: UploadFileInput): Promise<StoredFile>;
  saveFromPath(file: UploadFileFromPathInput): Promise<StoredFile>;
  /** filename 是 save 返回的落盘名，实现方必须防止越权路径 */
  remove(filename: string): Promise<void>;
}

import type { Response } from 'express';
import ExcelJS from 'exceljs';

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
}

export async function buildExcelBuffer(
  sheetName: string,
  columns: ExcelColumn[],
  rows: Array<Record<string, unknown>>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width ?? 20,
  }));

  for (const row of rows) sheet.addRow(row);
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function parseExcelBuffer(buffer: Buffer): Promise<Array<Record<string, string>>> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS 把 Buffer 声明成 ArrayBuffer，与 Node Buffer 类型不兼容；运行时两者都支持
  type ExcelJsBuffer = Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(buffer as unknown as ExcelJsBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    headers[columnNumber - 1] = String(cell.text ?? '').trim();
  });

  const rows: Array<Record<string, string>> = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const item: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      item[header] = String(row.getCell(index + 1).text ?? '').trim();
    });
    if (Object.values(item).some((value) => value.length > 0)) rows.push(item);
  });
  return rows;
}

export function sendExcel(res: Response, buffer: Buffer, filename: string): void {
  const encoded = encodeURIComponent(filename);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="export.xlsx"; filename*=UTF-8''${encoded}`);
  res.send(buffer);
}

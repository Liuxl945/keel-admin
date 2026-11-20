import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';
import { DATE_TIME_COLUMN_TYPE } from '../column-types';

/**
 * 在线开发演示用的业务表：客户档案 + 采购订单（主表）/ 采购订单明细（从表）。
 * 种子脚本 demo-seed.ts 依赖这些表写入演示数据，表单/建模/接口也在演示里引用它们。
 * 用 TypeORM 的 Table API 而不是手写 SQL，保证 postgres / mysql 都能建。
 */

const SYSTEM_COLUMNS = (): TableColumn[] => [
  new TableColumn({ name: 'created_at', type: DATE_TIME_COLUMN_TYPE, isNullable: true }),
  new TableColumn({ name: 'updated_at', type: DATE_TIME_COLUMN_TYPE, isNullable: true }),
  new TableColumn({ name: 'deleted_at', type: DATE_TIME_COLUMN_TYPE, isNullable: true }),
];

const idColumn = (): TableColumn =>
  new TableColumn({
    name: 'id',
    type: 'int',
    isPrimary: true,
    isGenerated: true,
    generationStrategy: 'increment',
  });

export class DemoBusinessTables1795200000000 implements MigrationInterface {
  name = 'DemoBusinessTables1795200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('demo_customer'))) {
      await queryRunner.createTable(
        new Table({
          name: 'demo_customer',
          comment: '演示：客户档案',
          columns: [
            idColumn(),
            new TableColumn({ name: 'customer_name', type: 'varchar', length: '100', comment: '客户名称' }),
            new TableColumn({ name: 'contact', type: 'varchar', length: '50', isNullable: true, comment: '联系人' }),
            new TableColumn({ name: 'phone', type: 'varchar', length: '30', isNullable: true, comment: '联系电话' }),
            new TableColumn({ name: 'level', type: 'varchar', length: '20', isNullable: true, comment: '客户等级' }),
            new TableColumn({ name: 'region', type: 'varchar', length: '50', isNullable: true, comment: '所属区域' }),
            ...SYSTEM_COLUMNS(),
          ],
        }),
      );
    }

    if (!(await queryRunner.hasTable('demo_purchase_order'))) {
      await queryRunner.createTable(
        new Table({
          name: 'demo_purchase_order',
          comment: '演示：采购订单',
          columns: [
            idColumn(),
            new TableColumn({ name: 'order_no', type: 'varchar', length: '50', comment: '订单编号' }),
            new TableColumn({ name: 'supplier', type: 'varchar', length: '100', isNullable: true, comment: '供应商' }),
            new TableColumn({ name: 'order_date', type: 'date', isNullable: true, comment: '下单日期' }),
            new TableColumn({
              name: 'amount',
              type: 'decimal',
              precision: 12,
              scale: 2,
              isNullable: true,
              comment: '订单金额',
            }),
            new TableColumn({ name: 'status', type: 'varchar', length: '20', isNullable: true, comment: '订单状态' }),
            new TableColumn({
              name: 'customer_ref',
              type: 'varchar',
              length: '255',
              isNullable: true,
              comment: '关联客户（表单选择器存 {v,l} JSON）',
            }),
            new TableColumn({
              name: 'city',
              type: 'varchar',
              length: '255',
              isNullable: true,
              comment: '收货城市（弹框选择存 {v,l} JSON）',
            }),
            new TableColumn({ name: 'image', type: 'text', isNullable: true, comment: '订单图片' }),
            new TableColumn({ name: 'attachments', type: 'text', isNullable: true, comment: '合同附件' }),
            new TableColumn({ name: 'remark', type: 'varchar', length: '500', isNullable: true, comment: '备注' }),
            ...SYSTEM_COLUMNS(),
          ],
        }),
      );
    }

    if (!(await queryRunner.hasTable('demo_purchase_order_item'))) {
      await queryRunner.createTable(
        new Table({
          name: 'demo_purchase_order_item',
          comment: '演示：采购订单明细',
          columns: [
            idColumn(),
            new TableColumn({ name: 'order_id', type: 'int', comment: '订单 id' }),
            new TableColumn({ name: 'product_name', type: 'varchar', length: '100', isNullable: true, comment: '商品名称' }),
            new TableColumn({ name: 'spec', type: 'varchar', length: '100', isNullable: true, comment: '规格' }),
            new TableColumn({ name: 'qty', type: 'int', isNullable: true, comment: '数量' }),
            new TableColumn({
              name: 'price',
              type: 'decimal',
              precision: 10,
              scale: 2,
              isNullable: true,
              comment: '单价',
            }),
            ...SYSTEM_COLUMNS(),
          ],
          indices: [new TableIndex({ name: 'IDX_demo_purchase_order_item_order', columnNames: ['order_id'] })],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('demo_purchase_order_item', true);
    await queryRunner.dropTable('demo_purchase_order', true);
    await queryRunner.dropTable('demo_customer', true);
  }
}

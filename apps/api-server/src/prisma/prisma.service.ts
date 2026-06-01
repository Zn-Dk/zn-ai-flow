import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { type OnModuleInit, type OnModuleDestroy, Injectable } from '@nestjs/common';

import { PrismaClient } from 'src/generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private pool: Pool

  constructor() {
    // super();
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);

    // 传递 PrismaClient 的配置选项
    super({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    })
    this.pool = pool
  }

  async onModuleInit() {
    // 调用 client 连接数据库
    await this.$connect()
  }

  async onModuleDestroy() {
    // 调用 client 断开数据库连接
    await this.$disconnect()
    await this.pool.end()
  }
}
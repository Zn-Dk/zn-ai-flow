import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppService } from './app.service';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
// import { DemoController } from './demo/demo.controller';


@Module({
  imports: [
    // 加载环境变量
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    // pg 数据库
    PrismaModule,
  ],
  controllers: [
    AppController,
    // DemoController
  ],
  providers: [AppService],
})
export class AppModule {}


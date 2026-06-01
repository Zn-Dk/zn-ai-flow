import { NestFactory } from '@nestjs/core'
import { Logger, ValidationPipe } from '@nestjs/common'

import { AppModule } from './app.module'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const logger = new Logger('bootstrap')
  // 给所有 Controller 注册的路由自动加上 /api 前缀：
  // 类似:：localhost:3100/users → 变成 localhost:3100/api/users。
  app.setGlobalPrefix('api', {
    exclude: ['/health'], // 假如有健康检查路由, 不添加前缀
  })

  // 开启 CORS 支持
  app.enableCors({ origin: true, credentials: true })

  // 全局 ValidationPipe 配置
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 自动移除 DTO 中未定义的属性
      forbidNonWhitelisted: true, // 存在未定义属性时直接报错400
      transform: true, // 自动类型转换（string → number 等）"25" -> 25
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  )

  // 全局过滤器(http异常处理)
  app.useGlobalFilters(new HttpExceptionFilter())
  // 全局响应转换拦截器
  app.useGlobalInterceptors(new TransformInterceptor())

  await app.listen(process.env.port ?? 4000)

  logger.log(`🚀 API Server is running on: ${await app.getUrl()}`)
}

bootstrap()

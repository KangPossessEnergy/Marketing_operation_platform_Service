// 应用的入口文件，使用核心函数 NestFactory 创建 Nest 应用实例。
import { NestFactory } from '@nestjs/core';//NestFactory类，提供了一些静态方法，用于创建应用实例
import { AppModule, ObserveInstrument } from './app.module.js';


async function bootstrap() {
  //返回一个应用对象，该对象实现了INestApplication接口。
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

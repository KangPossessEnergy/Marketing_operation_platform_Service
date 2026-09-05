import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app/app.module.js';
import { createValidationPipe } from './common/pipes/create-validation-pipe.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  app.useGlobalPipes(createValidationPipe());
  await app.listen(Number(process.env.PORT ?? 3000));
}
await bootstrap();

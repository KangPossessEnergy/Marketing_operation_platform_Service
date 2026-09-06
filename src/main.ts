import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module.js';
// import { AppModule, ObserveInstrument } from './app/app.module.js';
import { createValidationPipe } from './common/pipes/create-validation-pipe.js';

function getCorsOrigin(): boolean | string[] {
  const configuredOrigins = process.env.CORS_ORIGIN?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins?.length) {
    return configuredOrigins;
  }

  return process.env.NODE_ENV !== 'production';
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // instrument: ObserveInstrument,
  });
  app.enableCors({
    origin: getCorsOrigin(),
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.useGlobalPipes(createValidationPipe());
  await app.listen(
    Number(process.env.PORT ?? 3000),
    process.env.HOST ?? '0.0.0.0',
  );
}
await bootstrap();

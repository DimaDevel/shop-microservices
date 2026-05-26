import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import type { IncomingMessage } from 'http';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Gateway');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // NestJS supports Fastify as an alternative to Express
    // Fastify is faster and better suited for a Gateway
    new FastifyAdapter({
      logger: true,
      // genReqId generates a correlation ID if the client did not provide one
      genReqId: (req: IncomingMessage) => (req.headers['x-correlation-id'] as string) ?? crypto.randomUUID(),
    }),
  );

  // ── GlobalPipes ────────────────────────────────────────────
  // ValidationPipe validates all incoming DTOs automatically.
  // whitelist: true — strips fields not declared in the DTO (protects against extra data)
  // transform: true — converts plain objects into class instances
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  const host = process.env.HOST ?? '0.0.0.0'; // New: Configurable host with default
  await app.listen(port, host);
  logger.log(`Gateway running on http://${host}:${port}`); // Updated: Include host in log
}

bootstrap();

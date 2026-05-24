import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import type { IncomingMessage } from "http";
import { ValidationPipe, Logger } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const logger = new Logger("Gateway");

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // NestJS поддерживает Fastify как альтернативу Express
    // Fastify быстрее и лучше подходит для Gateway
    new FastifyAdapter({
      logger: true,
      // genReqId генерирует correlation ID если клиент не передал свой
      genReqId: (req: IncomingMessage) =>
        (req.headers["x-correlation-id"] as string) ?? crypto.randomUUID(),
    }),
  );

  // ── GlobalPipes ────────────────────────────────────────────
  // ValidationPipe валидирует все входящие DTO автоматически.
  // whitelist: true — срезает поля которых нет в DTO (защита от лишних данных)
  // transform: true — преобразует plain objects в инстансы классов
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  const host = process.env.HOST ?? "0.0.0.0"; // New: Configurable host with default
  await app.listen(port, host);
  logger.log(`Gateway running on http://${host}:${port}`); // Updated: Include host in log
}

bootstrap();

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('AuthService');

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ logger: true }));

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
  logger.log(`Auth Service running on port ${process.env.PORT ?? 3001}`);
}

bootstrap();

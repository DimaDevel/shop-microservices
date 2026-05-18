import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'pdf-service',
        brokers: [process.env.KAFKA_BROKERS ?? 'localhost:9092'],
      },
      consumer: {
        groupId: 'pdf-service-consumer',
      },
    },
  });

  await app.startAllMicroservices();

  const port = process.env.PORT ?? 3005;
  await app.listen(port, '0.0.0.0');
}
bootstrap();

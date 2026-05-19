import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KafkaModule } from '@nest-gateway/kafka';
import { PdfModule } from './pdf/pdf.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    KafkaModule.forRoot({
      clientId: 'pdf-service',
      brokers: [process.env.KAFKA_BROKERS ?? 'localhost:9092'],
      groupId: 'pdf-service-consumer',
      source: 'pdf-service',
    }),
    PdfModule,
    HealthModule,
  ],
})
export class AppModule {}

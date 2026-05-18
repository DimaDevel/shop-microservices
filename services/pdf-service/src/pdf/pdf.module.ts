import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PdfService } from './pdf.service';
import { PdfController } from './pdf.controller';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'KAFKA_CLIENT',
        imports: [ConfigModule],
        useFactory: (config: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              clientId: 'pdf-service-producer',
              brokers: [config.get('KAFKA_BROKERS', 'localhost:9092')],
            },
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  providers: [PdfService],
  controllers: [PdfController],
})
export class PdfModule {}

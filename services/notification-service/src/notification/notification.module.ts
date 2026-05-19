import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationLogEntity } from './notification-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationLogEntity])],
  providers: [NotificationService, NotificationController],
})
export class NotificationModule {}

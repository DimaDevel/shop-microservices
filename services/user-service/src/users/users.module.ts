import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { ProfileEntity } from './profile.entity';
import { UserEventsConsumer } from './user-events.consumer';

@Module({
  imports: [TypeOrmModule.forFeature([ProfileEntity])],
  providers: [UsersService, UserEventsConsumer],
  controllers: [UsersController],
})
export class UsersModule {}

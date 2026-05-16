import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { ProfileEntity } from './profile.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProfileEntity])],
  providers: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}

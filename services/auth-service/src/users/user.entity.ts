import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '@nest-gateway/shared';

// ─────────────────────────────────────────────────────────────
//  UserEntity
//
//  Хранит только данные необходимые для аутентификации.
//  Бизнес-данные (имя, аватар, настройки) — в User Service.
// ─────────────────────────────────────────────────────────────
@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false }) // doesn't return passwordHash by default for security
  passwordHash: string;

  @Column({
    type: 'enum',
    enum: Role,
    array: true,
    default: [Role.USER],
  })
  roles: Role[];

  @Column({ nullable: true })
  refreshToken?: string | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

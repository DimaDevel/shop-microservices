// ── user.entity.ts ───────────────────────────────────────────
import {
  Entity, PrimaryColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('profiles')
export class ProfileEntity {
  // id совпадает с user.id из Auth Service (не генерируем сами)
  @PrimaryColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  name?: string;

  @Column({ nullable: true })
  avatarUrl?: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

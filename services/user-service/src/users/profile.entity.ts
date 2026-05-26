// ── user.entity.ts ───────────────────────────────────────────
import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('profiles')
export class ProfileEntity {
  // id matches user.id from Auth Service (not generated here)
  @PrimaryColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  name?: string | null;

  @Column({ nullable: true })
  avatarUrl?: string | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

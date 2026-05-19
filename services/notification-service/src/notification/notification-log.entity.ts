import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('notification_log')
@Unique(['orderId', 'eventType'])
export class NotificationLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderId: string;

  @Column()
  eventType: string;

  @Column({ nullable: true })
  correlationId: string;

  @CreateDateColumn()
  createdAt: Date;
}

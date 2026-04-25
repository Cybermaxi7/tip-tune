import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { LicensingLifecycle } from './licensing-lifecycle.enum';

/** @deprecated Use LicensingLifecycle for new code. Kept for backward compatibility. */
export enum LicenseRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('license_requests')
@Index(['requesterId', 'status'])
@Index(['trackId', 'status'])
export class LicenseRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'track_id' })
  trackId: string;

  @Column({ name: 'requester_id' })
  requesterId: string;

  @Column({ type: 'text' })
  intendedUse: string;

  @Column({
    type: 'enum',
    enum: LicensingLifecycle,
    default: LicensingLifecycle.PENDING,
  })
  status: LicensingLifecycle;

  @Column({ type: 'text', nullable: true })
  responseMessage: string | null;

  @Column({ nullable: true })
  respondedAt: Date | null;

  /** When this request automatically transitions to EXPIRED if unanswered. */
  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  /** When the request was withdrawn by the requester. */
  @Column({ type: 'timestamp', nullable: true })
  withdrawnAt: Date | null;

  /** When the request was reopened after expiry. */
  @Column({ type: 'timestamp', nullable: true })
  reopenedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

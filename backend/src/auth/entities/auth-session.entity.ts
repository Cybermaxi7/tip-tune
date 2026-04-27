import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('auth_sessions')
@Index(['userId'])
@Index(['expiresAt'])
export class AuthSession {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'public_key' })
  publicKey: string;

  @Column('text')
  challenge: string;

  @Column({ name: 'expires_at' })
  expiresAt: Date;

  @Column({ name: 'is_challenge', default: true })
  isChallenge: boolean;

  @Column({ name: 'is_refresh_token', default: false })
  isRefreshToken: boolean;

  @Column({ name: 'is_used', default: false })
  isUsed: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

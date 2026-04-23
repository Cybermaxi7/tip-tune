import { UserRole, UserStatus } from '../../src/users/entities/user.entity';
import { StatusType } from '../../src/artist-status/entities/artist-status.entity';
import {
  ReportEntityType,
  ReportReason,
  ReportStatus,
  ReportAction,
} from '../../src/reports/entities/report.entity';
import { NotificationType } from '../../src/notifications/notification.entity';

export const testFixtures = {
  users: {
    listener: {
      id: '550e8400-e29b-41d4-a716-446655440001',
      email: 'listener@test.com',
      username: 'testlistener',
      walletAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      profileImage: null,
      bio: null,
      isArtist: false,
      isDeleted: false,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      deletedAt: null as Date,
    },
    artist: {
      id: '550e8400-e29b-41d4-a716-446655440002',
      email: 'artist@test.com',
      username: 'testartist',
      walletAddress: 'GAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      profileImage: null,
      bio: 'Test artist bio',
      isArtist: true,
      isDeleted: false,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      deletedAt: null as Date,
    },
    admin: {
      id: '550e8400-e29b-41d4-a716-446655440003',
      email: 'admin@test.com',
      username: 'testadmin',
      walletAddress: 'GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      profileImage: null,
      bio: null,
      isArtist: false,
      isDeleted: false,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      deletedAt: null as Date,
    },
  },
  artists: {
    sample: {
      id: '660e8400-e29b-41d4-a716-446655440001',
      userId: '550e8400-e29b-41d4-a716-446655440002',
      artistName: 'Test Artist',
      genre: 'Pop',
      bio: 'Test artist bio',
      profileImage: null,
      coverImage: null,
      walletAddress: 'GAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      isVerified: false,
      totalTipsReceived: '0',
      emailNotifications: true,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
    },
  },
  tracks: {
    sample: {
      id: '770e8400-e29b-41d4-a716-446655440001',
      title: 'Test Track',
      genre: 'pop',
      description: 'A test track for E2E verification',
      artistId: '660e8400-e29b-41d4-a716-446655440001',
      isPublic: true,
      playCount: 0,
      totalTips: '0',
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
    },
  },
  tips: {
    small: { amount: 1.0, currency: 'XLM' },
    large: { amount: 100.0, currency: 'XLM' },
  },
  artistStatus: {
    onTour: {
      statusType: StatusType.ON_TOUR,
      statusMessage: 'On tour in Europe',
    },
    recording: {
      statusType: StatusType.RECORDING,
      statusMessage: 'In the studio',
    },
  },
  reports: {
    spam: {
      entityType: ReportEntityType.TRACK,
      reason: ReportReason.SPAM,
      description: 'This track contains spam content',
    },
  },
  notifications: {
    tipReceived: {
      type: NotificationType.TIP_RECEIVED,
      title: 'New Tip Received',
      message: 'You received a tip of 1.0 XLM',
    },
  },
};

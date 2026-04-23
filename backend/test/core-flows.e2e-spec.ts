import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { testFixtures } from './fixtures/test-data';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { TracksController } from '../src/tracks/tracks.controller';
import { TracksService } from '../src/tracks/tracks.service';
import { TipsController } from '../src/tips/tips.controller';
import { TipsService } from '../src/tips/tips.service';
import { SearchController } from '../src/search/search.controller';
import { SearchService } from '../src/search/search.service';
import { ArtistStatusController } from '../src/artist-status/artist-status.controller';
import { ArtistStatusService } from '../src/artist-status/artist-status.service';
import { ReportsController } from '../src/reports/reports.controller';
import { ReportsService } from '../src/reports/reports.service';
import { NotificationsController } from '../src/notifications/notifications.controller';
import { NotificationsService } from '../src/notifications/notifications.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { ModerateMessagePipe } from '../src/moderation/pipes/moderate-message.pipe';
import { StatusType } from '../src/artist-status/entities/artist-status.entity';
import {
  ReportEntityType,
  ReportReason,
  ReportStatus,
  ReportAction,
} from '../src/reports/entities/report.entity';
import { NotificationType } from '../src/notifications/notification.entity';
import { Reflector } from '@nestjs/core';

const { users, artists, tracks } = testFixtures;

function buildMockAuthService() {
  const challengeStore = new Map<string, { publicKey: string; challenge: string; expiresAt: Date }>();
  const tokenStore = new Map<string, string>();

  return {
    generateChallenge: jest.fn(async (publicKey: string) => {
      if (!publicKey || !publicKey.startsWith('G') || publicKey.length < 56) {
        throw new (require('@nestjs/common').BadRequestException)('Invalid public key format');
      }
      const challengeId = 'challenge-' + Date.now();
      const challenge = 'Sign this message: ' + challengeId;
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      challengeStore.set(challengeId, { publicKey, challenge, expiresAt });
      return { challengeId, challenge, expiresAt };
    }),

    verifySignature: jest.fn(async (dto: any) => {
      const stored = challengeStore.get(dto.challengeId);
      if (!stored || stored.publicKey !== dto.publicKey) {
        throw new (require('@nestjs/common').UnauthorizedException)('Invalid challenge');
      }
      const accessToken = 'mock-access-token-' + Date.now();
      const refreshToken = 'mock-refresh-token-' + Date.now();
      tokenStore.set(refreshToken, users.listener.id);
      return {
        accessToken,
        refreshToken,
        user: { id: users.listener.id, walletAddress: dto.publicKey },
      };
    }),

    refreshAccessToken: jest.fn(async (refreshToken: string) => {
      if (!tokenStore.has(refreshToken)) {
        throw new (require('@nestjs/common').UnauthorizedException)('Invalid refresh token');
      }
      return { accessToken: 'mock-refreshed-token-' + Date.now() };
    }),

    getCurrentUser: jest.fn(async (userId: string) => {
      if (userId === users.listener.id) return users.listener;
      if (userId === users.artist.id) return users.artist;
      if (userId === users.admin.id) return users.admin;
      throw new (require('@nestjs/common').NotFoundException)('User not found');
    }),

    logout: jest.fn(async () => undefined),
  };
}

function buildMockTracksService() {
  const trackStore: any[] = [];

  return {
    create: jest.fn(async (dto: any) => {
      const track = {
        id: tracks.sample.id,
        ...dto,
        artistId: dto.artistId || artists.sample.id,
        playCount: 0,
        totalTips: '0',
        isPublic: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      trackStore.push(track);
      return track;
    }),

    findOne: jest.fn(async (id: string) => {
      const found = trackStore.find((t) => t.id === id);
      if (!found) {
        throw new (require('@nestjs/common').NotFoundException)('Track not found');
      }
      return found;
    }),

    findAll: jest.fn(async () => ({
      data: trackStore,
      total: trackStore.length,
      page: 1,
      limit: 10,
      totalPages: 1,
    })),

    findPublic: jest.fn(async () => ({
      data: trackStore.filter((t) => t.isPublic),
      total: trackStore.filter((t) => t.isPublic).length,
      page: 1,
      limit: 10,
      totalPages: 1,
    })),

    search: jest.fn(async (query: string) => {
      const matches = trackStore.filter(
        (t) =>
          t.title?.toLowerCase().includes(query.toLowerCase()) ||
          t.genre?.toLowerCase().includes(query.toLowerCase()),
      );
      return {
        data: matches,
        total: matches.length,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
    }),

    findByArtist: jest.fn(async (artistId: string) => {
      const matches = trackStore.filter((t) => t.artistId === artistId);
      return {
        data: matches,
        total: matches.length,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
    }),

    findByGenre: jest.fn(async (genre: string) => {
      const matches = trackStore.filter((t) => t.genre === genre);
      return {
        data: matches,
        total: matches.length,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
    }),

    update: jest.fn(async (id: string, dto: any) => {
      const found = trackStore.find((t) => t.id === id);
      if (!found) {
        throw new (require('@nestjs/common').NotFoundException)('Track not found');
      }
      Object.assign(found, dto, { updatedAt: new Date() });
      return found;
    }),

    incrementPlayCount: jest.fn(async (id: string) => {
      const found = trackStore.find((t) => t.id === id);
      if (!found) {
        throw new (require('@nestjs/common').NotFoundException)('Track not found');
      }
      found.playCount += 1;
      return found;
    }),

    addTips: jest.fn(async (id: string, amount: number) => {
      const found = trackStore.find((t) => t.id === id);
      if (!found) {
        throw new (require('@nestjs/common').NotFoundException)('Track not found');
      }
      found.totalTips = String(Number(found.totalTips) + amount);
      return found;
    }),

    remove: jest.fn(async () => undefined),
    _store: trackStore,
  };
}

function buildMockTipsService() {
  const tipStore: any[] = [];

  return {
    create: jest.fn(async (userId: string, dto: any) => {
      const tip = {
        id: '880e8400-e29b-41d4-a716-446655440001',
        ...dto,
        userId,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      tipStore.push(tip);
      return tip;
    }),

    findOne: jest.fn(async (id: string) => {
      const found = tipStore.find((t) => t.id === id);
      if (!found) {
        throw new (require('@nestjs/common').NotFoundException)('Tip not found');
      }
      return found;
    }),

    getUserTipHistory: jest.fn(async (userId: string) => ({
      data: tipStore.filter((t) => t.userId === userId),
      meta: { total: tipStore.length, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    })),

    getArtistReceivedTips: jest.fn(async (artistId: string) => ({
      data: tipStore.filter((t) => t.artistId === artistId),
      meta: { total: tipStore.length, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    })),

    getArtistTipStats: jest.fn(async () => ({
      totalReceived: '1.0',
      totalCount: 1,
      averageAmount: '1.0',
    })),

    _store: tipStore,
  };
}

function buildMockSearchService() {
  return {
    search: jest.fn(async (dto: any) => {
      if (dto.type === 'track') {
        return {
          tracks: {
            data: [tracks.sample],
            total: 1,
            page: 1,
            limit: 10,
            totalPages: 1,
          },
        };
      }
      if (dto.type === 'artist') {
        return {
          artists: {
            data: [artists.sample],
            total: 1,
            page: 1,
            limit: 10,
            totalPages: 1,
          },
        };
      }
      return {
        artists: {
          data: [artists.sample],
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
        tracks: {
          data: [tracks.sample],
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      };
    }),

    getSuggestions: jest.fn(async () => ({
      artists: [{ type: 'artist', id: artists.sample.id, title: artists.sample.artistName }],
      tracks: [{ type: 'track', id: tracks.sample.id, title: tracks.sample.title }],
    })),
  };
}

function buildMockArtistStatusService() {
  const statusStore = new Map<string, any>();
  const historyStore: any[] = [];

  return {
    setStatus: jest.fn(async (artistId: string, dto: any) => {
      const status = {
        id: '990e8400-e29b-41d4-a716-446655440001',
        artistId,
        statusType: dto.statusType,
        statusMessage: dto.statusMessage || null,
        emoji: dto.emoji || null,
        showOnProfile: dto.showOnProfile !== undefined ? dto.showOnProfile : true,
        autoResetAt: dto.autoResetAt || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      statusStore.set(artistId, status);
      historyStore.push({ ...status, changedAt: new Date() });
      return status;
    }),

    getStatus: jest.fn(async (artistId: string) => {
      const status = statusStore.get(artistId);
      if (!status) {
        throw new (require('@nestjs/common').NotFoundException)('Status not found');
      }
      return status;
    }),

    clearStatus: jest.fn(async (artistId: string) => {
      if (!statusStore.has(artistId)) {
        throw new (require('@nestjs/common').NotFoundException)('Status not found');
      }
      statusStore.delete(artistId);
    }),

    getStatusHistory: jest.fn(async () => historyStore),
    _statusStore: statusStore,
    _historyStore: historyStore,
  };
}

function buildMockReportsService() {
  const reportStore: any[] = [];

  return {
    create: jest.fn(async (dto: any, user: any) => {
      const report = {
        id: 'aa0e8400-e29b-41d4-a716-446655440001',
        ...dto,
        reportedBy: user,
        reportedById: user.id,
        status: ReportStatus.PENDING,
        action: ReportAction.NONE,
        reviewedBy: null,
        reviewedById: null,
        reviewNotes: null,
        reviewedAt: null,
        createdAt: new Date(),
      };
      reportStore.push(report);
      return report;
    }),

    findAll: jest.fn(async () => reportStore),

    findOne: jest.fn(async (id: string) => {
      const found = reportStore.find((r) => r.id === id);
      if (!found) {
        throw new (require('@nestjs/common').NotFoundException)('Report not found');
      }
      return found;
    }),

    updateStatus: jest.fn(async (id: string, updateDto: any, admin: any) => {
      const found = reportStore.find((r) => r.id === id);
      if (!found) {
        throw new (require('@nestjs/common').NotFoundException)('Report not found');
      }
      found.status = updateDto.status;
      found.action = updateDto.action || ReportAction.NONE;
      found.reviewNotes = updateDto.reviewNotes || null;
      found.reviewedBy = admin;
      found.reviewedById = admin.id;
      found.reviewedAt = new Date();
      return found;
    }),

    _store: reportStore,
  };
}

function buildMockNotificationsService() {
  const notificationStore: any[] = [];

  return {
    getUserNotifications: jest.fn(async (userId: string) => ({
      data: notificationStore.filter((n) => n.userId === userId),
      total: notificationStore.filter((n) => n.userId === userId).length,
    })),

    getUnreadCount: jest.fn(async (userId: string) => ({
      count: notificationStore.filter((n) => n.userId === userId && !n.isRead).length,
    })),

    markAsRead: jest.fn(async (id: string) => {
      const found = notificationStore.find((n) => n.id === id);
      if (!found) {
        throw new (require('@nestjs/common').NotFoundException)('Notification not found');
      }
      found.isRead = true;
      return found;
    }),

    markAllAsRead: jest.fn(async (userId: string) => {
      notificationStore
        .filter((n) => n.userId === userId)
        .forEach((n) => { n.isRead = true; });
      return { updated: notificationStore.filter((n) => n.userId === userId).length };
    }),

    create: jest.fn(async (dto: any) => {
      const notification = {
        id: 'bb0e8400-e29b-41d4-a716-446655440001',
        ...dto,
        isRead: false,
        createdAt: new Date(),
      };
      notificationStore.push(notification);
      return notification;
    }),

    _store: notificationStore,
  };
}

describe('Core Product Flows (E2E)', () => {
  let app: INestApplication;
  let mockAuthService: ReturnType<typeof buildMockAuthService>;
  let mockTracksService: ReturnType<typeof buildMockTracksService>;
  let mockTipsService: ReturnType<typeof buildMockTipsService>;
  let mockSearchService: ReturnType<typeof buildMockSearchService>;
  let mockArtistStatusService: ReturnType<typeof buildMockArtistStatusService>;
  let mockReportsService: ReturnType<typeof buildMockReportsService>;
  let mockNotificationsService: ReturnType<typeof buildMockNotificationsService>;

  beforeAll(async () => {
    mockAuthService = buildMockAuthService();
    mockTracksService = buildMockTracksService();
    mockTipsService = buildMockTipsService();
    mockSearchService = buildMockSearchService();
    mockArtistStatusService = buildMockArtistStatusService();
    mockReportsService = buildMockReportsService();
    mockNotificationsService = buildMockNotificationsService();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        AuthController,
        TracksController,
        TipsController,
        SearchController,
        ArtistStatusController,
        ReportsController,
        NotificationsController,
      ],
      providers: [
        Reflector,
        { provide: AuthService, useValue: mockAuthService },
        { provide: TracksService, useValue: mockTracksService },
        { provide: TipsService, useValue: mockTipsService },
        { provide: SearchService, useValue: mockSearchService },
        { provide: ArtistStatusService, useValue: mockArtistStatusService },
        { provide: ReportsService, useValue: mockReportsService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: users.listener.id, userId: users.listener.id, role: users.listener.role };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overridePipe(ModerateMessagePipe)
      .useValue({ transform: (value: any) => value })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Auth Flow', () => {
    let challengeId: string;
    let accessToken: string;
    let refreshToken: string;
    const publicKey = users.listener.walletAddress;

    it('should generate a challenge for a valid public key', () => {
      return request(app.getHttpServer())
        .post('/auth/challenge')
        .send({ publicKey })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('challengeId');
          expect(res.body).toHaveProperty('challenge');
          expect(res.body).toHaveProperty('expiresAt');
          challengeId = res.body.challengeId;
        });
    });

    it('should reject challenge with invalid public key', () => {
      return request(app.getHttpServer())
        .post('/auth/challenge')
        .send({ publicKey: 'invalid' })
        .expect(400);
    });

    it('should verify signature and return tokens', () => {
      return request(app.getHttpServer())
        .post('/auth/verify')
        .send({ challengeId, publicKey, signature: 'mock-sig' })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body).toHaveProperty('refreshToken');
          expect(res.body).toHaveProperty('user');
          accessToken = res.body.accessToken;
          refreshToken = res.body.refreshToken;
        });
    });

    it('should get current user profile with valid token', () => {
      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(users.listener.id);
          expect(res.body.username).toBe(users.listener.username);
        });
    });

    it('should refresh access token', () => {
      return request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
        });
    });

    it('should logout successfully', () => {
      return request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toBe('Logout successful');
        });
    });
  });

  describe('Track Access Flow', () => {
    const trackDto = {
      title: tracks.sample.title,
      genre: tracks.sample.genre,
      description: tracks.sample.description,
    };

    it('should create a track', () => {
      return request(app.getHttpServer())
        .post('/tracks')
        .send(trackDto)
        .expect(201)
        .expect((res) => {
          expect(res.body.id).toBe(tracks.sample.id);
          expect(res.body.title).toBe(trackDto.title);
          expect(res.body.genre).toBe(trackDto.genre);
        });
    });

    it('should retrieve the track by ID', () => {
      return request(app.getHttpServer())
        .get(`/tracks/${tracks.sample.id}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(tracks.sample.id);
          expect(res.body.title).toBe(trackDto.title);
        });
    });

    it('should search for the track by title via the search module', () => {
      return request(app.getHttpServer())
        .get('/search')
        .query({ q: 'Test Track', type: 'track' })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('tracks');
          expect(res.body.tracks.data.length).toBeGreaterThan(0);
        });
    });

    it('should list all tracks with pagination', () => {
      return request(app.getHttpServer())
        .get('/tracks')
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toBeDefined();
          expect(res.body.total).toBeGreaterThanOrEqual(1);
        });
    });

    it('should return 404 for a nonexistent track', () => {
      return request(app.getHttpServer())
        .get('/tracks/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  describe('Search Flow', () => {
    it('should search across artists and tracks', () => {
      return request(app.getHttpServer())
        .get('/search')
        .query({ q: 'Test' })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('artists');
          expect(res.body).toHaveProperty('tracks');
        });
    });

    it('should filter search by type=track', () => {
      return request(app.getHttpServer())
        .get('/search')
        .query({ q: 'Test', type: 'track' })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('tracks');
          expect(res.body.tracks.data.length).toBeGreaterThan(0);
        });
    });

    it('should filter search by type=artist', () => {
      return request(app.getHttpServer())
        .get('/search')
        .query({ q: 'Test', type: 'artist' })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('artists');
          expect(res.body.artists.data.length).toBeGreaterThan(0);
        });
    });

    it('should return autocomplete suggestions', () => {
      return request(app.getHttpServer())
        .get('/search/suggestions')
        .query({ q: 'Te' })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('artists');
          expect(res.body).toHaveProperty('tracks');
          expect(res.body.artists.length).toBeGreaterThan(0);
          expect(res.body.tracks.length).toBeGreaterThan(0);
        });
    });
  });

  describe('Tipping Flow', () => {
    const tipDto = {
      artistId: artists.sample.id,
      stellarTxHash: 'c6e0b3e5c8a4f2d1b9a7e6f3c5d8a2b1c4e7f0a9b3d6e9f2c5a8b1e4f7a0c3d6',
      message: 'Great track!',
    };

    it('should create a tip', () => {
      return request(app.getHttpServer())
        .post('/tips')
        .set('x-user-id', users.listener.id)
        .send(tipDto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.artistId).toBe(tipDto.artistId);
          expect(res.body.stellarTxHash).toBe(tipDto.stellarTxHash);
        });
    });

    it('should retrieve the tip by ID', () => {
      return request(app.getHttpServer())
        .get('/tips/880e8400-e29b-41d4-a716-446655440001')
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe('880e8400-e29b-41d4-a716-446655440001');
        });
    });

    it('should get user tip history', () => {
      return request(app.getHttpServer())
        .get(`/tips/user/${users.listener.id}/history`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('meta');
        });
    });

    it('should get artist received tips', () => {
      return request(app.getHttpServer())
        .get(`/tips/artist/${artists.sample.id}/received`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
        });
    });

    it('should get artist tip stats', () => {
      return request(app.getHttpServer())
        .get(`/tips/artist/${artists.sample.id}/stats`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('totalReceived');
          expect(res.body).toHaveProperty('totalCount');
        });
    });

    it('should reject tip without x-user-id header', () => {
      return request(app.getHttpServer())
        .post('/tips')
        .send(tipDto)
        .expect(400);
    });
  });

  describe('Artist Status Flow', () => {
    const artistId = artists.sample.id;

    it('should set artist status to on_tour', () => {
      return request(app.getHttpServer())
        .put(`/artists/${artistId}/status`)
        .send(testFixtures.artistStatus.onTour)
        .expect(200)
        .expect((res) => {
          expect(res.body.statusType).toBe(StatusType.ON_TOUR);
          expect(res.body.statusMessage).toBe('On tour in Europe');
          expect(res.body.artistId).toBe(artistId);
        });
    });

    it('should retrieve artist status', () => {
      return request(app.getHttpServer())
        .get(`/artists/${artistId}/status`)
        .expect(200)
        .expect((res) => {
          expect(res.body.statusType).toBe(StatusType.ON_TOUR);
          expect(res.body.artistId).toBe(artistId);
        });
    });

    it('should update artist status to recording', () => {
      return request(app.getHttpServer())
        .put(`/artists/${artistId}/status`)
        .send(testFixtures.artistStatus.recording)
        .expect(200)
        .expect((res) => {
          expect(res.body.statusType).toBe(StatusType.RECORDING);
          expect(res.body.statusMessage).toBe('In the studio');
        });
    });

    it('should get status history', () => {
      return request(app.getHttpServer())
        .get(`/artists/${artistId}/status/history`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThanOrEqual(2);
        });
    });

    it('should clear artist status', () => {
      return request(app.getHttpServer())
        .delete(`/artists/${artistId}/status`)
        .expect(204);
    });

    it('should return 404 for cleared status', () => {
      return request(app.getHttpServer())
        .get(`/artists/${artistId}/status`)
        .expect(404);
    });
  });

  describe('Report and Moderation Flow', () => {
    const reportDto = {
      entityType: ReportEntityType.TRACK,
      entityId: tracks.sample.id,
      reason: ReportReason.SPAM,
      description: 'This track contains spam content',
    };

    it('should create a report', () => {
      return request(app.getHttpServer())
        .post('/reports')
        .send(reportDto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.entityType).toBe(ReportEntityType.TRACK);
          expect(res.body.reason).toBe(ReportReason.SPAM);
          expect(res.body.status).toBe(ReportStatus.PENDING);
        });
    });

    it('should list all reports (admin)', () => {
      return request(app.getHttpServer())
        .get('/reports')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThanOrEqual(1);
        });
    });

    it('should get report by ID (admin)', () => {
      return request(app.getHttpServer())
        .get('/reports/aa0e8400-e29b-41d4-a716-446655440001')
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe('aa0e8400-e29b-41d4-a716-446655440001');
          expect(res.body.status).toBe(ReportStatus.PENDING);
        });
    });

    it('should resolve a report with content_removed action (admin)', () => {
      return request(app.getHttpServer())
        .patch('/reports/aa0e8400-e29b-41d4-a716-446655440001/status')
        .send({
          status: ReportStatus.RESOLVED,
          action: ReportAction.CONTENT_REMOVED,
          reviewNotes: 'Content has been removed for spam violations',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe(ReportStatus.RESOLVED);
          expect(res.body.action).toBe(ReportAction.CONTENT_REMOVED);
          expect(res.body.reviewedBy).toBeDefined();
          expect(res.body.reviewedAt).toBeDefined();
        });
    });
  });

  describe('Notification-Adjacent Flow', () => {
    beforeAll(async () => {
      await mockNotificationsService.create({
        userId: users.listener.id,
        type: NotificationType.TIP_RECEIVED,
        title: 'New Tip Received',
        message: 'You received a tip of 1.0 XLM',
      });
    });

    it('should get user notifications', () => {
      return request(app.getHttpServer())
        .get('/notifications')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(res.body.data.length).toBeGreaterThan(0);
        });
    });

    it('should get unread notification count', () => {
      return request(app.getHttpServer())
        .get('/notifications/unread-count')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('count');
          expect(res.body.count).toBeGreaterThanOrEqual(1);
        });
    });

    it('should mark a notification as read', () => {
      return request(app.getHttpServer())
        .patch('/notifications/bb0e8400-e29b-41d4-a716-446655440001/read')
        .expect(200)
        .expect((res) => {
          expect(res.body.isRead).toBe(true);
        });
    });

    it('should mark all notifications as read', () => {
      return request(app.getHttpServer())
        .patch('/notifications/read-all')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('updated');
        });
    });
  });
});

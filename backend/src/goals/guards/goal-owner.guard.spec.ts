import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GoalOwnerGuard } from './goal-owner.guard';
import { GoalsService } from '../goals.service';
import { ArtistsService } from '../../artists/artists.service';

describe('GoalOwnerGuard', () => {
  let guard: GoalOwnerGuard;
  let goalsService: GoalsService;
  let artistsService: ArtistsService;

  const mockGoalsService = {
    findOne: jest.fn(),
  };

  const mockArtistsService = {
    findByUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoalOwnerGuard,
        { provide: GoalsService, useValue: mockGoalsService },
        { provide: ArtistsService, useValue: mockArtistsService },
      ],
    }).compile();

    guard = module.get<GoalOwnerGuard>(GoalOwnerGuard);
    goalsService = module.get<GoalsService>(GoalsService);
    artistsService = module.get<ArtistsService>(ArtistsService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  const createMockContext = (userId: string, goalId: string): ExecutionContext => ({
    switchToHttp: () => ({
      getRequest: () => ({
        user: { userId },
        params: { id: goalId },
      }),
    }),
  } as any);

  it('should allow access if user owns the goal', async () => {
    const context = createMockContext('user-1', 'goal-1');
    mockGoalsService.findOne.mockResolvedValue({ id: 'goal-1', artistId: 'artist-1' });
    mockArtistsService.findByUser.mockResolvedValue({ id: 'artist-1', userId: 'user-1' });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should deny access if user does not own the goal', async () => {
    const context = createMockContext('user-2', 'goal-1');
    mockGoalsService.findOne.mockResolvedValue({ id: 'goal-1', artistId: 'artist-1' });
    mockArtistsService.findByUser.mockResolvedValue({ id: 'artist-2', userId: 'user-2' });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should throw NotFoundException if goal does not exist', async () => {
    const context = createMockContext('user-1', 'goal-99');
    mockGoalsService.findOne.mockRejectedValue(new NotFoundException());

    await expect(guard.canActivate(context)).rejects.toThrow(NotFoundException);
  });

  it('should deny access if artist profile not found', async () => {
    const context = createMockContext('user-1', 'goal-1');
    mockGoalsService.findOne.mockResolvedValue({ id: 'goal-1', artistId: 'artist-1' });
    mockArtistsService.findByUser.mockRejectedValue(new NotFoundException());

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});

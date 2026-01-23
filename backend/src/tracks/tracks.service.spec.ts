import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TracksService } from './tracks.service';
import { Track } from './entities/track.entity';
import { StorageService } from '../storage/storage.service';
import { CreateTrackDto } from './dto/create-track.dto';
import { TrackFilterDto } from './dto/pagination.dto';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('TracksService', () => {
  let service: TracksService;
  let tracksRepository: Repository<Track>;
  let storageService: StorageService;

  const mockTrack: Track = {
    id: 'test-id',
    title: 'Test Track',
    duration: 180,
    audioUrl: 'https://example.com/audio.mp3',
    coverArtUrl: 'https://example.com/cover.jpg',
    genre: 'rock',
    releaseDate: new Date('2023-01-01'),
    plays: 0,
    totalTips: 0,
    filename: 'test.mp3',
    url: 'https://example.com/test.mp3',
    streamingUrl: 'https://example.com/test.mp3/stream',
    fileSize: BigInt(1024),
    mimeType: 'audio/mpeg',
    description: 'Test description',
    album: 'Test Album',
    isPublic: true,
    artistId: 'artist-id',
    artist: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockArtist = {
    id: 'artist-id',
    name: 'Test Artist',
    email: 'artist@example.com',
    bio: 'Test bio',
    imageUrl: 'https://example.com/avatar.jpg',
    website: 'https://artist.com',
    socialMedia: 'https://twitter.com/artist',
    isActive: true,
    totalTips: 0,
    totalPlays: 0,
    followerCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    tracks: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TracksService,
        {
          provide: getRepositoryToken(Track),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: StorageService,
          useValue: {
            saveFile: jest.fn(),
            getFileInfo: jest.fn(),
            getStreamingUrl: jest.fn(),
            deleteFile: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TracksService>(TracksService);
    tracksRepository = module.get<Repository<Track>>(getRepositoryToken(Track));
    storageService = module.get<StorageService>(StorageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a track with file upload', async () => {
      const createTrackDto: CreateTrackDto = {
        title: 'Test Track',
        duration: 180,
        genre: 'rock',
        isPublic: true,
      };

      const mockFile = {
        originalname: 'test.mp3',
        buffer: Buffer.from('test'),
      } as Express.Multer.File;

      const fileResult = {
        filename: 'test.mp3',
        path: '/uploads/test.mp3',
        url: 'https://example.com/test.mp3',
      };

      const fileInfo = {
        exists: true,
        size: 1024,
        mimeType: 'audio/mpeg',
      };

      jest.spyOn(storageService, 'saveFile').mockResolvedValue(fileResult);
      jest.spyOn(storageService, 'getFileInfo').mockResolvedValue(fileInfo);
      jest.spyOn(storageService, 'getStreamingUrl').mockResolvedValue('https://example.com/test.mp3/stream');
      jest.spyOn(tracksRepository, 'create').mockReturnValue(mockTrack);
      jest.spyOn(tracksRepository, 'save').mockResolvedValue(mockTrack);

      const result = await service.create(createTrackDto, mockFile);

      expect(result).toEqual(mockTrack);
      expect(storageService.saveFile).toHaveBeenCalledWith(mockFile);
      expect(tracksRepository.create).toHaveBeenCalledWith({
        ...createTrackDto,
        audioUrl: fileResult.url,
        filename: fileResult.filename,
        url: fileResult.url,
        streamingUrl: 'https://example.com/test.mp3/stream',
        fileSize: BigInt(1024),
        mimeType: 'audio/mpeg',
      });
    });

    it('should create a track with audio URL only', async () => {
      const createTrackDto: CreateTrackDto = {
        title: 'Test Track',
        duration: 180,
        audioUrl: 'https://example.com/audio.mp3',
        genre: 'rock',
        isPublic: true,
      };

      jest.spyOn(tracksRepository, 'create').mockReturnValue(mockTrack);
      jest.spyOn(tracksRepository, 'save').mockResolvedValue(mockTrack);

      const result = await service.create(createTrackDto);

      expect(result).toEqual(mockTrack);
      expect(tracksRepository.create).toHaveBeenCalledWith({
        ...createTrackDto,
        audioUrl: 'https://example.com/audio.mp3',
      });
    });
  });

  describe('findAll', () => {
    it('should return paginated tracks', async () => {
      const filter: TrackFilterDto = {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      };

      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockTrack], 1]),
      };

      jest.spyOn(tracksRepository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      const result = await service.findAll(filter);

      expect(result).toEqual({
        data: [mockTrack],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('should apply filters correctly', async () => {
      const filter: TrackFilterDto = {
        page: 1,
        limit: 10,
        artistId: 'artist-id',
        genre: 'rock',
        isPublic: true,
      };

      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockTrack], 1]),
      };

      jest.spyOn(tracksRepository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      await service.findAll(filter);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('track.artistId = :artistId', { artistId: 'artist-id' });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('track.genre = :genre', { genre: 'rock' });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('track.isPublic = :isPublic', { isPublic: true });
    });
  });

  describe('findOne', () => {
    it('should return a track by ID', async () => {
      jest.spyOn(tracksRepository, 'findOne').mockResolvedValue(mockTrack);

      const result = await service.findOne('test-id');

      expect(result).toEqual(mockTrack);
      expect(tracksRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'test-id' },
        relations: ['artist'],
      });
    });

    it('should throw NotFoundException if track not found', async () => {
      jest.spyOn(tracksRepository, 'findOne').mockResolvedValue(null);

      await expect(service.findOne('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a track', async () => {
      const updateData = { title: 'Updated Track' };
      const updatedTrack = { ...mockTrack, title: 'Updated Track' };

      jest.spyOn(service, 'findOne').mockResolvedValue(mockTrack);
      jest.spyOn(tracksRepository, 'save').mockResolvedValue(updatedTrack);

      const result = await service.update('test-id', updateData);

      expect(result.title).toBe('Updated Track');
      expect(tracksRepository.save).toHaveBeenCalledWith(updatedTrack);
    });
  });

  describe('remove', () => {
    it('should delete a track and its file', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(mockTrack);
      jest.spyOn(storageService, 'deleteFile').mockResolvedValue(undefined);
      jest.spyOn(tracksRepository, 'remove').mockResolvedValue(mockTrack);

      await service.remove('test-id');

      expect(storageService.deleteFile).toHaveBeenCalledWith('test.mp3');
      expect(tracksRepository.remove).toHaveBeenCalledWith(mockTrack);
    });
  });

  describe('incrementPlayCount', () => {
    it('should increment play count', async () => {
      const trackWithIncrementedPlays = { ...mockTrack, plays: 1 };

      jest.spyOn(service, 'findOne').mockResolvedValue(mockTrack);
      jest.spyOn(tracksRepository, 'save').mockResolvedValue(trackWithIncrementedPlays);

      const result = await service.incrementPlayCount('test-id');

      expect(result.plays).toBe(1);
      expect(tracksRepository.save).toHaveBeenCalledWith(trackWithIncrementedPlays);
    });
  });

  describe('addTips', () => {
    it('should add tips to track total', async () => {
      const trackWithTips = { ...mockTrack, totalTips: 10.50 };

      jest.spyOn(service, 'findOne').mockResolvedValue(mockTrack);
      jest.spyOn(tracksRepository, 'save').mockResolvedValue(trackWithTips);

      const result = await service.addTips('test-id', 10.50);

      expect(result.totalTips).toBe(10.50);
      expect(tracksRepository.save).toHaveBeenCalledWith(trackWithTips);
    });
  });

  describe('search', () => {
    it('should return search results', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockTrack], 1]),
      };

      jest.spyOn(tracksRepository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      const result = await service.search('test', { page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('track.title ILIKE :query', { query: '%test%' });
      expect(mockQueryBuilder.orWhere).toHaveBeenCalledWith('track.album ILIKE :query', { query: '%test%' });
    });
  });
});

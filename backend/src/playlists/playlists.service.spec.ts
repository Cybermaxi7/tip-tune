import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlaylistsService } from './playlists.service';
import { Playlist } from './entities/playlist.entity';
import { PlaylistTrack } from './entities/playlist-track.entity';
import { Track } from '../tracks/entities/track.entity';
import { CreatePlaylistDto } from './dto/create-playlist.dto';
import { UpdatePlaylistDto } from './dto/update-playlist.dto';
import { AddTrackDto } from './dto/add-track.dto';
import { ReorderTracksDto } from './dto/reorder-tracks.dto';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

describe('PlaylistsService', () => {
  let service: PlaylistsService;
  let playlistRepository: Repository<Playlist>;
  let playlistTrackRepository: Repository<PlaylistTrack>;
  let trackRepository: Repository<Track>;

  const mockUserId = 'user-123';
  const mockPlaylistId = 'playlist-123';
  const mockTrackId = 'track-123';

  const mockPlaylist: Playlist = {
    id: mockPlaylistId,
    userId: mockUserId,
    name: 'Test Playlist',
    description: 'Test description',
    isPublic: false,
    coverImage: null,
    trackCount: 0,
    totalDuration: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: null,
    playlistTracks: [],
  };

  const mockTrack: Track = {
    id: mockTrackId,
    title: 'Test Track',
    duration: 180,
    audioUrl: 'https://example.com/audio.mp3',
    coverArtUrl: null,
    genre: 'rock',
    releaseDate: null,
    plays: 0,
    totalTips: 0,
    tipCount: 0,
    filename: null,
    url: null,
    streamingUrl: null,
    fileSize: null,
    mimeType: null,
    description: null,
    album: null,
    isPublic: true,
    artistId: null,
    artist: null,
    tips: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPlaylistTrack: PlaylistTrack = {
    id: 'playlist-track-123',
    playlistId: mockPlaylistId,
    trackId: mockTrackId,
    position: 0,
    addedAt: new Date(),
    playlist: mockPlaylist,
    track: mockTrack,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlaylistsService,
        {
          provide: getRepositoryToken(Playlist),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PlaylistTrack),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            remove: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Track),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PlaylistsService>(PlaylistsService);
    playlistRepository = module.get<Repository<Playlist>>(getRepositoryToken(Playlist));
    playlistTrackRepository = module.get<Repository<PlaylistTrack>>(getRepositoryToken(PlaylistTrack));
    trackRepository = module.get<Repository<Track>>(getRepositoryToken(Track));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new playlist', async () => {
      const createDto: CreatePlaylistDto = {
        name: 'New Playlist',
        description: 'Description',
        isPublic: false,
      };

      jest.spyOn(playlistRepository, 'create').mockReturnValue(mockPlaylist);
      jest.spyOn(playlistRepository, 'save').mockResolvedValue(mockPlaylist);

      const result = await service.create(mockUserId, createDto);

      expect(result).toEqual(mockPlaylist);
      expect(playlistRepository.create).toHaveBeenCalledWith({
        ...createDto,
        userId: mockUserId,
        trackCount: 0,
        totalDuration: 0,
      });
    });
  });

  describe('findOne', () => {
    it('should return a playlist by ID', async () => {
      const playlistWithTracks = { ...mockPlaylist, playlistTracks: [] };
      jest.spyOn(playlistRepository, 'findOne').mockResolvedValue(playlistWithTracks);

      const result = await service.findOne(mockPlaylistId, mockUserId);

      expect(result).toEqual(playlistWithTracks);
      expect(playlistRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockPlaylistId },
        relations: ['user', 'playlistTracks', 'playlistTracks.track', 'playlistTracks.track.artist'],
      });
    });

    it('should throw NotFoundException if playlist not found', async () => {
      jest.spyOn(playlistRepository, 'findOne').mockResolvedValue(null);

      await expect(service.findOne('invalid-id', mockUserId)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if playlist is private and user is not owner', async () => {
      const privatePlaylist = { ...mockPlaylist, userId: 'other-user', isPublic: false };
      jest.spyOn(playlistRepository, 'findOne').mockResolvedValue(privatePlaylist);

      await expect(service.findOne(mockPlaylistId, mockUserId)).rejects.toThrow(ForbiddenException);
    });

    it('should allow access to public playlists', async () => {
      const publicPlaylist = { ...mockPlaylist, userId: 'other-user', isPublic: true, playlistTracks: [] };
      jest.spyOn(playlistRepository, 'findOne').mockResolvedValue(publicPlaylist);

      const result = await service.findOne(mockPlaylistId, mockUserId);
      expect(result).toEqual(publicPlaylist);
    });
  });

  describe('update', () => {
    it('should update a playlist', async () => {
      const updateDto: UpdatePlaylistDto = {
        name: 'Updated Playlist',
        description: 'Updated description',
      };
      const updatedPlaylist = { ...mockPlaylist, ...updateDto };

      jest.spyOn(service, 'findOne').mockResolvedValue(mockPlaylist);
      jest.spyOn(playlistRepository, 'save').mockResolvedValue(updatedPlaylist);

      const result = await service.update(mockPlaylistId, mockUserId, updateDto);

      expect(result.name).toBe('Updated Playlist');
      expect(playlistRepository.save).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      const otherUserPlaylist = { ...mockPlaylist, userId: 'other-user' };
      jest.spyOn(service, 'findOne').mockResolvedValue(otherUserPlaylist);

      await expect(
        service.update(mockPlaylistId, mockUserId, { name: 'Updated' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should delete a playlist', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(mockPlaylist);
      jest.spyOn(playlistRepository, 'remove').mockResolvedValue(mockPlaylist);

      await service.remove(mockPlaylistId, mockUserId);

      expect(playlistRepository.remove).toHaveBeenCalledWith(mockPlaylist);
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      const otherUserPlaylist = { ...mockPlaylist, userId: 'other-user' };
      jest.spyOn(service, 'findOne').mockResolvedValue(otherUserPlaylist);

      await expect(service.remove(mockPlaylistId, mockUserId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('addTrack', () => {
    it('should add a track to a playlist', async () => {
      const addTrackDto: AddTrackDto = { trackId: mockTrackId };
      const playlistWithTrack = {
        ...mockPlaylist,
        trackCount: 1,
        totalDuration: 180,
        playlistTracks: [mockPlaylistTrack],
      };

      jest.spyOn(service, 'findOne').mockResolvedValue(mockPlaylist);
      jest.spyOn(trackRepository, 'findOne').mockResolvedValue(mockTrack);
      jest.spyOn(playlistTrackRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(playlistTrackRepository, 'create').mockReturnValue(mockPlaylistTrack);
      jest.spyOn(playlistTrackRepository, 'save').mockResolvedValue(mockPlaylistTrack);
      jest.spyOn(playlistRepository, 'save').mockResolvedValue(playlistWithTrack);
      jest.spyOn(playlistTrackRepository, 'createQueryBuilder').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ max: null }),
      } as any);

      const result = await service.addTrack(mockPlaylistId, mockUserId, addTrackDto);

      expect(playlistTrackRepository.save).toHaveBeenCalled();
      expect(playlistRepository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException if track already in playlist', async () => {
      const addTrackDto: AddTrackDto = { trackId: mockTrackId };

      jest.spyOn(service, 'findOne').mockResolvedValue(mockPlaylist);
      jest.spyOn(trackRepository, 'findOne').mockResolvedValue(mockTrack);
      jest.spyOn(playlistTrackRepository, 'findOne').mockResolvedValue(mockPlaylistTrack);

      await expect(
        service.addTrack(mockPlaylistId, mockUserId, addTrackDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if track not found', async () => {
      const addTrackDto: AddTrackDto = { trackId: 'invalid-track' };

      jest.spyOn(service, 'findOne').mockResolvedValue(mockPlaylist);
      jest.spyOn(trackRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.addTrack(mockPlaylistId, mockUserId, addTrackDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeTrack', () => {
    it('should remove a track from a playlist', async () => {
      const playlistWithTrack = {
        ...mockPlaylist,
        trackCount: 1,
        totalDuration: 180,
      };

      jest.spyOn(service, 'findOne').mockResolvedValue(playlistWithTrack);
      jest.spyOn(playlistTrackRepository, 'findOne').mockResolvedValue(mockPlaylistTrack);
      jest.spyOn(playlistTrackRepository, 'remove').mockResolvedValue(mockPlaylistTrack);
      jest.spyOn(playlistTrackRepository, 'createQueryBuilder').mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      } as any);
      jest.spyOn(playlistRepository, 'save').mockResolvedValue(mockPlaylist);

      await service.removeTrack(mockPlaylistId, mockTrackId, mockUserId);

      expect(playlistTrackRepository.remove).toHaveBeenCalled();
      expect(playlistRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if track not in playlist', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(mockPlaylist);
      jest.spyOn(playlistTrackRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.removeTrack(mockPlaylistId, mockTrackId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('reorderTracks', () => {
    it('should reorder tracks in a playlist', async () => {
      const reorderDto: ReorderTracksDto = {
        tracks: [
          { trackId: mockTrackId, position: 1 },
        ],
      };

      const playlistWithTracks = {
        ...mockPlaylist,
        playlistTracks: [mockPlaylistTrack],
      };

      jest.spyOn(service, 'findOne').mockResolvedValue(playlistWithTracks);
      jest.spyOn(playlistTrackRepository, 'find').mockResolvedValue([mockPlaylistTrack]);
      jest.spyOn(playlistTrackRepository, 'update').mockResolvedValue({ affected: 1 } as any);

      const result = await service.reorderTracks(mockPlaylistId, mockUserId, reorderDto);

      expect(playlistTrackRepository.update).toHaveBeenCalled();
    });

    it('should throw BadRequestException if track not in playlist', async () => {
      const reorderDto: ReorderTracksDto = {
        tracks: [
          { trackId: 'invalid-track', position: 1 },
        ],
      };

      jest.spyOn(service, 'findOne').mockResolvedValue(mockPlaylist);
      jest.spyOn(playlistTrackRepository, 'find').mockResolvedValue([]);

      await expect(
        service.reorderTracks(mockPlaylistId, mockUserId, reorderDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('duplicate', () => {
    it('should duplicate a playlist', async () => {
      const originalPlaylist = {
        ...mockPlaylist,
        playlistTracks: [mockPlaylistTrack],
        totalDuration: 180,
        trackCount: 1,
      };
      const duplicatedPlaylist = {
        ...mockPlaylist,
        id: 'new-playlist-id',
        name: 'Test Playlist (Copy)',
      };

      jest.spyOn(service, 'findOne').mockResolvedValue(originalPlaylist);
      jest.spyOn(playlistRepository, 'create').mockReturnValue(duplicatedPlaylist);
      jest.spyOn(playlistRepository, 'save').mockResolvedValue(duplicatedPlaylist);
      jest.spyOn(playlistTrackRepository, 'create').mockReturnValue(mockPlaylistTrack);
      // TypeORM save returns array when saving array of entities
      jest.spyOn(playlistTrackRepository, 'save').mockImplementation(async (entities: any) => {
        return Array.isArray(entities) ? entities : entities;
      }) as jest.Mock;

      const result = await service.duplicate(mockPlaylistId, mockUserId);

      expect(playlistRepository.save).toHaveBeenCalled();
      expect(playlistTrackRepository.save).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if playlist is private and user is not owner', async () => {
      const privatePlaylist = { ...mockPlaylist, userId: 'other-user', isPublic: false };
      jest.spyOn(service, 'findOne').mockResolvedValue(privatePlaylist);

      await expect(service.duplicate(mockPlaylistId, mockUserId)).rejects.toThrow(ForbiddenException);
    });

    it('should allow duplicating public playlists', async () => {
      const publicPlaylist = {
        ...mockPlaylist,
        userId: 'other-user',
        isPublic: true,
        playlistTracks: [],
      };
      const duplicatedPlaylist = { ...mockPlaylist, id: 'new-id' };

      jest.spyOn(service, 'findOne').mockResolvedValue(publicPlaylist);
      jest.spyOn(playlistRepository, 'create').mockReturnValue(duplicatedPlaylist);
      jest.spyOn(playlistRepository, 'save').mockResolvedValue(duplicatedPlaylist);

      const result = await service.duplicate(mockPlaylistId, mockUserId);
      expect(result).toBeDefined();
    });
  });

  describe('share', () => {
    it('should make a playlist public', async () => {
      const privatePlaylist = { ...mockPlaylist, isPublic: false };
      const publicPlaylist = { ...mockPlaylist, isPublic: true };

      jest.spyOn(service, 'findOne').mockResolvedValue(privatePlaylist);
      jest.spyOn(playlistRepository, 'save').mockResolvedValue(publicPlaylist);

      const result = await service.share(mockPlaylistId, mockUserId);

      expect(result.isPublic).toBe(true);
      expect(playlistRepository.save).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      const otherUserPlaylist = { ...mockPlaylist, userId: 'other-user' };
      jest.spyOn(service, 'findOne').mockResolvedValue(otherUserPlaylist);

      await expect(service.share(mockPlaylistId, mockUserId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('should return paginated playlists', async () => {
      const mockQueryBuilder = {
        createQueryBuilder: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockPlaylist], 1]),
      };

      jest.spyOn(playlistRepository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      const result = await service.findAll(mockUserId, { page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('findPublic', () => {
    it('should return public playlists', async () => {
      const publicPlaylist = { ...mockPlaylist, isPublic: true };
      const mockQueryBuilder = {
        createQueryBuilder: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[publicPlaylist], 1]),
      };

      jest.spyOn(playlistRepository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      const result = await service.findPublic({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('playlist.isPublic = :isPublic', { isPublic: true });
    });
  });
});

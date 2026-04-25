import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import {
  PlaylistCollaborator,
  PlaylistCollaboratorRole,
  PlaylistCollaboratorStatus,
} from "./entities/playlist-collaborator.entity";
import {
  PlaylistChangeAction,
  PlaylistChangeStatus,
} from "./entities/playlist-change-request.entity";
import { PlaylistChangeRequestValidator } from "./playlist-change-request.validator";
import { PlaylistTrack } from "./entities/playlist-track.entity";
import { Track } from "../tracks/entities/track.entity";

describe("PlaylistChangeRequestValidator", () => {
  let validator: PlaylistChangeRequestValidator;

  const collaboratorRepository = {
    findOne: jest.fn(),
  };

  const playlistTrackRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const trackRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlaylistChangeRequestValidator,
        {
          provide: getRepositoryToken(PlaylistCollaborator),
          useValue: collaboratorRepository,
        },
        {
          provide: getRepositoryToken(PlaylistTrack),
          useValue: playlistTrackRepository,
        },
        {
          provide: getRepositoryToken(Track),
          useValue: trackRepository,
        },
      ],
    }).compile();

    validator = module.get<PlaylistChangeRequestValidator>(
      PlaylistChangeRequestValidator,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("marks expired requests as expired", async () => {
    const result = await validator.validateForApproval(
      {
        id: "playlist-1",
        userId: "owner-1",
        smartPlaylist: null,
      } as any,
      {
        id: "change-1",
        playlistId: "playlist-1",
        requestedById: "editor-1",
        action: PlaylistChangeAction.ADD_TRACK,
        payload: { trackId: "track-1" },
        expiresAt: new Date("2026-04-24T00:00:00.000Z"),
      } as any,
    );

    expect(result).toEqual({
      isValid: false,
      status: PlaylistChangeStatus.EXPIRED,
      rejectionReason: "Change request has expired",
    });
  });

  it("rejects requests when the requester has lost edit access", async () => {
    collaboratorRepository.findOne.mockResolvedValue({
      role: PlaylistCollaboratorRole.VIEWER,
      status: PlaylistCollaboratorStatus.ACCEPTED,
    });

    const result = await validator.validateForApproval(
      {
        id: "playlist-1",
        userId: "owner-1",
        smartPlaylist: null,
      } as any,
      {
        id: "change-1",
        playlistId: "playlist-1",
        requestedById: "editor-1",
        action: PlaylistChangeAction.ADD_TRACK,
        payload: { trackId: "track-1" },
        expiresAt: null,
      } as any,
    );

    expect(result).toEqual({
      isValid: false,
      status: PlaylistChangeStatus.REJECTED,
      rejectionReason:
        "Requester no longer has permission to edit this playlist",
    });
  });

  it("rejects add-track requests when the target track has been deleted", async () => {
    collaboratorRepository.findOne.mockResolvedValue({
      role: PlaylistCollaboratorRole.EDITOR,
      status: PlaylistCollaboratorStatus.ACCEPTED,
    });
    trackRepository.findOne.mockResolvedValue(null);
    playlistTrackRepository.findOne.mockResolvedValue(null);

    const result = await validator.validateForApproval(
      {
        id: "playlist-1",
        userId: "owner-1",
        smartPlaylist: null,
      } as any,
      {
        id: "change-1",
        playlistId: "playlist-1",
        requestedById: "editor-1",
        action: PlaylistChangeAction.ADD_TRACK,
        payload: { trackId: "track-1" },
        expiresAt: null,
      } as any,
    );

    expect(result).toEqual({
      isValid: false,
      status: PlaylistChangeStatus.REJECTED,
      rejectionReason: "Requested track no longer exists",
    });
  });

  it("rejects reorder requests when tracks no longer match the playlist", async () => {
    collaboratorRepository.findOne.mockResolvedValue({
      role: PlaylistCollaboratorRole.EDITOR,
      status: PlaylistCollaboratorStatus.ACCEPTED,
    });
    playlistTrackRepository.find.mockResolvedValue([{ trackId: "track-1" }]);

    const result = await validator.validateForApproval(
      {
        id: "playlist-1",
        userId: "owner-1",
        smartPlaylist: null,
      } as any,
      {
        id: "change-1",
        playlistId: "playlist-1",
        requestedById: "editor-1",
        action: PlaylistChangeAction.REORDER_TRACKS,
        payload: {
          tracks: [
            { trackId: "track-1", position: 0 },
            { trackId: "track-2", position: 1 },
          ],
        },
        expiresAt: null,
      } as any,
    );

    expect(result).toEqual({
      isValid: false,
      status: PlaylistChangeStatus.REJECTED,
      rejectionReason: "One or more tracks are no longer in this playlist",
    });
  });
});

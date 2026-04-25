import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Track } from "../tracks/entities/track.entity";
import {
  PlaylistCollaborator,
  PlaylistCollaboratorRole,
  PlaylistCollaboratorStatus,
} from "./entities/playlist-collaborator.entity";
import {
  PlaylistChangeAction,
  PlaylistChangeRequest,
  PlaylistChangeStatus,
} from "./entities/playlist-change-request.entity";
import { Playlist } from "./entities/playlist.entity";
import { PlaylistTrack } from "./entities/playlist-track.entity";

export interface PlaylistChangeRequestValidationResult {
  isValid: boolean;
  rejectionReason?: string;
  status?: PlaylistChangeStatus;
}

@Injectable()
export class PlaylistChangeRequestValidator {
  constructor(
    @InjectRepository(PlaylistCollaborator)
    private readonly collaboratorRepository: Repository<PlaylistCollaborator>,
    @InjectRepository(PlaylistTrack)
    private readonly playlistTrackRepository: Repository<PlaylistTrack>,
    @InjectRepository(Track)
    private readonly trackRepository: Repository<Track>,
  ) {}

  async validateForApproval(
    playlist: Playlist,
    changeRequest: PlaylistChangeRequest,
  ): Promise<PlaylistChangeRequestValidationResult> {
    if (changeRequest.expiresAt && new Date() > changeRequest.expiresAt) {
      return {
        isValid: false,
        status: PlaylistChangeStatus.EXPIRED,
        rejectionReason: "Change request has expired",
      };
    }

    if (playlist.smartPlaylist) {
      return {
        isValid: false,
        status: PlaylistChangeStatus.REJECTED,
        rejectionReason: "Smart playlists cannot be manually edited",
      };
    }

    const requesterRole = await this.getRequesterRole(
      playlist.id,
      playlist.userId,
      changeRequest.requestedById,
    );

    if (!requesterRole || requesterRole === PlaylistCollaboratorRole.VIEWER) {
      return {
        isValid: false,
        status: PlaylistChangeStatus.REJECTED,
        rejectionReason:
          "Requester no longer has permission to edit this playlist",
      };
    }

    switch (changeRequest.action) {
      case PlaylistChangeAction.ADD_TRACK:
        return this.validateAddTrackRequest(playlist.id, changeRequest);
      case PlaylistChangeAction.REMOVE_TRACK:
        return this.validateRemoveTrackRequest(playlist.id, changeRequest);
      case PlaylistChangeAction.REORDER_TRACKS:
        return this.validateReorderTracksRequest(playlist.id, changeRequest);
      default:
        return {
          isValid: false,
          status: PlaylistChangeStatus.REJECTED,
          rejectionReason: "Unsupported change action",
        };
    }
  }

  private async getRequesterRole(
    playlistId: string,
    playlistOwnerId: string,
    requesterId: string,
  ): Promise<PlaylistCollaboratorRole | null> {
    if (playlistOwnerId === requesterId) {
      return PlaylistCollaboratorRole.OWNER;
    }

    const collaborator = await this.collaboratorRepository.findOne({
      where: {
        playlistId,
        userId: requesterId,
        status: PlaylistCollaboratorStatus.ACCEPTED,
      },
    });

    return collaborator?.role || null;
  }

  private async validateAddTrackRequest(
    playlistId: string,
    changeRequest: PlaylistChangeRequest,
  ): Promise<PlaylistChangeRequestValidationResult> {
    const payload = changeRequest.payload as { trackId?: string };

    if (!payload.trackId) {
      return {
        isValid: false,
        status: PlaylistChangeStatus.REJECTED,
        rejectionReason: "Track change request is missing a track id",
      };
    }

    const [track, existingPlaylistTrack] = await Promise.all([
      this.trackRepository.findOne({ where: { id: payload.trackId } }),
      this.playlistTrackRepository.findOne({
        where: {
          playlistId,
          trackId: payload.trackId,
        },
      }),
    ]);

    if (!track) {
      return {
        isValid: false,
        status: PlaylistChangeStatus.REJECTED,
        rejectionReason: "Requested track no longer exists",
      };
    }

    if (existingPlaylistTrack) {
      return {
        isValid: false,
        status: PlaylistChangeStatus.REJECTED,
        rejectionReason: "Track is already in this playlist",
      };
    }

    return { isValid: true };
  }

  private async validateRemoveTrackRequest(
    playlistId: string,
    changeRequest: PlaylistChangeRequest,
  ): Promise<PlaylistChangeRequestValidationResult> {
    const payload = changeRequest.payload as { trackId?: string };

    if (!payload.trackId) {
      return {
        isValid: false,
        status: PlaylistChangeStatus.REJECTED,
        rejectionReason: "Track change request is missing a track id",
      };
    }

    const playlistTrack = await this.playlistTrackRepository.findOne({
      where: {
        playlistId,
        trackId: payload.trackId,
      },
    });

    if (!playlistTrack) {
      return {
        isValid: false,
        status: PlaylistChangeStatus.REJECTED,
        rejectionReason: "Track is no longer in this playlist",
      };
    }

    return { isValid: true };
  }

  private async validateReorderTracksRequest(
    playlistId: string,
    changeRequest: PlaylistChangeRequest,
  ): Promise<PlaylistChangeRequestValidationResult> {
    const payload = changeRequest.payload as {
      tracks?: { position: number; trackId: string }[];
    };
    const requestedTrackIds =
      payload.tracks?.map((track) => track.trackId) || [];

    if (requestedTrackIds.length === 0) {
      return {
        isValid: false,
        status: PlaylistChangeStatus.REJECTED,
        rejectionReason: "Track reorder request is empty",
      };
    }

    const existingTracks = await this.playlistTrackRepository.find({
      where: {
        playlistId,
        trackId: In(requestedTrackIds),
      },
    });

    if (existingTracks.length !== requestedTrackIds.length) {
      return {
        isValid: false,
        status: PlaylistChangeStatus.REJECTED,
        rejectionReason: "One or more tracks are no longer in this playlist",
      };
    }

    return { isValid: true };
  }
}

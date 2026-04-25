import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TrackLicense, LicenseType } from "./track-license.entity";
import { LicenseRequest } from "./license-request.entity";
import {
  LicensingLifecycle,
  WITHDRAWABLE_STATES,
  REOPENABLE_STATES,
  RESPONDABLE_STATES,
} from "./licensing-lifecycle.enum";

/** @deprecated kept for callers that still reference the old enum */
export { LicenseRequestStatus } from "./license-request.entity";
import {
  CreateTrackLicenseDto,
  CreateLicenseRequestDto,
  RespondToLicenseRequestDto,
} from "./licensing.dto";
import { LicensingMailService } from "./licensing-mail.service";
import { LicensingDeliveryQueue } from "./licensing-delivery.queue";
import { NotificationsService } from "@/notifications/notifications.service";
import { Track } from "@/tracks/entities/track.entity";
import { NotificationType } from "@/notifications/notification.entity";

@Injectable()
export class LicensingService {
  constructor(
    @InjectRepository(TrackLicense)
    private readonly trackLicenseRepo: Repository<TrackLicense>,
    @InjectRepository(Track)
    private readonly trackRepo: Repository<Track>,
    @InjectRepository(LicenseRequest)
    private readonly licenseRequestRepo: Repository<LicenseRequest>,
    private readonly mailService: LicensingMailService,
    private readonly notificationsService: NotificationsService,
    private readonly deliveryQueue: LicensingDeliveryQueue,
  ) {}

  // ── Track License ──────────────────────────────────────────────────────────

  async createOrUpdateLicense(
    trackId: string,
    dto: CreateTrackLicenseDto,
    artistId: string,
  ): Promise<TrackLicense> {
    const track = await this.trackRepo.findOne({
      where: { id: trackId, artistId },
    });
    if (!track) {
      throw new ForbiddenException(
        "You do not have permission to manage this track's license.",
      );
    }

    let license = await this.trackLicenseRepo.findOne({ where: { trackId } });

    if (license) {
      Object.assign(license, dto);
      return this.trackLicenseRepo.save(license);
    }

    license = this.trackLicenseRepo.create({ trackId, ...dto });
    return this.trackLicenseRepo.save(license);
  }

  async getLicenseByTrack(trackId: string): Promise<TrackLicense> {
    const license = await this.trackLicenseRepo.findOne({ where: { trackId } });
    if (!license) {
      throw new NotFoundException(`License not found for track ${trackId}`);
    }
    return license;
  }

  async assignDefaultLicense(trackId: string): Promise<TrackLicense> {
    const existing = await this.trackLicenseRepo.findOne({
      where: { trackId },
    });
    if (existing) return existing;

    const license = this.trackLicenseRepo.create({
      trackId,
      licenseType: LicenseType.ALL_RIGHTS_RESERVED,
      allowRemix: false,
      allowCommercialUse: false,
      allowDownload: false,
      requireAttribution: true,
    });
    return this.trackLicenseRepo.save(license);
  }

  // ── License Requests ───────────────────────────────────────────────────────

  async createLicenseRequest(
    dto: CreateLicenseRequestDto,
    requesterId: string,
  ): Promise<LicenseRequest> {
    const existing = await this.licenseRequestRepo.findOne({
      where: {
        trackId: dto.trackId,
        requesterId,
        status: LicenseRequestStatus.PENDING,
      },
    });

    if (existing) {
      throw new BadRequestException(
        "You already have a pending request for this track.",
      );
    }

    // Validate track exists before persisting
    const track = await this.trackRepo.findOne({
      where: { id: dto.trackId },
      select: ["artistId"],
    });
    if (!track) {
      throw new NotFoundException(`Track ${dto.trackId} not found.`);
    }

    const request = this.licenseRequestRepo.create({
      ...dto,
      requesterId,
      status: LicenseRequestStatus.PENDING,
    });
    const saved = await this.licenseRequestRepo.save(request);

    if (track.artistId) {
      this.deliveryQueue.enqueue("notification", saved.id, {
        userId: track.artistId,
        type: NotificationType.LICENSE_REQUEST,
        title: "New License Request",
        message: `A user has requested a license for your track.`,
        data: { requestId: saved.id, trackId: saved.trackId },
      });
    }

    this.deliveryQueue.enqueue("mail", saved.id, {
      kind: "newRequest",
      requestId: saved.id,
    });

    return saved;
  }

  async getArtistRequests(
    artistId: string,
    trackIds: string[],
  ): Promise<LicenseRequest[]> {
    if (!trackIds.length) return [];
    return this.licenseRequestRepo
      .createQueryBuilder("lr")
      .where("lr.trackId IN (:...trackIds)", { trackIds })
      .orderBy("lr.createdAt", "DESC")
      .getMany();
  }

  async respondToRequest(
    requestId: string,
    dto: RespondToLicenseRequestDto,
    artistId: string,
    artistTrackIds: string[],
  ): Promise<LicenseRequest> {
    const request = await this.licenseRequestRepo.findOne({
      where: { id: requestId },
    });

    if (!request) throw new NotFoundException("License request not found.");

    if (!artistTrackIds.includes(request.trackId)) {
      throw new ForbiddenException(
        "You are not authorized to respond to this request.",
      );
    }

    if (!RESPONDABLE_STATES.includes(request.status as LicensingLifecycle)) {
      throw new BadRequestException("Request is not in a state that can be responded to.");
    }

    request.status = dto.status as unknown as LicensingLifecycle;
    request.responseMessage = dto.responseMessage ?? null;
    request.respondedAt = new Date();

    const saved = await this.licenseRequestRepo.save(request);

    this.deliveryQueue.enqueue("notification", saved.id, {
      userId: request.requesterId,
      type: NotificationType.LICENSE_RESPONSE,
      title: `License Request ${dto.status.toUpperCase()}`,
      message: `Your request for track ${request.trackId} has been ${dto.status}.`,
      data: { requestId: saved.id, status: dto.status },
    });

    this.deliveryQueue.enqueue("mail", saved.id, {
      kind: "response",
      requestId: saved.id,
    });

    return saved;
  }

  // ── Lifecycle extensions ────────────────────────────────────────────────────

  async withdrawRequest(
    requestId: string,
    requesterId: string,
  ): Promise<LicenseRequest> {
    const request = await this.licenseRequestRepo.findOne({ where: { id: requestId } });
    if (!request) throw new NotFoundException("License request not found.");
    if (request.requesterId !== requesterId)
      throw new ForbiddenException("You may only withdraw your own requests.");
    if (!WITHDRAWABLE_STATES.includes(request.status as LicensingLifecycle))
      throw new BadRequestException(
        `Cannot withdraw a request in '${request.status}' state.`,
      );

    request.status = LicensingLifecycle.WITHDRAWN;
    request.withdrawnAt = new Date();
    return this.licenseRequestRepo.save(request);
  }

  async expireRequest(requestId: string): Promise<LicenseRequest> {
    const request = await this.licenseRequestRepo.findOne({ where: { id: requestId } });
    if (!request) throw new NotFoundException("License request not found.");
    if (request.status !== LicensingLifecycle.PENDING)
      throw new BadRequestException(
        `Only PENDING requests can be expired; current status is '${request.status}'.`,
      );

    request.status = LicensingLifecycle.EXPIRED;
    return this.licenseRequestRepo.save(request);
  }

  async reopenRequest(
    requestId: string,
    requesterId: string,
  ): Promise<LicenseRequest> {
    const request = await this.licenseRequestRepo.findOne({ where: { id: requestId } });
    if (!request) throw new NotFoundException("License request not found.");
    if (request.requesterId !== requesterId)
      throw new ForbiddenException("You may only reopen your own requests.");
    if (!REOPENABLE_STATES.includes(request.status as LicensingLifecycle))
      throw new BadRequestException(
        `Cannot reopen a request in '${request.status}' state.`,
      );

    request.status = LicensingLifecycle.REOPENED;
    request.reopenedAt = new Date();
    request.responseMessage = null;
    request.respondedAt = null;
    return this.licenseRequestRepo.save(request);
  }

  /** Expire all PENDING requests whose expiresAt has passed. */
  async expireStalePendingRequests(): Promise<number> {
    const result = await this.licenseRequestRepo
      .createQueryBuilder()
      .update(LicenseRequest)
      .set({ status: LicensingLifecycle.EXPIRED })
      .where("status = :status", { status: LicensingLifecycle.PENDING })
      .andWhere("expiresAt IS NOT NULL")
      .andWhere("expiresAt < :now", { now: new Date() })
      .execute();
    return result.affected ?? 0;
  }
}

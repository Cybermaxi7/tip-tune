import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource, LessThanOrEqual } from "typeorm";
import { Cron, CronExpression } from "@nestjs/schedule";
import { addDays, addMonths } from "date-fns";

import { SubscriptionTier } from "./entities/subscription-tier.entity";
import {
  FanSubscription,
  SubscriptionStatus,
} from "./entities/fan-subscription.entity";
import { SubscriptionRevenue } from "./entities/subscription-revenue.entity";
import { CreateSubscriptionTierDto } from "./dto/create-subscription-tier.dto";
import { UpdateSubscriptionTierDto } from "./dto/update-subscription-tier.dto";
import {
  SubscribeFanDto,
  CancelSubscriptionDto,
  UpdateSubscriptionStatusDto,
} from "./dto/subscribe-fan.dto";
import { AuthenticatedPrincipal } from "../auth/decorators/current-user.decorator";
import { StellarService } from "../stellar/stellar.service";

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectRepository(SubscriptionTier)
    private readonly tierRepo: Repository<SubscriptionTier>,
    @InjectRepository(FanSubscription)
    private readonly fanSubRepo: Repository<FanSubscription>,
    @InjectRepository(SubscriptionRevenue)
    private readonly revenueRepo: Repository<SubscriptionRevenue>,
    private readonly dataSource: DataSource,
    private readonly stellarService: StellarService,
  ) {}

  // ─── Artist-side tier CRUD ────────────────────────────────────────────────

  /**
   * Create a new subscription tier owned by the authenticated artist.
   */
  async createTier(
    dto: CreateSubscriptionTierDto,
    principal: AuthenticatedPrincipal,
  ): Promise<SubscriptionTier> {
    this.requireArtist(principal);

    // Check for duplicate tier name for this artist
    const existingTier = await this.tierRepo.findOne({
      where: { artistId: principal.artistId!, name: dto.name },
    });

    if (existingTier) {
      throw new ConflictException(
        `You already have a tier named "${dto.name}"`,
      );
    }

    const tier = this.tierRepo.create({
      ...dto,
      artistId: principal.artistId!,
      billingCycleDays: dto.billingCycleDays ?? 30,
      isActive: dto.isActive ?? true,
      currentSubscribers: 0,
    });

    return this.tierRepo.save(tier);
  }

  /**
   * Get all tiers for a specific artist.
   */
  async getArtistTiers(artistId: string): Promise<SubscriptionTier[]> {
    return this.tierRepo.find({
      where: { artistId, isActive: true },
      order: { priceUsdc: "ASC" },
    });
  }

  /**
   * Update a subscription tier (only by tier owner).
   */
  async updateTier(
    tierId: string,
    dto: UpdateSubscriptionTierDto,
    principal: AuthenticatedPrincipal,
  ): Promise<SubscriptionTier> {
    const tier = await this.findTierById(tierId);
    this.verifyTierOwnership(tier, principal);

    // Check for duplicate name if name is being changed
    if (dto.name && dto.name !== tier.name) {
      const existingTier = await this.tierRepo.findOne({
        where: { artistId: tier.artistId, name: dto.name },
      });

      if (existingTier) {
        throw new ConflictException(
          `You already have a tier named "${dto.name}"`,
        );
      }
    }

    Object.assign(tier, dto);
    return this.tierRepo.save(tier);
  }

  /**
   * Delete a subscription tier (only by tier owner).
   */
  async deleteTier(
    tierId: string,
    principal: AuthenticatedPrincipal,
  ): Promise<void> {
    const tier = await this.findTierById(tierId);
    this.verifyTierOwnership(tier, principal);

    // Check if there are active subscriptions
    const activeSubscriptions = await this.fanSubRepo.count({
      where: { tierId, status: SubscriptionStatus.ACTIVE },
    });

    if (activeSubscriptions > 0) {
      throw new BadRequestException(
        "Cannot delete tier with active subscriptions. Please cancel all subscriptions first.",
      );
    }

    await this.tierRepo.remove(tier);
  }

  // ─── Fan-side subscription operations ───────────────────────────────────────

  /**
   * Subscribe to an artist tier.
   */
  async subscribe(
    dto: SubscribeFanDto,
    principal: AuthenticatedPrincipal,
  ): Promise<FanSubscription> {
    const tier = await this.findTierById(dto.tierId);

    // Check if tier is active
    if (!tier.isActive) {
      throw new BadRequestException(
        "This subscription tier is not currently active",
      );
    }

    // Check maximum subscribers limit
    if (tier.maxSubscribers && tier.currentSubscribers >= tier.maxSubscribers) {
      throw new BadRequestException(
        "This tier has reached its maximum subscriber limit",
      );
    }

    // Check if user already has an active subscription to this artist
    const existingSubscription = await this.fanSubRepo.findOne({
      where: {
        fanUserId: principal.userId,
        tierId: dto.tierId,
        status: SubscriptionStatus.ACTIVE,
      },
    });

    if (existingSubscription) {
      throw new ConflictException(
        "You already have an active subscription to this tier",
      );
    }

    // Check if user has any other active subscriptions to this artist
    const otherActiveSubscription = await this.fanSubRepo.findOne({
      where: {
        fanUserId: principal.userId,
        artistId: tier.artistId,
        status: SubscriptionStatus.ACTIVE,
      },
      relations: ["tier"],
    });

    if (otherActiveSubscription) {
      throw new ConflictException(
        `You already have an active subscription to "${otherActiveSubscription.tier.name}". Cancel it first.`,
      );
    }

    // Validate Stellar transaction if provided
    if (dto.stellarTxHash) {
      const isValid = await this.stellarService.validateTransaction(
        dto.stellarTxHash,
      );
      if (!isValid) {
        throw new BadRequestException("Invalid Stellar transaction hash");
      }
    }

    const now = new Date();
    const nextBillingDate = addDays(now, tier.billingCycleDays);

    const subscription = this.fanSubRepo.create({
      fanUserId: principal.userId,
      artistId: tier.artistId,
      tierId: dto.tierId,
      status: dto.status || SubscriptionStatus.PENDING,
      startDate: now,
      nextBillingDate,
      stellarTxHash: dto.stellarTxHash,
    });

    const savedSubscription = await this.fanSubRepo.save(subscription);

    // Update tier subscriber count if subscription is active
    if (savedSubscription.status === SubscriptionStatus.ACTIVE) {
      await this.updateTierSubscriberCount(dto.tierId, 1);
    }

    // Record revenue if payment is confirmed
    if (
      dto.stellarTxHash &&
      savedSubscription.status === SubscriptionStatus.ACTIVE
    ) {
      await this.recordRevenue(savedSubscription, tier);
    }

    return savedSubscription;
  }

  /**
   * Cancel a subscription.
   */
  async cancelSubscription(
    subscriptionId: string,
    dto: CancelSubscriptionDto,
    principal: AuthenticatedPrincipal,
  ): Promise<FanSubscription> {
    const subscription = await this.findSubscriptionById(subscriptionId);
    this.verifySubscriptionOwnership(subscription, principal);

    if (subscription.status === SubscriptionStatus.CANCELLED) {
      throw new BadRequestException("Subscription is already cancelled");
    }

    subscription.status = SubscriptionStatus.CANCELLED;
    subscription.cancelledAt = new Date();

    const savedSubscription = await this.fanSubRepo.save(subscription);

    // Update tier subscriber count
    await this.updateTierSubscriberCount(subscription.tierId, -1);

    this.logger.log(
      `User ${principal.userId} cancelled subscription ${subscriptionId}. Reason: ${dto.reason || "Not provided"}`,
    );

    return savedSubscription;
  }

  /**
   * Get user's subscriptions.
   */
  async getUserSubscriptions(
    principal: AuthenticatedPrincipal,
    status?: SubscriptionStatus,
  ): Promise<FanSubscription[]> {
    const whereClause: any = { fanUserId: principal.userId };
    if (status) {
      whereClause.status = status;
    }

    return this.fanSubRepo.find({
      where: whereClause,
      relations: ["tier"],
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Get subscribers for an artist (artist only).
   */
  async getArtistSubscribers(
    principal: AuthenticatedPrincipal,
  ): Promise<FanSubscription[]> {
    this.requireArtist(principal);

    return this.fanSubRepo.find({
      where: { artistId: principal.artistId! },
      relations: ["tier"],
      order: { createdAt: "DESC" },
    });
  }

  // ─── Admin and utility methods ───────────────────────────────────────────────

  /**
   * Update subscription status (admin only).
   */
  async updateSubscriptionStatus(
    subscriptionId: string,
    dto: UpdateSubscriptionStatusDto,
  ): Promise<FanSubscription> {
    const subscription = await this.findSubscriptionById(subscriptionId);

    const oldStatus = subscription.status;
    subscription.status = dto.status;

    // Handle status-specific logic
    if (
      oldStatus !== SubscriptionStatus.ACTIVE &&
      dto.status === SubscriptionStatus.ACTIVE
    ) {
      // Subscription becoming active
      await this.updateTierSubscriberCount(subscription.tierId, 1);
      const tier = await this.findTierById(subscription.tierId);
      await this.recordRevenue(subscription, tier);
    } else if (
      oldStatus === SubscriptionStatus.ACTIVE &&
      dto.status !== SubscriptionStatus.ACTIVE
    ) {
      // Subscription becoming inactive
      await this.updateTierSubscriberCount(subscription.tierId, -1);
    }

    return this.fanSubRepo.save(subscription);
  }

  /**
   * Get subscription statistics for an artist.
   */
  async getArtistStats(artistId: string): Promise<{
    totalSubscribers: number;
    activeSubscribers: number;
    totalRevenue: string;
    tiers: Array<{
      id: string;
      name: string;
      priceUsdc: string;
      subscribers: number;
      revenue: string;
    }>;
  }> {
    const tiers = await this.getArtistTiers(artistId);
    const subscriptions = await this.fanSubRepo.find({
      where: { artistId },
      relations: ["tier"],
    });

    const activeSubscriptions = subscriptions.filter(
      (s) => s.status === SubscriptionStatus.ACTIVE,
    );
    const totalRevenue = await this.calculateTotalRevenue(artistId);

    const tierStats = tiers.map((tier) => {
      const tierSubscriptions = subscriptions.filter(
        (s) => s.tierId === tier.id,
      );
      const tierActiveSubscriptions = tierSubscriptions.filter(
        (s) => s.status === SubscriptionStatus.ACTIVE,
      );
      const tierRevenue = tierActiveSubscriptions
        .reduce((sum, sub) => sum + parseFloat(tier.priceUsdc), 0)
        .toString();

      return {
        id: tier.id,
        name: tier.name,
        priceUsdc: tier.priceUsdc,
        subscribers: tierActiveSubscriptions.length,
        revenue: tierRevenue,
      };
    });

    return {
      totalSubscribers: subscriptions.length,
      activeSubscribers: activeSubscriptions.length,
      totalRevenue,
      tiers: tierStats,
    };
  }

  // ─── Scheduled tasks ───────────────────────────────────────────────────────

  /**
   * Process recurring billing (runs daily at midnight).
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processRecurringBilling(): Promise<void> {
    this.logger.log("Starting recurring billing process...");

    const dueSubscriptions = await this.fanSubRepo.find({
      where: {
        status: SubscriptionStatus.ACTIVE,
        nextBillingDate: LessThanOrEqual(new Date()),
      },
      relations: ["tier"],
    });

    let processedCount = 0;
    let failedCount = 0;

    for (const subscription of dueSubscriptions) {
      try {
        await this.processSubscriptionRenewal(subscription);
        processedCount++;
      } catch (error) {
        this.logger.error(
          `Failed to process renewal for subscription ${subscription.id}: ${error.message}`,
        );
        failedCount++;
      }
    }

    this.logger.log(
      `Recurring billing completed. Processed: ${processedCount}, Failed: ${failedCount}`,
    );
  }

  // ─── Private helper methods ────────────────────────────────────────────────

  private async findTierById(tierId: string): Promise<SubscriptionTier> {
    const tier = await this.tierRepo.findOne({ where: { id: tierId } });
    if (!tier) {
      throw new NotFoundException("Subscription tier not found");
    }
    return tier;
  }

  private async findSubscriptionById(
    subscriptionId: string,
  ): Promise<FanSubscription> {
    const subscription = await this.fanSubRepo.findOne({
      where: { id: subscriptionId },
      relations: ["tier"],
    });
    if (!subscription) {
      throw new NotFoundException("Subscription not found");
    }
    return subscription;
  }

  private requireArtist(principal: AuthenticatedPrincipal): void {
    if (!principal.artistId) {
      throw new ForbiddenException("This action requires an artist account");
    }
  }

  private verifyTierOwnership(
    tier: SubscriptionTier,
    principal: AuthenticatedPrincipal,
  ): void {
    if (tier.artistId !== principal.artistId) {
      throw new ForbiddenException(
        "You can only modify your own subscription tiers",
      );
    }
  }

  private verifySubscriptionOwnership(
    subscription: FanSubscription,
    principal: AuthenticatedPrincipal,
  ): void {
    if (subscription.fanUserId !== principal.userId) {
      throw new ForbiddenException(
        "You can only modify your own subscriptions",
      );
    }
  }

  private async updateTierSubscriberCount(
    tierId: string,
    delta: number,
  ): Promise<void> {
    await this.tierRepo.increment({ id: tierId }, "currentSubscribers", delta);
  }

  private async recordRevenue(
    subscription: FanSubscription,
    tier: SubscriptionTier,
  ): Promise<void> {
    const revenue = this.revenueRepo.create({
      subscriptionId: subscription.id,
      artistId: tier.artistId,
      fanUserId: subscription.fanUserId,
      amountUsdc: tier.priceUsdc,
      stellarTxHash: subscription.stellarTxHash,
      processedAt: new Date(),
      billingPeriodStart: subscription.startDate,
      billingPeriodEnd: subscription.nextBillingDate!,
    });

    await this.revenueRepo.save(revenue);
  }

  private async calculateTotalRevenue(artistId: string): Promise<string> {
    const result = await this.revenueRepo
      .createQueryBuilder("revenue")
      .select("SUM(revenue.amountUsdc)", "total")
      .where("revenue.artistId = :artistId", { artistId })
      .getRawOne();

    return result?.total || "0";
  }

  private async processSubscriptionRenewal(
    subscription: FanSubscription,
  ): Promise<void> {
    const tier = subscription.tier;
    const newNextBillingDate = addDays(
      subscription.nextBillingDate!,
      tier.billingCycleDays,
    );

    // Update subscription
    subscription.nextBillingDate = newNextBillingDate;
    subscription.expiresAt = newNextBillingDate;
    await this.fanSubRepo.save(subscription);

    // Record revenue
    await this.recordRevenue(subscription, tier);

    this.logger.log(
      `Renewed subscription ${subscription.id} until ${newNextBillingDate}`,
    );
  }
}

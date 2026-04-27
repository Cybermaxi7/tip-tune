import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionTierDto } from './dto/create-subscription-tier.dto';
import { UpdateSubscriptionTierDto } from './dto/update-subscription-tier.dto';
import { SubscribeFanDto, CancelSubscriptionDto, UpdateSubscriptionStatusDto } from './dto/subscribe-fan.dto';
import { SubscriptionStatus } from './entities/fan-subscription.entity';

@ApiTags('subscriptions')
@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  // ─── Artist-side tier management ─────────────────────────────────────────────

  @Post('tiers')
  @ApiOperation({ summary: 'Create a new subscription tier (artist only)' })
  @ApiResponse({ status: 201, description: 'Subscription tier created successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request - Invalid data' })
  @ApiResponse({ status: 403, description: 'Forbidden - Artist account required' })
  @ApiResponse({ status: 409, description: 'Conflict - Tier name already exists' })
  async createTier(
    @Body() dto: CreateSubscriptionTierDto,
    @CurrentUser() principal: any,
  ) {
    return this.subscriptionsService.createTier(dto, principal);
  }

  @Get('tiers/artist/:artistId')
  @ApiOperation({ summary: 'Get all subscription tiers for an artist' })
  @ApiParam({ name: 'artistId', description: 'Artist UUID' })
  @ApiResponse({ status: 200, description: 'List of subscription tiers' })
  async getArtistTiers(@Param('artistId', ParseUUIDPipe) artistId: string) {
    return this.subscriptionsService.getArtistTiers(artistId);
  }

  @Put('tiers/:tierId')
  @ApiOperation({ summary: 'Update a subscription tier (tier owner only)' })
  @ApiParam({ name: 'tierId', description: 'Tier UUID' })
  @ApiResponse({ status: 200, description: 'Subscription tier updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not tier owner' })
  @ApiResponse({ status: 404, description: 'Tier not found' })
  async updateTier(
    @Param('tierId', ParseUUIDPipe) tierId: string,
    @Body() dto: UpdateSubscriptionTierDto,
    @CurrentUser() principal: any,
  ) {
    return this.subscriptionsService.updateTier(tierId, dto, principal);
  }

  @Delete('tiers/:tierId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a subscription tier (tier owner only)' })
  @ApiParam({ name: 'tierId', description: 'Tier UUID' })
  @ApiResponse({ status: 204, description: 'Tier deleted successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request - Tier has active subscriptions' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not tier owner' })
  @ApiResponse({ status: 404, description: 'Tier not found' })
  async deleteTier(
    @Param('tierId', ParseUUIDPipe) tierId: string,
    @CurrentUser() principal: any,
  ) {
    return this.subscriptionsService.deleteTier(tierId, principal);
  }

  // ─── Fan-side subscription management ───────────────────────────────────────

  @Post('subscribe')
  @ApiOperation({ summary: 'Subscribe to an artist tier' })
  @ApiResponse({ status: 201, description: 'Subscription created successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request - Invalid tier or payment' })
  @ApiResponse({ status: 409, description: 'Conflict - Already subscribed' })
  async subscribe(
    @Body() dto: SubscribeFanDto,
    @CurrentUser() principal: any,
  ) {
    return this.subscriptionsService.subscribe(dto, principal);
  }

  @Post(':subscriptionId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a subscription' })
  @ApiParam({ name: 'subscriptionId', description: 'Subscription UUID' })
  @ApiResponse({ status: 200, description: 'Subscription cancelled successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not subscription owner' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async cancelSubscription(
    @Param('subscriptionId', ParseUUIDPipe) subscriptionId: string,
    @Body() dto: CancelSubscriptionDto,
    @CurrentUser() principal: any,
  ) {
    return this.subscriptionsService.cancelSubscription(subscriptionId, dto, principal);
  }

  @Get('my')
  @ApiOperation({ summary: 'Get current user subscriptions' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by subscription status',
    enum: SubscriptionStatus,
  })
  @ApiResponse({ status: 200, description: 'List of user subscriptions' })
  async getUserSubscriptions(
    @CurrentUser() principal: any,
    @Query('status') status?: SubscriptionStatus,
  ) {
    return this.subscriptionsService.getUserSubscriptions(principal, status);
  }

  @Get('artist/subscribers')
  @ApiOperation({ summary: 'Get subscribers for current artist (artist only)' })
  @ApiResponse({ status: 200, description: 'List of artist subscribers' })
  @ApiResponse({ status: 403, description: 'Forbidden - Artist account required' })
  async getArtistSubscribers(@CurrentUser() principal: any) {
    return this.subscriptionsService.getArtistSubscribers(principal);
  }

  // ─── Admin and statistics ───────────────────────────────────────────────────

  @Put(':subscriptionId/status')
  @ApiOperation({ summary: 'Update subscription status (admin only)' })
  @ApiParam({ name: 'subscriptionId', description: 'Subscription UUID' })
  @ApiResponse({ status: 200, description: 'Subscription status updated successfully' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async updateSubscriptionStatus(
    @Param('subscriptionId', ParseUUIDPipe) subscriptionId: string,
    @Body() dto: UpdateSubscriptionStatusDto,
  ) {
    return this.subscriptionsService.updateSubscriptionStatus(subscriptionId, dto);
  }

  @Get('artist/:artistId/stats')
  @ApiOperation({ summary: 'Get subscription statistics for an artist' })
  @ApiParam({ name: 'artistId', description: 'Artist UUID' })
  @ApiResponse({ status: 200, description: 'Artist subscription statistics' })
  async getArtistStats(@Param('artistId', ParseUUIDPipe) artistId: string) {
    return this.subscriptionsService.getArtistStats(artistId);
  }
}

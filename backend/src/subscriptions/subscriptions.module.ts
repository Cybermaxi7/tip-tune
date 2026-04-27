import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionTier } from './entities/subscription-tier.entity';
import { FanSubscription } from './entities/fan-subscription.entity';
import { SubscriptionRevenue } from './entities/subscription-revenue.entity';
import { StellarService } from '../stellar/stellar.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SubscriptionTier, FanSubscription, SubscriptionRevenue]),
    ScheduleModule.forRoot(),
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, StellarService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { ReferralService } from "./referral.service";
import { ReferralController } from "./referral.controller";
import { ReferralCode } from "./referral-code.entity";
import { Referral } from "./referral.entity";
import { RewardDispatcherService } from "./reward-dispatcher.service";
import { StellarModule } from "../stellar/stellar.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([ReferralCode, Referral]),
    ConfigModule,
    StellarModule,
  ],
  controllers: [ReferralController],
  providers: [ReferralService, RewardDispatcherService],
  exports: [ReferralService], // Export so TipModule can call claimReward()
})
export class ReferralModule {}

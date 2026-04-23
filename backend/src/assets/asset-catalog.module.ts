import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetsService } from './assets.service';
import { SupportedAsset } from './entities/supported-asset.entity';
import { StellarModule } from '../stellar/stellar.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([SupportedAsset]),
    StellarModule,
  ],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetCatalogModule {}

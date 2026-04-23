import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StellarService } from './stellar.service';
import { MockStellarService } from './mock-stellar.service';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [
    StellarService,
    MockStellarService,
    {
      provide: 'STELLAR_PROVIDER',
      useFactory: (config: ConfigService, real: StellarService, mock: MockStellarService) => {
        return config.get('ENABLE_MOCK_STELLAR') === 'true' ? mock : real;
      },
      inject: [ConfigService, StellarService, MockStellarService],
    },
  ],
  exports: [StellarService, MockStellarService, 'STELLAR_PROVIDER'],
})
export class StellarModule {}

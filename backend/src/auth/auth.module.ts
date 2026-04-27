import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthRedisService } from "./services/auth-redis.service";
import { WalletStrategy } from "./strategies/wallet.strategy";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { User } from "../users/entities/user.entity";
import { AuthSession } from "./entities/auth-session.entity";
import { UsersModule } from "../users/users.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([User, AuthSession]),
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret:
          configService.get<string>("JWT_SECRET") ||
          "your-secret-key-change-in-production",
        signOptions: {
          expiresIn: "15m",
        },
      }),
      inject: [ConfigService],
    }),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRedisService, WalletStrategy, JwtAuthGuard],
  exports: [AuthService, AuthRedisService, JwtAuthGuard, WalletStrategy],
})
export class AuthModule {}

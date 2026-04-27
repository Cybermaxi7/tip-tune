import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";
import { SelfOrAdminGuard } from "./guards/self-or-admin.guard";
import { User } from "./entities/user.entity";
import { AdminRole } from "../admin/entities/admin-role.entity";

@Module({
  imports: [TypeOrmModule.forFeature([User, AdminRole])],
  controllers: [UsersController],
  providers: [UsersService, SelfOrAdminGuard],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}

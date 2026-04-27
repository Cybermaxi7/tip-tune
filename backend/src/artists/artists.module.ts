import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ArtistsService } from "./artists.service";
import { ArtistsController } from "./artists.controller";
import { ArtistOwnerGuard } from "./guards/artist-owner.guard";
import { Artist } from "./entities/artist.entity";
import { AdminRole } from "../admin/entities/admin-role.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Artist, AdminRole])],
  controllers: [ArtistsController],
  providers: [ArtistsService, ArtistOwnerGuard],
  exports: [ArtistsService],
})
export class ArtistsModule {}

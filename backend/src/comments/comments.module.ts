import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Comment } from "./comment.entity";
import { CommentLike } from "./comment-like.entity";
import { CommentsService } from "./comments.service";
import { CommentsController } from "./comments.controller";
import { BlocksModule } from "../blocks/blocks.module";
import { CommentLikeRepairService } from "./comment-like-repair.service";

@Module({
  imports: [TypeOrmModule.forFeature([Comment, CommentLike]), BlocksModule],
  controllers: [CommentsController],
  providers: [CommentsService, CommentLikeRepairService],
  exports: [CommentsService, CommentLikeRepairService],
})
export class CommentsModule {}

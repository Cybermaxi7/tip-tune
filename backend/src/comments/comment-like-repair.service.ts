import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Comment } from "./comment.entity";
import { CommentLike } from "./comment-like.entity";

@Injectable()
export class CommentLikeRepairService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    @InjectRepository(CommentLike)
    private readonly commentLikeRepository: Repository<CommentLike>,
  ) {}

  async repairCommentLikesCount(commentId: string): Promise<Comment> {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundException("Comment not found");
    }

    const actualLikesCount = await this.commentLikeRepository.count({
      where: { commentId },
    });

    if (comment.likesCount !== actualLikesCount) {
      comment.likesCount = actualLikesCount;
      await this.commentRepository.save(comment);
    }

    return comment;
  }

  async repairAllCommentLikesCounts(): Promise<number> {
    const comments = await this.commentRepository.find();
    let repairedCount = 0;

    for (const comment of comments) {
      const actualLikesCount = await this.commentLikeRepository.count({
        where: { commentId: comment.id },
      });

      if (comment.likesCount !== actualLikesCount) {
        comment.likesCount = actualLikesCount;
        await this.commentRepository.save(comment);
        repairedCount += 1;
      }
    }

    return repairedCount;
  }
}

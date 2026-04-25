import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  DataSource,
  DeleteResult,
  In,
  InsertResult,
  Repository,
} from "typeorm";
import { BlocksService } from "../blocks/blocks.service";
import {
  CommentFeedResponse,
  CommentSortMode,
  CreateCommentDto,
  PaginationQueryDto,
  UpdateCommentDto,
} from "./comment.dto";
import { Comment } from "./comment.entity";
import { CommentLike } from "./comment-like.entity";
import { CommentQueryBuilder } from "./comment-query.builder";

const COMMENT_DELETED_PLACEHOLDER = "[deleted]";

@Injectable()
export class CommentsService {
  private readonly commentQueryBuilder: CommentQueryBuilder;

  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    @InjectRepository(CommentLike)
    private readonly commentLikeRepository: Repository<CommentLike>,
    private readonly blocksService: BlocksService,
    private readonly dataSource: DataSource,
  ) {
    this.commentQueryBuilder = new CommentQueryBuilder(this.commentRepository);
  }

  async create(
    createCommentDto: CreateCommentDto,
    userId: string,
  ): Promise<Comment> {
    const { trackId, content, parentCommentId } = createCommentDto;

    if (parentCommentId) {
      const parentComment = await this.commentRepository.findOne({
        where: { id: parentCommentId },
        relations: ["parentComment"],
      });

      if (!parentComment) {
        throw new NotFoundException("Parent comment not found");
      }

      if (parentComment.parentCommentId) {
        throw new BadRequestException(
          "Cannot reply to a reply. Maximum nesting level is 2.",
        );
      }
    }

    const comment = this.commentRepository.create({
      trackId,
      userId,
      content,
      parentCommentId: parentCommentId || null,
      deletedAt: null,
    });

    return this.commentRepository.save(comment);
  }

  async findByTrack(
    trackId: string,
    query: PaginationQueryDto,
    userId?: string,
  ): Promise<CommentFeedResponse> {
    const limit = this.normalizeLimit(query.limit);
    const replyLimit = this.normalizeReplyLimit(query.replyLimit);
    const sort = query.sort ?? CommentSortMode.NEWEST;
    const blockedUserIds = userId
      ? await this.blocksService.getBlockedUserIds(userId)
      : [];

    const topLevelQuery = this.commentQueryBuilder.buildTopLevelCommentsQuery({
      trackId,
      limit: limit + 1,
      sort,
      cursor: query.cursor,
      blockedUserIds,
    });

    topLevelQuery
      .leftJoinAndSelect("comment.user", "user")
      .loadRelationCountAndMap(
        "comment.replyCount",
        "comment.replies",
        "replyCount",
        (replyCountQb) => {
          if (blockedUserIds.length > 0) {
            replyCountQb.andWhere(
              "replyCount.userId NOT IN (:...blockedUserIds)",
              {
                blockedUserIds,
              },
            );
          }

          return replyCountQb;
        },
      );

    const topLevelComments = await topLevelQuery.getMany();
    const hasMore = topLevelComments.length > limit;
    const pageComments = hasMore
      ? topLevelComments.slice(0, limit)
      : topLevelComments;
    const repliesByParentId = await this.loadBoundedReplies(
      pageComments.map((comment) => comment.id),
      replyLimit,
      blockedUserIds,
    );

    const commentsWithReplies = pageComments.map((comment) => ({
      ...comment,
      replies: repliesByParentId.get(comment.id) || [],
    })) as Comment[];
    const commentsWithLikeStatus = await this.addUserLikedStatus(
      commentsWithReplies,
      userId,
    );
    const visibleComments = commentsWithLikeStatus.map((comment) =>
      this.presentComment(comment),
    );
    const lastVisibleComment = visibleComments[visibleComments.length - 1];

    return {
      comments: visibleComments,
      limit,
      replyLimit,
      sort,
      nextCursor:
        hasMore && lastVisibleComment
          ? this.commentQueryBuilder.encodeCursor(lastVisibleComment, sort)
          : null,
      hasMore,
    };
  }

  async findOne(id: string, userId?: string): Promise<Comment> {
    const comment = await this.commentRepository.findOne({
      where: { id },
      relations: ["user", "replies", "replies.user"],
    });

    if (!comment) {
      throw new NotFoundException("Comment not found");
    }

    comment.replies = this.sortReplies(comment.replies || []);
    comment.replyCount = comment.replies.length;

    const [commentWithStatus] = await this.addUserLikedStatus(
      [comment],
      userId,
    );
    return this.presentComment(commentWithStatus);
  }

  async update(
    id: string,
    updateCommentDto: UpdateCommentDto,
    userId: string,
  ): Promise<Comment> {
    const comment = await this.commentRepository.findOne({ where: { id } });

    if (!comment) {
      throw new NotFoundException("Comment not found");
    }

    if (comment.userId !== userId) {
      throw new ForbiddenException("You can only edit your own comments");
    }

    if (comment.deletedAt) {
      throw new BadRequestException("Deleted comments cannot be edited");
    }

    comment.content = updateCommentDto.content;
    comment.isEdited = true;

    return this.commentRepository.save(comment);
  }

  async delete(id: string, userId: string): Promise<void> {
    const comment = await this.commentRepository.findOne({ where: { id } });

    if (!comment) {
      throw new NotFoundException("Comment not found");
    }

    if (comment.userId !== userId) {
      throw new ForbiddenException("You can only delete your own comments");
    }

    if (comment.deletedAt) {
      return;
    }

    comment.deletedAt = new Date();
    comment.content = COMMENT_DELETED_PLACEHOLDER;
    comment.isEdited = false;
    await this.commentRepository.save(comment);
  }

  async likeComment(commentId: string, userId: string): Promise<Comment> {
    await this.ensureCommentExists(commentId);

    await this.dataSource.transaction(async (manager) => {
      const insertResult = await manager
        .createQueryBuilder()
        .insert()
        .into(CommentLike)
        .values({ commentId, userId })
        .orIgnore()
        .execute();

      if (!this.didAffectRows(insertResult)) {
        return;
      }

      await manager
        .createQueryBuilder()
        .update(Comment)
        .set({ likesCount: () => '"likes_count" + 1' })
        .where("id = :commentId", { commentId })
        .execute();
    });

    return this.findOne(commentId, userId);
  }

  async unlikeComment(commentId: string, userId: string): Promise<Comment> {
    await this.ensureCommentExists(commentId);

    await this.dataSource.transaction(async (manager) => {
      const deleteResult = await manager
        .createQueryBuilder()
        .delete()
        .from(CommentLike)
        .where("comment_id = :commentId", { commentId })
        .andWhere("user_id = :userId", { userId })
        .execute();

      if (!this.didAffectRows(deleteResult)) {
        return;
      }

      await manager
        .createQueryBuilder()
        .update(Comment)
        .set({ likesCount: () => 'GREATEST(0, "likes_count" - 1)' })
        .where("id = :commentId", { commentId })
        .execute();
    });

    return this.findOne(commentId, userId);
  }

  private async ensureCommentExists(commentId: string): Promise<void> {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundException("Comment not found");
    }
  }

  private async loadBoundedReplies(
    parentIds: string[],
    replyLimit: number,
    blockedUserIds: string[],
  ): Promise<Map<string, Comment[]>> {
    if (parentIds.length === 0 || replyLimit <= 0) {
      return new Map();
    }

    const replyIds = await this.commentQueryBuilder.findBoundedReplyIds({
      parentIds,
      replyLimit,
      blockedUserIds,
    });

    if (replyIds.length === 0) {
      return new Map();
    }

    const replies = await this.commentRepository.find({
      where: { id: In(replyIds) },
      relations: ["user"],
    });

    const sortedReplies = this.sortReplies(replies);
    const repliesByParentId = new Map<string, Comment[]>();

    for (const reply of sortedReplies) {
      reply.replyCount = 0;
      const parentReplies = repliesByParentId.get(reply.parentCommentId || "");
      if (parentReplies) {
        parentReplies.push(reply);
        continue;
      }

      repliesByParentId.set(reply.parentCommentId || "", [reply]);
    }

    return repliesByParentId;
  }

  private async addUserLikedStatus(
    comments: Comment[],
    userId?: string,
  ): Promise<Comment[]> {
    if (!userId) {
      return comments.map((comment) => ({
        ...comment,
        userLiked: false,
        replies: comment.replies?.map((reply) => ({
          ...reply,
          userLiked: false,
        })),
      })) as Comment[];
    }

    const commentIds = comments.map((comment) => comment.id);
    const replyIds = comments.flatMap(
      (comment) => comment.replies?.map((reply) => reply.id) || [],
    );
    const allIds = [...commentIds, ...replyIds];

    if (allIds.length === 0) {
      return comments;
    }

    const likes = await this.commentLikeRepository.find({
      where: allIds.map((id) => ({ commentId: id, userId })),
    });
    const likedCommentIds = new Set(likes.map((like) => like.commentId));

    return comments.map((comment) => ({
      ...comment,
      userLiked: likedCommentIds.has(comment.id),
      replies: comment.replies?.map((reply) => ({
        ...reply,
        userLiked: likedCommentIds.has(reply.id),
      })),
    })) as Comment[];
  }

  private presentComment(comment: Comment): Comment {
    const replies = this.sortReplies(comment.replies || []).map((reply) =>
      this.presentSingleComment(reply),
    );

    return this.presentSingleComment({
      ...comment,
      replies,
      replyCount: comment.replyCount ?? replies.length,
    } as Comment);
  }

  private presentSingleComment(comment: Comment): Comment {
    return {
      ...comment,
      content: comment.deletedAt
        ? COMMENT_DELETED_PLACEHOLDER
        : comment.content,
      isDeleted: Boolean(comment.deletedAt),
      isEdited: comment.deletedAt ? false : comment.isEdited,
      userLiked: comment.userLiked ?? false,
      replyCount: comment.replyCount ?? 0,
      replies: comment.replies || [],
    } as Comment;
  }

  private sortReplies(replies: Comment[]): Comment[] {
    return [...replies].sort((left, right) => {
      const createdAtDelta =
        new Date(left.createdAt).getTime() -
        new Date(right.createdAt).getTime();

      if (createdAtDelta !== 0) {
        return createdAtDelta;
      }

      return left.id.localeCompare(right.id);
    });
  }

  private normalizeLimit(limit?: number): number {
    return Math.min(Math.max(Number(limit) || 20, 1), 100);
  }

  private normalizeReplyLimit(replyLimit?: number): number {
    const normalizedReplyLimit =
      replyLimit === undefined ? 3 : Number(replyLimit);
    return Math.min(Math.max(normalizedReplyLimit || 0, 0), 10);
  }

  private didAffectRows(result: InsertResult | DeleteResult): boolean {
    const affected = (result as DeleteResult).affected;
    if (typeof affected === "number") {
      return affected > 0;
    }

    if (Array.isArray(result.raw)) {
      return result.raw.length > 0;
    }

    if (typeof result.raw?.rowCount === "number") {
      return result.raw.rowCount > 0;
    }

    const identifiers = (result as InsertResult).identifiers;
    return Array.isArray(identifiers) && identifiers.length > 0;
  }
}

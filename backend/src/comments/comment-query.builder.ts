import { BadRequestException } from "@nestjs/common";
import { Brackets, Repository, SelectQueryBuilder } from "typeorm";
import { Comment } from "./comment.entity";
import { CommentSortMode } from "./comment.dto";

interface CommentCursorPayload {
  id: string;
  createdAt: string;
  likesCount: number;
  sort: CommentSortMode;
}

interface TopLevelCommentQueryOptions {
  blockedUserIds: string[];
  cursor?: string;
  limit: number;
  sort: CommentSortMode;
  trackId: string;
}

interface BoundedReplyQueryOptions {
  blockedUserIds: string[];
  parentIds: string[];
  replyLimit: number;
}

export class CommentQueryBuilder {
  constructor(private readonly commentRepository: Repository<Comment>) {}

  buildTopLevelCommentsQuery({
    blockedUserIds,
    cursor,
    limit,
    sort,
    trackId,
  }: TopLevelCommentQueryOptions): SelectQueryBuilder<Comment> {
    const queryBuilder = this.commentRepository
      .createQueryBuilder("comment")
      .where("comment.trackId = :trackId", { trackId })
      .andWhere("comment.parentCommentId IS NULL")
      .take(limit);

    if (blockedUserIds.length > 0) {
      queryBuilder.andWhere("comment.userId NOT IN (:...blockedUserIds)", {
        blockedUserIds,
      });
    }

    this.applySort(queryBuilder, sort);
    this.applyCursor(queryBuilder, cursor, sort);

    return queryBuilder;
  }

  async findBoundedReplyIds({
    blockedUserIds,
    parentIds,
    replyLimit,
  }: BoundedReplyQueryOptions): Promise<string[]> {
    if (parentIds.length === 0 || replyLimit <= 0) {
      return [];
    }

    const params: unknown[] = [parentIds, replyLimit];
    const blockedUserFilter =
      blockedUserIds.length > 0 ? `AND NOT (c.user_id = ANY($3::uuid[]))` : "";

    if (blockedUserIds.length > 0) {
      params.push(blockedUserIds);
    }

    const rows = await this.commentRepository.query(
      `
        SELECT ranked.id
        FROM (
          SELECT
            c.id,
            c.parent_comment_id,
            ROW_NUMBER() OVER (
              PARTITION BY c.parent_comment_id
              ORDER BY c.created_at ASC, c.id ASC
            ) AS reply_rank
          FROM comments c
          WHERE c.parent_comment_id = ANY($1::uuid[])
            ${blockedUserFilter}
        ) AS ranked
        WHERE ranked.reply_rank <= $2
        ORDER BY ranked.parent_comment_id ASC, ranked.reply_rank ASC
      `,
      params,
    );

    return rows.map((row: { id: string }) => row.id);
  }

  encodeCursor(
    comment: Pick<Comment, "id" | "createdAt" | "likesCount">,
    sort: CommentSortMode,
  ): string {
    const payload: CommentCursorPayload = {
      id: comment.id,
      createdAt: comment.createdAt.toISOString(),
      likesCount: comment.likesCount,
      sort,
    };

    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  }

  private applyCursor(
    queryBuilder: SelectQueryBuilder<Comment>,
    cursor: string | undefined,
    sort: CommentSortMode,
  ): void {
    if (!cursor) {
      return;
    }

    const decodedCursor = this.decodeCursor(cursor, sort);
    const cursorCreatedAt = new Date(decodedCursor.createdAt);

    if (sort === CommentSortMode.MOST_LIKED) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where("comment.likesCount < :cursorLikesCount", {
            cursorLikesCount: decodedCursor.likesCount,
          }).orWhere(
            new Brackets((sameLikesQb) => {
              sameLikesQb
                .where("comment.likesCount = :cursorLikesCount", {
                  cursorLikesCount: decodedCursor.likesCount,
                })
                .andWhere(
                  new Brackets((sameCreatedAtQb) => {
                    sameCreatedAtQb
                      .where("comment.createdAt < :cursorCreatedAt", {
                        cursorCreatedAt,
                      })
                      .orWhere(
                        "comment.createdAt = :cursorCreatedAt AND comment.id < :cursorId",
                        {
                          cursorCreatedAt,
                          cursorId: decodedCursor.id,
                        },
                      );
                  }),
                );
            }),
          );
        }),
      );

      return;
    }

    queryBuilder.andWhere(
      new Brackets((qb) => {
        qb.where("comment.createdAt < :cursorCreatedAt", {
          cursorCreatedAt,
        }).orWhere(
          "comment.createdAt = :cursorCreatedAt AND comment.id < :cursorId",
          {
            cursorCreatedAt,
            cursorId: decodedCursor.id,
          },
        );
      }),
    );
  }

  private applySort(
    queryBuilder: SelectQueryBuilder<Comment>,
    sort: CommentSortMode,
  ): void {
    if (sort === CommentSortMode.MOST_LIKED) {
      queryBuilder
        .orderBy("comment.likesCount", "DESC")
        .addOrderBy("comment.createdAt", "DESC")
        .addOrderBy("comment.id", "DESC");
      return;
    }

    queryBuilder
      .orderBy("comment.createdAt", "DESC")
      .addOrderBy("comment.id", "DESC");
  }

  private decodeCursor(
    cursor: string,
    expectedSort: CommentSortMode,
  ): CommentCursorPayload {
    try {
      const decoded = JSON.parse(
        Buffer.from(cursor, "base64url").toString("utf8"),
      ) as CommentCursorPayload;

      if (
        !decoded.id ||
        !decoded.createdAt ||
        typeof decoded.likesCount !== "number" ||
        !Object.values(CommentSortMode).includes(decoded.sort)
      ) {
        throw new Error("Malformed cursor");
      }

      if (decoded.sort !== expectedSort) {
        throw new Error("Cursor sort mismatch");
      }

      return decoded;
    } catch {
      throw new BadRequestException("Invalid comment cursor");
    }
  }
}

import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { SanitiseAsPlainText } from "../common/utils/sanitise.util";
import { Comment } from "./comment.entity";

export class CreateCommentDto {
  @IsUUID()
  @IsNotEmpty()
  trackId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  @SanitiseAsPlainText()
  content: string;

  @IsUUID()
  @IsOptional()
  parentCommentId?: string;
}

export class UpdateCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  @SanitiseAsPlainText()
  content: string;
}

export enum CommentSortMode {
  NEWEST = "newest",
  MOST_LIKED = "most-liked",
}

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsEnum(CommentSortMode)
  sort?: CommentSortMode = CommentSortMode.NEWEST;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  replyLimit?: number = 3;
}

export interface CommentFeedResponse {
  comments: Comment[];
  limit: number;
  replyLimit: number;
  sort: CommentSortMode;
  nextCursor: string | null;
  hasMore: boolean;
}

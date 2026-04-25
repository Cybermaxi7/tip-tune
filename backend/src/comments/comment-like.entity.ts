import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
  Unique,
} from "typeorm";
import { Comment } from "./comment.entity";
import { User } from "../users/entities/user.entity";
import { AppBaseEntity } from "../common/entities/base.entity";

@Entity("comment_likes")
@Unique("UQ_comment_likes_comment_user", ["commentId", "userId"])
@Index(["commentId"])
@Index(["userId"])
export class CommentLike extends AppBaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "comment_id" })
  commentId: string;

  @ManyToOne(() => Comment, (comment) => comment.likes, { onDelete: "CASCADE" })
  @JoinColumn({ name: "comment_id" })
  comment: Comment;

  @Column({ name: "user_id" })
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}

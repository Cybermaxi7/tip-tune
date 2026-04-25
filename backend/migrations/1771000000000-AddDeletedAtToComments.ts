import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDeletedAtToComments1771000000000 implements MigrationInterface {
  name = "AddDeletedAtToComments1771000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "comments"
      ADD COLUMN IF NOT EXISTS "deleted_at" timestamp NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_comments_track_parent_created_at"
      ON "comments" ("track_id", "parent_comment_id", "created_at" DESC, "id" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_comments_track_parent_likes_created_at"
      ON "comments" ("track_id", "parent_comment_id", "likes_count" DESC, "created_at" DESC, "id" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_comments_parent_created_at"
      ON "comments" ("parent_comment_id", "created_at" ASC, "id" ASC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_comments_parent_created_at"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_comments_track_parent_likes_created_at"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_comments_track_parent_created_at"
    `);

    await queryRunner.query(`
      ALTER TABLE "comments"
      DROP COLUMN IF EXISTS "deleted_at"
    `);
  }
}

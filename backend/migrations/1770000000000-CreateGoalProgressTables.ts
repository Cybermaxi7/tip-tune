import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGoalProgressTables1770000000000 implements MigrationInterface {
  name = 'CreateGoalProgressTables1770000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create goal_progress_snapshots table
    await queryRunner.query(`
      CREATE TABLE "goal_progress_snapshots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "goalId" uuid NOT NULL,
        "currentAmount" decimal(20,7) NOT NULL,
        "previousAmount" decimal(20,7) NOT NULL,
        "amountDelta" decimal(20,7) NOT NULL,
        "totalSupporters" integer NOT NULL,
        "newSupporters" integer NOT NULL,
        "topSupporters" jsonb,
        "snapshotTrigger" text,
        "triggerTipId" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_goal_progress_snapshots" PRIMARY KEY ("id")
      )
    `);

    // Create supporter_activity_summaries table
    await queryRunner.query(`
      CREATE TABLE "supporter_activity_summaries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "goalId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "totalAmount" decimal(20,7) NOT NULL DEFAULT '0',
        "contributionCount" integer NOT NULL DEFAULT '0',
        "averageContribution" decimal(20,7) NOT NULL DEFAULT '0',
        "firstContributionAt" TIMESTAMP,
        "lastContributionAt" TIMESTAMP,
        "contributionHistory" jsonb,
        "rewardTier" text,
        "isAnonymous" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_supporter_activity_summaries" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_supporter_activity_summaries_goal_user" UNIQUE ("goalId", "userId")
      )
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_goal_progress_snapshots_goal_created" ON "goal_progress_snapshots" ("goalId", "createdAt")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_goal_progress_snapshots_goal" ON "goal_progress_snapshots" ("goalId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_supporter_activity_summaries_goal_user" ON "supporter_activity_summaries" ("goalId", "userId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_supporter_activity_summaries_goal_amount_activity" ON "supporter_activity_summaries" ("goalId", "totalAmount", "lastContributionAt")
    `);

    // Add foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "goal_progress_snapshots"
      ADD CONSTRAINT "FK_goal_progress_snapshots_goal"
      FOREIGN KEY ("goalId") REFERENCES "tip_goals"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "supporter_activity_summaries"
      ADD CONSTRAINT "FK_supporter_activity_summaries_goal"
      FOREIGN KEY ("goalId") REFERENCES "tip_goals"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "supporter_activity_summaries"
      ADD CONSTRAINT "FK_supporter_activity_summaries_user"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints
    await queryRunner.query(`ALTER TABLE "supporter_activity_summaries" DROP CONSTRAINT "FK_supporter_activity_summaries_user"`);
    await queryRunner.query(`ALTER TABLE "supporter_activity_summaries" DROP CONSTRAINT "FK_supporter_activity_summaries_goal"`);
    await queryRunner.query(`ALTER TABLE "goal_progress_snapshots" DROP CONSTRAINT "FK_goal_progress_snapshots_goal"`);

    // Drop indexes
    await queryRunner.query(`DROP INDEX "IDX_supporter_activity_summaries_goal_amount_activity"`);
    await queryRunner.query(`DROP INDEX "IDX_supporter_activity_summaries_goal_user"`);
    await queryRunner.query(`DROP INDEX "IDX_goal_progress_snapshots_goal"`);
    await queryRunner.query(`DROP INDEX "IDX_goal_progress_snapshots_goal_created"`);

    // Drop tables
    await queryRunner.query(`DROP TABLE "supporter_activity_summaries"`);
    await queryRunner.query(`DROP TABLE "goal_progress_snapshots"`);
  }
}
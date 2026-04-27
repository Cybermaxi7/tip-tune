# Goal Progress Operations Runbook

## Overview

This runbook provides operational guidance for managing the goal progress system, including scheduler behavior, maintenance procedures, and troubleshooting steps.

## Scheduler Operations

### Daily Snapshot Creation

**Schedule**: Every day at 2:00 AM UTC  
**Service**: `GoalProgressScheduler.createDailySnapshots()`  
**Scope**: All active goals (status = ACTIVE)

#### Process Flow

1. **Goal Discovery**: Query all active goals from database
2. **Batch Processing**: Create manual snapshot for each active goal
3. **Error Handling**: Individual goal failures don't stop batch processing
4. **Logging**: Comprehensive logging for monitoring and debugging

#### Expected Behavior

```typescript
// Typical log output
[INFO] Starting daily goal progress snapshots
[INFO] Creating snapshots for 245 active goals
[DEBUG] Created daily snapshot for goal abc-123
[DEBUG] Created daily snapshot for goal def-456
[INFO] Completed daily goal progress snapshots
```

#### Manual Trigger

```bash
# Trigger daily snapshots manually (for testing)
curl -X POST http://localhost:3001/admin/goals/snapshots/daily \
  -H "Authorization: Bearer <admin-token>"
```

### Weekly Cleanup Operations

**Schedule**: Every Sunday at 3:00 AM UTC  
**Service**: `GoalProgressScheduler.cleanupOldSnapshots()`  
**Retention**: 90 days (configurable)

#### Process Flow

1. **Cutoff Calculation**: Determine cutoff date (current_date - 90 days)
2. **Batch Deletion**: Delete snapshots in batches of 1000
3. **Progress Tracking**: Log batch progress and total count
4. **Error Recovery**: Continue processing on individual batch failures

#### Expected Behavior

```typescript
// Typical log output
[INFO] Starting cleanup of old goal progress snapshots
[INFO] Starting snapshot pruning for snapshots older than 2024-01-15T00:00:00.000Z (90 days)
[DEBUG] Pruned batch of 1000 snapshots. Total pruned: 1000
[DEBUG] Pruned batch of 1000 snapshots. Total pruned: 2000
[INFO] Snapshot pruning completed. Total snapshots removed: 2,456
```

#### Manual Cleanup

```typescript
// Direct service call (admin/ops use)
await goalProgressRetentionService.pruneOldSnapshots(90);

// Or via API (if implemented)
curl -X POST http://localhost:3001/admin/goals/cleanup \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"retentionDays": 90}'
```

## Event-Driven Operations

### Tip Verification Processing

**Trigger**: `tip.verified` event  
**Service**: `GoalProgressService.handleTipVerified()`  
**Latency**: Near real-time (event-driven)

#### Process Flow

1. **Event Reception**: Listen for `tip.verified` events
2. **Goal Validation**: Check if tip is associated with a goal
3. **Transaction Processing**: Atomic update of goal, supporter summary, and snapshot
4. **Status Update**: Update goal status if target amount reached

#### Transaction Boundaries

```typescript
// All operations in single transaction
await this.goalRepository.manager.transaction(async (manager: EntityManager) => {
  // 1. Update goal progress
  await manager.update(TipGoal, goalId, { currentAmount: newAmount });
  
  // 2. Update supporter summary
  await this.updateSupporterSummary(manager, goalId, tip);
  
  // 3. Create progress snapshot
  await this.createProgressSnapshot(manager, goal, previousAmount, newAmount, tip);
});
```

#### Failure Scenarios

- **Goal Not Found**: Log warning and exit gracefully
- **Transaction Rollback**: All changes rolled back on any failure
- **Event Missing**: Manual snapshot creation available for recovery

## Manual Operations

### Manual Snapshot Creation

**Use Case**: Admin-initiated snapshots, data recovery  
**Endpoint**: `POST /goals/:id/snapshot`  
**Permissions**: Goal owner, admin

#### Process

```typescript
// Manual snapshot trigger
await goalProgressService.createManualSnapshot(goalId);

// Creates snapshot with:
// - currentAmount: goal.currentAmount
// - previousAmount: goal.currentAmount (no change)
// - amountDelta: 0
// - snapshotTrigger: 'manual'
```

#### Use Cases

1. **Data Recovery**: Recover from missed events
2. **Milestone Capture**: Capture specific moments
3. **Testing**: Verify snapshot creation process
4. **Migration**: Create baseline after data migration

### Goal Status Corrections

**Use Case**: Fix incorrect goal status, manual adjustments  
**Method**: Direct database updates (admin only)

```sql
-- Update goal status manually
UPDATE tip_goals 
SET status = 'COMPLETED' 
WHERE id = 'goal-uuid' AND currentAmount >= goalAmount;

-- Create corrective snapshot
INSERT INTO goal_progress_snapshots (goalId, currentAmount, previousAmount, amountDelta, snapshotTrigger, createdAt)
VALUES ('goal-uuid', new_amount, old_amount, delta, 'manual_correction', NOW());
```

## Monitoring and Alerting

### Key Metrics

#### Scheduler Health

```typescript
// Monitor these metrics
- Daily snapshot success rate
- Snapshot processing duration
- Failed snapshot count
- Cleanup operation duration
- Database connection health
```

#### Data Quality

```typescript
// Data integrity checks
- Snapshot sequence continuity
- Supporter summary consistency
- Goal amount vs snapshot totals
- Anonymous tip handling
```

### Alert Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Daily snapshot success rate | < 95% | < 90% | Investigate scheduler failures |
| Snapshot processing time | > 5 minutes | > 15 minutes | Check database performance |
| Failed snapshots per batch | > 10 | > 50 | Review error logs |
| Cleanup duration | > 30 minutes | > 60 minutes | Check database load |
| Event processing lag | > 1 minute | > 5 minutes | Check event queue |

### Log Analysis

#### Daily Health Check

```bash
# Check daily snapshot completion
grep "Completed daily goal progress snapshots" /logs/application.log | tail -7

# Check cleanup operations
grep "Snapshot pruning completed" /logs/application.log | tail -4

# Check error patterns
grep "Failed to create snapshot" /logs/application.log | tail -10
```

#### Performance Monitoring

```bash
# Monitor snapshot creation performance
grep "Created daily snapshot" /logs/application.log | \
  awk '{print $NF}' | \
  sort | uniq -c | sort -nr

# Check database query performance
grep "Query execution time" /logs/application.log | \
  awk '{print $NF}' | sort -n
```

## Troubleshooting Guide

### Common Issues

#### 1. Missing Snapshots

**Symptoms**: Gaps in progress history, missing daily snapshots

**Diagnosis**:
```sql
-- Check for missing daily snapshots
SELECT goalId, DATE(createdAt) as snapshot_date, COUNT(*) as snapshot_count
FROM goal_progress_snapshots
WHERE snapshotTrigger = 'scheduled'
GROUP BY goalId, DATE(createdAt)
HAVING COUNT(*) = 0
ORDER BY goalId, snapshot_date;
```

**Resolution**:
```typescript
// Create missing snapshots
const missingGoals = await findGoalsWithMissingSnapshots(dateRange);
for (const goal of missingGoals) {
  await goalProgressService.createManualSnapshot(goal.id);
}
```

#### 2. Event Processing Failures

**Symptoms**: Goal progress not updating after tips

**Diagnosis**:
```sql
-- Check for tips without snapshots
SELECT t.id, t.goalId, t.amount, t.createdAt
FROM tips t
LEFT JOIN goal_progress_snapshots s ON s.triggerTipId = t.id
WHERE t.goalId IS NOT NULL AND s.id IS NULL
ORDER BY t.createdAt DESC;
```

**Resolution**:
```typescript
// Process missed tips
const missedTips = await findTipsWithoutSnapshots();
for (const tip of missedTips) {
  await goalProgressService.handleTipVerified({ tip });
}
```

#### 3. Supporter Summary Inconsistencies

**Symptoms**: Incorrect supporter counts, missing contributors

**Diagnosis**:
```sql
-- Check supporter summary vs tip consistency
SELECT 
  g.id as goal_id,
  COUNT(DISTINCT CASE WHEN t.fromUser IS NOT NULL THEN t.fromUser END) as unique_supporters,
  COUNT(sas.id) as summary_count
FROM tip_goals g
LEFT JOIN tips t ON t.goalId = g.id AND t.verified = true
LEFT JOIN supporter_activity_summaries sas ON sas.goalId = g.id
WHERE g.id = 'goal-uuid'
GROUP BY g.id;
```

**Resolution**:
```typescript
// Recalculate supporter summaries
const goalId = 'problematic-goal-id';
const tips = await findVerifiedTipsForGoal(goalId);
await recalculateSupporterSummaries(goalId, tips);
```

#### 4. Database Performance Issues

**Symptoms**: Slow snapshot creation, timeout errors

**Diagnosis**:
```sql
-- Check table sizes and indexes
SELECT 
  schemaname,
  tablename,
  attname,
  n_distinct,
  correlation
FROM pg_stats 
WHERE tablename IN ('goal_progress_snapshots', 'supporter_activity_summaries');

-- Check query performance
EXPLAIN ANALYZE 
SELECT * FROM goal_progress_snapshots 
WHERE goalId = 'goal-uuid' 
ORDER BY createdAt DESC 
LIMIT 100;
```

**Resolution**:
```sql
-- Optimize indexes if needed
CREATE INDEX CONCURRENTLY idx_goal_progress_snapshots_goal_created 
ON goal_progress_snapshots (goalId, createdAt DESC);

CREATE INDEX CONCURRENTLY idx_supporter_summaries_goal_amount 
ON supporter_activity_summaries (goalId, totalAmount DESC);
```

### Emergency Procedures

#### Scheduler Recovery

```typescript
// Emergency: Restart daily snapshots
async emergencyDailySnapshot() {
  const activeGoals = await this.getActiveGoals();
  const results = [];
  
  for (const goal of activeGoals) {
    try {
      await this.goalProgressService.createManualSnapshot(goal.id);
      results.push({ goalId: goal.id, status: 'success' });
    } catch (error) {
      results.push({ goalId: goal.id, status: 'failed', error: error.message });
    }
  }
  
  return results;
}
```

#### Data Recovery

```typescript
// Emergency: Rebuild goal progress from tips
async rebuildGoalProgress(goalId: string) {
  const tips = await this.tipsService.findVerifiedTipsForGoal(goalId);
  
  // Clear existing data
  await this.clearGoalProgressData(goalId);
  
  // Rebuild chronologically
  for (const tip of tips.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    await this.goalProgressService.handleTipVerified({ tip });
  }
}
```

## Maintenance Procedures

### Weekly Maintenance

**Schedule**: Every Monday at 10:00 AM UTC  
**Duration**: 15-30 minutes

#### Tasks

1. **Review Scheduler Logs**
   ```bash
   # Check last week's performance
   grep -E "(Completed daily|Snapshot pruning)" /logs/application.log | \
     grep "$(date -d '7 days ago' +%Y-%m-%d)"
   ```

2. **Validate Data Integrity**
   ```sql
   -- Check for orphaned snapshots
   SELECT s.id, s.goalId 
   FROM goal_progress_snapshots s
   LEFT JOIN tip_goals g ON g.id = s.goalId
   WHERE g.id IS NULL;
   ```

3. **Monitor Database Growth**
   ```sql
   -- Check table sizes
   SELECT 
     schemaname,
     tablename,
     pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
   FROM pg_tables 
   WHERE tablename LIKE '%goal_progress%'
   ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
   ```

### Monthly Maintenance

**Schedule**: First of each month  
**Duration**: 1-2 hours

#### Tasks

1. **Performance Analysis**
   - Review query performance trends
   - Analyze snapshot creation times
   - Check database index effectiveness

2. **Capacity Planning**
   - Project storage growth
   - Estimate cleanup frequency needs
   - Plan for scaling requirements

3. **Archive Strategy Review**
   - Evaluate retention policy effectiveness
   - Consider archival for old data
   - Review compliance requirements

## Configuration Management

### Environment Variables

```env
# Goal Progress Configuration
GOAL_PROGRESS_RETENTION_DAYS=90
GOAL_PROGRESS_BATCH_SIZE=1000
GOAL_PROGRESS_DAILY_SNAPSHOT_HOUR=2
GOAL_PROGRESS_CLEANUP_DAY=0  # Sunday (0-6)
GOAL_PROGRESS_CLEANUP_HOUR=3

# Performance Tuning
GOAL_PROGRESS_QUERY_TIMEOUT=30000
GOAL_PROGRESS_TRANSACTION_TIMEOUT=10000
```

### Database Configuration

```sql
-- Recommended PostgreSQL settings for goal progress
-- shared_buffers: 25% of RAM
-- work_mem: 4MB per connection
-- maintenance_work_mem: 512MB
-- effective_cache_size: 75% of RAM
-- random_page_cost: 1.1 (SSD) or 1.25 (HDD)
```

## Scaling Considerations

### Horizontal Scaling

- **Read Replicas**: Route read queries to replicas
- **Partitioning**: Consider time-based partitioning for snapshots
- **Caching**: Cache frequently accessed progress data

### Performance Optimization

```typescript
// Batch processing for large operations
async processBatchSnapshots(goalIds: string[], batchSize = 50) {
  for (let i = 0; i < goalIds.length; i += batchSize) {
    const batch = goalIds.slice(i, i + batchSize);
    await Promise.all(
      batch.map(goalId => this.createManualSnapshot(goalId))
    );
    // Add delay to prevent database overload
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
```

### Storage Optimization

```sql
-- Compress old snapshot data
ALTER TABLE goal_progress_snapshots 
ALTER COLUMN topSupporters SET STORAGE EXTERNAL;

-- Consider table partitioning for large datasets
CREATE TABLE goal_progress_snapshots_y2024m01 PARTITION OF goal_progress_snapshots
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

## Security and Compliance

### Data Access Controls

- **Read Access**: Goal owners, platform admins
- **Write Access**: Goal owners, system processes
- **Delete Access**: System cleanup only

### Audit Requirements

- **Change Tracking**: All manual operations logged
- **Data Retention**: Comply with data retention policies
- **Privacy**: Respect user privacy settings

### Backup Considerations

```bash
# Include goal progress tables in backups
pg_dump --table=goal_progress_snapshots \
        --table=supporter_activity_summaries \
        --table=tip_goals \
        > goal_progress_backup.sql
```

## Contact Information

### Primary Contacts

- **Development Team**: dev-team@tiptune.com
- **Operations Team**: ops-team@tiptune.com
- **Database Team**: dba-team@tiptune.com

### Escalation Path

1. **Level 1**: Automated monitoring alerts
2. **Level 2**: Operations team investigation
3. **Level 3**: Development team intervention
4. **Level 4**: Database team emergency procedures

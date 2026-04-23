# Goal Progress Snapshotting and Supporter Activity Summaries

This feature adds comprehensive progress tracking and supporter analytics for tip goals, enabling rich historical data and storytelling capabilities.

## Overview

The goal progress system provides:
- **Progress Snapshots**: Historical records of goal progress over time
- **Supporter Activity Summaries**: Aggregated supporter contribution data
- **Event-Driven Updates**: Automatic progress tracking when tips are verified
- **Scheduled Snapshots**: Daily snapshots for active goals
- **Efficient Query APIs**: Fast access to progress history without recomputation

## Architecture

### Entities

#### GoalProgressSnapshot
Stores historical snapshots of goal progress at specific points in time.

```typescript
{
  id: string;
  goalId: string;
  currentAmount: number;
  previousAmount: number;
  amountDelta: number;
  totalSupporters: number;
  newSupporters: number;
  topSupporters: Array<{userId, amount, contributionCount}>;
  snapshotTrigger: 'tip_verified' | 'manual' | 'scheduled';
  triggerTipId?: string;
  createdAt: Date;
}
```

#### SupporterActivitySummary
Aggregates supporter contribution data for efficient querying.

```typescript
{
  id: string;
  goalId: string;
  userId: string;
  totalAmount: number;
  contributionCount: number;
  averageContribution: number;
  firstContributionAt?: Date;
  lastContributionAt?: Date;
  contributionHistory: Array<{amount, timestamp, tipId}>;
  rewardTier?: string;
  isAnonymous: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### Services

#### GoalProgressService
- Handles event-driven progress updates
- Manages snapshot creation
- Provides query APIs for progress data
- Updates supporter activity summaries

#### GoalProgressScheduler
- Creates daily snapshots for active goals
- Cleans up old snapshots (placeholder implementation)

## API Endpoints

### Get Goal Progress Statistics
```
GET /goals/:id/progress
```
Returns comprehensive progress statistics including total progress, supporter counts, progress rate, and historical snapshots.

### Get Progress History
```
GET /goals/:id/progress-history
```
Returns all progress snapshots for a goal, ordered by creation date.

### Get Supporter Activity
```
GET /goals/:id/supporters
```
Returns supporter activity summaries with contribution details.

### Create Manual Snapshot
```
POST /goals/:id/snapshot
```
Creates a manual progress snapshot (admin/artist only).

## Event Integration

The system integrates with the existing tip verification flow:

1. **Tip Verified Event**: When a tip is verified, `GoalProgressService.handleTipVerified()` is triggered
2. **Goal Update**: Goal progress is updated atomically
3. **Supporter Summary**: Supporter activity is updated or created
4. **Snapshot Creation**: A progress snapshot is created with current state

## Database Schema

### goal_progress_snapshots
- Stores historical progress data
- Indexed by (goalId, createdAt) and goalId
- Foreign key to tip_goals

### supporter_activity_summaries
- Stores aggregated supporter data
- Unique constraint on (goalId, userId)
- Indexed for efficient queries
- Foreign keys to tip_goals and users

## Usage Examples

### Query Progress History
```typescript
const progressStats = await goalProgressService.getGoalProgressStats(goalId);
// Returns: { totalProgress, totalSupporters, progressRate, snapshots[], topSupporters[] }
```

### Get Supporter Rankings
```typescript
const supporters = await goalProgressService.getSupporterActivitySummaries(goalId);
// Returns sorted list of supporter summaries
```

### Manual Snapshot Creation
```typescript
await goalProgressService.createManualSnapshot(goalId);
// Creates snapshot with current goal state
```

## Benefits

### For Artists
- **Rich Storytelling**: Show supporter journey and goal progress over time
- **Engagement Analytics**: Understand supporter behavior and contribution patterns
- **Progress Visualization**: Display progress charts and milestones

### For Supporters
- **Activity History**: See their contribution journey
- **Reward Tracking**: Track earned rewards and tiers
- **Community Building**: See how their support impacts the goal

### For Platform
- **Performance**: Efficient queries without expensive aggregations
- **Scalability**: Snapshot-based history scales better than real-time computation
- **Analytics**: Rich data for platform analytics and insights

## Future Enhancements

- **Real-time Progress**: WebSocket updates for live progress tracking
- **Advanced Analytics**: Trend analysis and prediction models
- **Reward Automation**: Automatic reward distribution based on progress
- **Social Features**: Progress sharing and supporter spotlights
- **Export Capabilities**: CSV/PDF exports of progress reports

## Testing

The feature includes comprehensive tests covering:
- Event-driven progress updates
- Snapshot creation and querying
- Supporter summary aggregation
- Edge cases (anonymous tips, goal completion)
- API endpoint validation

Run tests with:
```bash
npm test -- goals/goal-progress.service.spec.ts
```
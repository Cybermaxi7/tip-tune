# Payout Reconciliation Operator Playbook

## Overview

This playbook provides practical guidance for finance/ops engineers to safely execute payout reconciliation, investigate discrepancies, and determine when repair operations are safe.

## Quick Reference

| Operation | Command | Risk Level | Approval Required |
|-----------|---------|-----------|-------------------|
| **Detection Only** | `POST /admin/reconcile/payouts` | Low | None |
| **Single Artist Detection** | `POST /admin/reconcile/payouts/:artistId` | Low | None |
| **Single Artist Repair** | `POST /admin/reconcile/payouts/:artistId/repair` | High | Finance Lead |
| **Batch Repair** | Manual script execution | Critical | Finance Lead + Engineering |

## Common Discrepancy Classes

### 1. Balance Mismatch (Most Common)

**Symptoms**:
- `expectedAvailable` ≠ `actualAvailable`
- Usually caused by missed tip credits or failed payout processing

**Root Causes**:
- Tip verification event missed during balance update
- Payout completion failed but balance wasn't restored
- Database transaction rollback during high load
- Race condition in concurrent tip processing

**Safety Assessment**:
✅ **Safe to Repair** if:
- No pending payouts for the artist
- Discrepancy is small (< 10% of total balance)
- Recent tips match discrepancy amount

❌ **Unsafe to Repair** if:
- Active pending payouts exist
- Large discrepancy (> 50% of balance)
- Multiple asset codes affected simultaneously

### 2. Pending Balance Mismatch

**Symptoms**:
- `expectedPending` ≠ `actualPending`
- Usually caused by failed payout releasing pending reserve

**Root Causes**:
- Payout failed but pending funds weren't released
- Payout status update failed after blockchain confirmation
- Manual database updates without audit trail

**Safety Assessment**:
✅ **Safe to Repair** if:
- No payouts in 'processing' status
- Pending balance is higher than expected (over-reserved)
- Affected payouts are > 24 hours old

❌ **Unsafe to Repair** if:
- Payouts in 'processing' status
- Pending balance is lower than expected (under-reserved)
- Recent payouts (< 1 hour old)

### 3. Cross-Asset Inconsistency

**Symptoms**:
- Both XLM and USDC have discrepancies
- May indicate systemic issues

**Root Causes**:
- Database migration issues
- Multi-asset payout processing failures
- System-wide transaction problems

**Safety Assessment**:
❌ **Never Auto-Repair** - Always requires manual investigation
- Requires engineering review
- May need database restore from backup

## Investigation Procedures

### Step 1: Initial Assessment

```bash
# Run detection for all artists
curl -X POST http://localhost:3001/admin/reconcile/payouts \
  -H "Authorization: Bearer <admin-token>" \
  | jq '.discrepancies | group_by(.artistId) | map({artistId: .[0].artistId, count: length}) | sort_by(.count) | reverse'

# Get high-level summary
curl -X POST http://localhost:3001/admin/reconcile/payouts \
  -H "Authorization: Bearer <admin-token>" \
  | jq '.discrepancies | group_by(.assetCode) | map({asset: .[0].assetCode, count: length})'
```

### Step 2: Individual Artist Analysis

```bash
# Get detailed discrepancy for specific artist
curl -X POST http://localhost:3001/admin/reconcile/payouts/artist-uuid \
  -H "Authorization: Bearer <admin-token>" \
  | jq '.discrepancies[]'

# Check artist's recent activity
curl -X GET "http://localhost:3001/api/artists/artist-uuid/tips?limit=10" \
  -H "Authorization: Bearer <admin-token>"

# Check payout status
curl -X GET "http://localhost:3001/api/artists/artist-uuid/payouts" \
  -H "Authorization: Bearer <admin-token>"
```

### Step 3: Root Cause Analysis

#### Query Examples

```sql
-- Check for tips without balance credits
SELECT t.id, t.amount, t.assetCode, t.createdAt, aba.id as audit_id
FROM tips t
LEFT JOIN artist_balance_audits aba ON aba.tipId = t.id
WHERE t.artistId = 'artist-uuid' 
  AND t.status = 'VERIFIED'
  AND aba.id IS NULL
ORDER BY t.createdAt DESC;

-- Check for stuck pending payouts
SELECT pr.id, pr.amount, pr.assetCode, pr.status, pr.createdAt, aba.id as audit_id
FROM payout_requests pr
LEFT JOIN artist_balance_audits aba ON aba.payoutRequestId = pr.id
WHERE pr.artistId = 'artist-uuid'
  AND pr.status IN ('PENDING', 'PROCESSING')
  AND aba.eventType != 'PAYOUT_COMPLETED'
ORDER BY pr.createdAt DESC;

-- Check balance audit trail for anomalies
SELECT * FROM artist_balance_audits
WHERE artistId = 'artist-uuid'
  AND createdAt >= NOW() - INTERVAL '7 days'
ORDER BY createdAt DESC
LIMIT 50;
```

### Step 4: Safety Verification

#### Pre-Repair Checklist

```typescript
// Verify no active processing payouts
const activePayouts = await payoutRepo.find({
  where: { 
    artistId, 
    status: In(['PENDING', 'PROCESSING']) 
  }
});

// Verify discrepancy magnitude
const discrepancy = await reconciliationService.reconcileArtist(artistId, false);
const totalBalance = await getArtistTotalBalance(artistId);
const discrepancyPercentage = Math.abs(discrepancy.expectedAvailable - discrepancy.actualAvailable) / totalBalance;

// Verify recent tip activity
const recentTips = await tipRepo.find({
  where: { 
    artistId, 
    status: 'VERIFIED',
    createdAt: MoreThan(new Date(Date.now() - 24 * 60 * 60 * 1000))
  }
});
```

## Repair Decision Matrix

### Green Light (Safe to Repair)

| Condition | Threshold | Action |
|-----------|-----------|--------|
| **No Active Payouts** | 0 pending/processing | ✅ Proceed |
| **Discrepancy Size** | < 10% of total balance | ✅ Proceed |
| **Time Since Last Activity** | > 2 hours | ✅ Proceed |
| **Single Asset Affected** | Only XLM or only USDC | ✅ Proceed |
| **Recent Tips Match** | Tips sum = discrepancy | ✅ Proceed |

### Yellow Light (Proceed with Caution)

| Condition | Threshold | Action |
|-----------|-----------|--------|
| **Discrepancy Size** | 10-50% of total balance | ⚠️ Finance Lead approval |
| **Recent Activity** | < 2 hours ago | ⚠️ Wait for completion |
| **Multiple Small Issues** | 2-3 minor discrepancies | ⚠️ Batch review |
| **Failed Payouts** | Recent failures found | ⚠️ Investigate root cause |

### Red Light (Do Not Repair)

| Condition | Threshold | Action |
|-----------|-----------|--------|
| **Active Payouts** | Any pending/processing | ❌ Wait for completion |
| **Large Discrepancy** | > 50% of total balance | ❌ Engineering review |
| **Multiple Assets** | Both XLM and USDC affected | ❌ System investigation |
| **System Issues** | Database errors, timeouts | ❌ Engineering intervention |
| **Unknown Root Cause** | Cannot identify cause | ❌ Manual investigation |

## Repair Execution

### Single Artist Repair

```bash
# Execute repair (after safety verification)
curl -X POST http://localhost:3001/admin/reconcile/payouts/artist-uuid/repair \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  | jq '.discrepancies[] | {assetCode, repaired, issue}'
```

### Batch Repair (Advanced)

```typescript
// Only for experienced operators with approval
async batchRepair(artistIds: string[]) {
  const results = [];
  
  for (const artistId of artistIds) {
    try {
      // Pre-repair verification
      const discrepancies = await reconciliationService.reconcileArtist(artistId, false);
      if (!isSafeToRepair(discrepancies, artistId)) {
        results.push({ artistId, status: 'skipped', reason: 'unsafe' });
        continue;
      }
      
      // Execute repair
      const repaired = await reconciliationService.reconcileArtist(artistId, true);
      results.push({ artistId, status: 'repaired', discrepancies: repaired.length });
      
      // Add delay to prevent database overload
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      results.push({ artistId, status: 'failed', error: error.message });
    }
  }
  
  return results;
}
```

## Post-Repair Verification

### Immediate Verification

```bash
# Re-run detection to confirm fix
curl -X POST http://localhost:3001/admin/reconcile/payouts/artist-uuid \
  -H "Authorization: Bearer <admin-token>" \
  | jq '.discrepancies | length'

# Check audit trail for repair entry
curl -X GET "http://localhost:3001/api/artists/artist-uuid/balance-audit?limit=5" \
  -H "Authorization: Bearer <admin-token>" \
  | jq '.[] | select(.eventType == "BALANCE_REPAIR")'
```

### 24-Hour Follow-up

```bash
# Monitor for new discrepancies
curl -X POST http://localhost:3001/admin/reconcile/payouts/artist-uuid \
  -H "Authorization: Bearer <admin-token>" \
  | jq '.discrepancies | length'

# Check if artist can create new payouts
curl -X POST http://localhost:3001/api/artists/artist-uuid/payouts \
  -H "Authorization: Bearer <artist-token>" \
  -H "Content-Type: application/json" \
  -d '{"amount": 1, "assetCode": "XLM", "address": "G..."}'
```

## Emergency Procedures

### System-Wide Discrepancies

**Symptoms**: > 100 artists with discrepancies, multiple asset codes affected

**Immediate Actions**:
1. **Stop All Repairs**: Do not execute any repair operations
2. **Notify Engineering**: Escalate to development team
3. **Check Recent Deployments**: Correlate with recent code changes
4. **Database Health Check**: Verify database integrity
5. **Preserve Evidence**: Export discrepancy data for analysis

```bash
# Export discrepancy data for analysis
curl -X POST http://localhost:3001/admin/reconcile/payouts \
  -H "Authorization: Bearer <admin-token>" \
  | jq '.discrepancies' > discrepancies-$(date +%Y%m%d-%H%M%S).json
```

### Critical Balance Issues

**Symptoms**: Artist balance is negative or zero when should have funds

**Emergency Response**:
1. **Disable Payouts**: Prevent new payout requests
2. **Manual Balance Verification**: Use database queries to verify actual state
3. **Restore from Backup**: If recent backup available
4. **Manual Correction**: Last resort, requires multiple approvals

```sql
-- Emergency balance verification
SELECT 
  artistId,
  xlmBalance,
  usdcBalance,
  pendingXlm,
  pendingUsdc,
  lastUpdated
FROM artist_balances 
WHERE artistId = 'problematic-artist-id';

-- Check for corrupted data
SELECT COUNT(*) as total_artists,
       COUNT(CASE WHEN xlmBalance < 0 THEN 1 END) as negative_xlm,
       COUNT(CASE WHEN usdcBalance < 0 THEN 1 END) as negative_usdc
FROM artist_balances;
```

## Monitoring and Alerting

### Daily Health Checks

```bash
#!/bin/bash
# Daily reconciliation health check script

# Run full reconciliation
RESULT=$(curl -s -X POST http://localhost:3001/admin/reconcile/payouts \
  -H "Authorization: Bearer $ADMIN_TOKEN")

# Extract metrics
TOTAL_DISCREPANCIES=$(echo $RESULT | jq '.discrepancies | length')
AFFECTED_ARTISTS=$(echo $RESULT | jq '.discrepancies | map(.artistId) | unique | length')
XLM_ISSUES=$(echo $RESULT | jq '.discrepancies | map(select(.assetCode == "XLM")) | length')
USDC_ISSUES=$(echo $RESULT | jq '.discrepancies | map(select(.assetCode == "USDC")) | length')

# Alert thresholds
if [ $TOTAL_DISCREPANCIES -gt 10 ]; then
  echo "ALERT: High discrepancy count: $TOTAL_DISCREPANCIES"
fi

if [ $AFFECTED_ARTISTS -gt 5 ]; then
  echo "ALERT: Many artists affected: $AFFECTED_ARTISTS"
fi

echo "Daily Reconciliation Report:"
echo "- Total discrepancies: $TOTAL_DISCREPANCIES"
echo "- Affected artists: $AFFECTED_ARTISTS"
echo "- XLM issues: $XLM_ISSUES"
echo "- USDC issues: $USDC_ISSUES"
```

### Alert Configuration

| Metric | Warning Threshold | Critical Threshold | Action |
|--------|-------------------|-------------------|--------|
| **Total Discrepancies** | > 10 | > 50 | Notify finance team |
| **Affected Artists** | > 5 | > 20 | Escalate to engineering |
| **Single Artist Discrepancy** | > 100 XLM/USDC | > 1000 XLM/USDC | Manual review |
| **Repair Failures** | Any failure | Multiple failures | Engineering alert |
| **Processing Time** | > 30 seconds | > 2 minutes | Performance investigation |

## Troubleshooting Guide

### Common Error Scenarios

#### 1. "Database Timeout During Repair"

**Causes**: Large dataset, missing indexes, high load

**Solutions**:
```sql
-- Check query performance
EXPLAIN ANALYZE SELECT * FROM artist_balances WHERE artistId = 'uuid';

-- Add missing indexes if needed
CREATE INDEX CONCURRENTLY idx_artist_balances_artist_id 
ON artist_balances(artistId);

-- Process in smaller batches
```

#### 2. "Repair Created New Discrepancies"

**Causes**: Race conditions, concurrent payouts during repair

**Solutions**:
- Wait for all active payouts to complete
- Use database transactions for repair
- Implement retry logic with exponential backoff

#### 3. "Audit Trail Missing"

**Causes**: Audit logging disabled, database issues

**Solutions**:
```sql
-- Check audit table exists and has data
SELECT COUNT(*) FROM artist_balance_audits WHERE createdAt > NOW() - INTERVAL '1 day';

-- Verify audit triggers are active
SELECT event_manipulation, event_object_table 
FROM information_schema.triggers 
WHERE trigger_name LIKE '%balance_audit%';
```

### Performance Optimization

#### Database Indexes

```sql
-- Critical indexes for reconciliation performance
CREATE INDEX CONCURRENTLY idx_tips_artist_verified 
ON tips(artistId, status, createdAt);

CREATE INDEX CONCURRENTLY idx_payouts_artist_status 
ON payout_requests(artistId, status, createdAt);

CREATE INDEX CONCURRENTLY idx_audit_artist_created 
ON artist_balance_audits(artistId, createdAt DESC);
```

#### Query Optimization

```typescript
// Use efficient queries for large datasets
const optimizedReconciliation = async (artistIds: string[]) => {
  // Batch query instead of individual queries
  const balances = await balanceRepo.findBy({ artistId: In(artistIds) });
  
  // Use raw SQL for complex aggregations
  const tipTotals = await tipRepo
    .createQueryBuilder('tip')
    .select('tip.artistId')
    .addSelect('SUM(CASE WHEN tip.assetCode = "XLM" THEN tip.amount ELSE 0 END)', 'totalXLM')
    .addSelect('SUM(CASE WHEN tip.assetCode = "USDC" THEN tip.amount ELSE 0 END)', 'totalUSDC')
    .where('tip.artistId IN (:...artistIds)', { artistIds })
    .andWhere('tip.status = :status', { status: TipStatus.VERIFIED })
    .groupBy('tip.artistId')
    .getRawMany();
};
```

## Compliance and Audit

### Regulatory Requirements

- **Financial Records**: All balance changes must be auditable
- **Data Retention**: Audit logs retained for minimum 7 years
- **Access Controls**: Repair operations require multi-person approval
- **Documentation**: All repair decisions must be documented

### Audit Trail Requirements

```typescript
// Every repair must create audit entry
await auditRepo.create({
  artistId,
  eventType: 'BALANCE_REPAIR',
  amount: repairAmount,
  balanceBefore: oldBalance,
  balanceAfter: newBalance,
  pendingBefore: oldPending,
  pendingAfter: newPending,
  reason: discrepancy.issue,
  repairedBy: adminUserId,
  approvedBy: financeLeadId,
  createdAt: new Date(),
});
```

### Reporting Templates

#### Monthly Reconciliation Report

```markdown
# Monthly Payout Reconciliation Report

## Executive Summary
- Total artists reconciled: X
- Discrepancies found: Y
- Discrepancies repaired: Z
- Total amount repaired: $X,XXX

## Discrepancy Breakdown
| Asset Code | Count | Total Amount | Average Amount |
|------------|-------|--------------|----------------|
| XLM | XX | $XXX | $XX |
| USDC | XX | $XXX | $XX |

## Root Cause Analysis
- Missed tip credits: XX%
- Failed payout releases: XX%
- System issues: XX%
- Unknown: XX%

## Recommendations
- [ ] Implement automated tip verification retry
- [ ] Add payout failure monitoring
- [ ] Improve database performance
```

## Training and Onboarding

### New Operator Checklist

- [ ] Complete reconciliation system training
- [ ] Review all discrepancy scenarios
- [ ] Practice repair in staging environment
- [ ] Understand approval workflows
- [ ] Know emergency contact procedures

### Certification Requirements

**Level 1 (Basic)**:
- Can run detection operations
- Understands discrepancy types
- Knows when to escalate

**Level 2 (Advanced)**:
- Can safely perform single-artist repairs
- Understands root cause analysis
- Can troubleshoot common issues

**Level 3 (Expert)**:
- Can handle system-wide issues
- Can perform batch repairs
- Can improve system performance

## Contact Information

### Primary Contacts

- **Finance Team Lead**: finance-lead@tiptune.com
- **Engineering Team**: engineering@tiptune.com
- **Database Team**: dba@tiptune.com
- **Compliance Officer**: compliance@tiptune.com

### Escalation Matrix

| Severity | Response Time | Escalation Path |
|----------|---------------|-----------------|
| **Low** (1-5 discrepancies) | 4 hours | Finance Team |
| **Medium** (6-50 discrepancies) | 2 hours | Finance Lead + Engineering |
| **High** (50+ discrepancies) | 1 hour | Finance Lead + Engineering + Management |
| **Critical** (System-wide) | 15 minutes | All teams on-call |

## Appendix

### API Reference

```typescript
// Detection endpoints
POST /admin/reconcile/payouts                    // All artists
POST /admin/reconcile/payouts/:artistId          // Single artist

// Repair endpoint
POST /admin/reconcile/payouts/:artistId/repair    // Single artist repair

// Response format
interface ReconciliationResponse {
  count: number;
  discrepancies: PayoutReconciliationResult[];
}

interface PayoutReconciliationResult {
  artistId: string;
  assetCode: 'XLM' | 'USDC';
  expectedAvailable: number;
  actualAvailable: number;
  expectedPending: number;
  actualPending: number;
  issue?: string;
  repaired: boolean;
}
```

### SQL Reference

```sql
-- Common reconciliation queries

-- Artist balance verification
SELECT 
  ab.artistId,
  ab.xlmBalance,
  ab.usdcBalance,
  ab.pendingXlm,
  ab.pendingUsdc,
  COALESCE(tip_totals.totalXLM, 0) as totalTipXLM,
  COALESCE(tip_totals.totalUSDC, 0) as totalTipUSDC,
  COALESCE(payout_totals.pendingXLM, 0) as pendingPayoutXLM,
  COALESCE(payout_totals.pendingUSDC, 0) as pendingPayoutUSDC,
  COALESCE(payout_totals.completedXLM, 0) as completedPayoutXLM,
  COALESCE(payout_totals.completedUSDC, 0) as completedPayoutUSDC
FROM artist_balances ab
LEFT JOIN (
  SELECT 
    artistId,
    SUM(CASE WHEN assetCode = 'XLM' THEN amount ELSE 0 END) as totalXLM,
    SUM(CASE WHEN assetCode = 'USDC' THEN amount ELSE 0 END) as totalUSDC
  FROM tips 
  WHERE status = 'VERIFIED'
  GROUP BY artistId
) tip_totals ON ab.artistId = tip_totals.artistId
LEFT JOIN (
  SELECT 
    artistId,
    SUM(CASE WHEN assetCode = 'XLM' AND status IN ('PENDING','PROCESSING') THEN amount ELSE 0 END) as pendingXLM,
    SUM(CASE WHEN assetCode = 'USDC' AND status IN ('PENDING','PROCESSING') THEN amount ELSE 0 END) as pendingUSDC,
    SUM(CASE WHEN assetCode = 'XLM' AND status = 'COMPLETED' THEN amount ELSE 0 END) as completedXLM,
    SUM(CASE WHEN assetCode = 'USDC' AND status = 'COMPLETED' THEN amount ELSE 0 END) as completedUSDC
  FROM payout_requests
  GROUP BY artistId
) payout_totals ON ab.artistId = payout_totals.artistId
WHERE ab.artistId = 'specific-artist-id';
```

This playbook provides comprehensive guidance for safe and effective payout reconciliation operations. Always prioritize safety and verification over speed when dealing with financial systems.

# Stats Page Setup Guide

## Quick Start

This guide walks through setting up the new Stats page feature for your MPG Platform.

## Prerequisites

- Access to Supabase database
- Admin/Manager user role
- CSV data file with agent statistics

## Step 1: Database Migration

### Run the SQL Migration

Execute this in your Supabase SQL editor or run the migration file:

```bash
# File: sql_migrations/03_create_stats_table.sql
```

The migration creates:
- `stats` table with all required columns
- Indexes on name, supervisor, and created_at for performance
- Row Level Security policies
- Default constraints

### Verify Migration Success

```sql
SELECT * FROM information_schema.tables 
WHERE table_name = 'stats';
```

## Step 2: Configure User Roles

### Check Current Roles

```sql
SELECT email, name, role FROM public.users ORDER BY email;
```

### Set Role Permissions

Update roles for team leaders and supervisors:

```sql
-- Set team leaders
UPDATE public.users 
SET role = 'Team Leader' 
WHERE email IN (
  'charlene.esparza@company.com',
  'geoffrey.figueroa@company.com',
  'jeulia.king@company.com',
  'karla.bacong@company.com',
  'khen.camua@company.com'
);

-- Set agents (default should already be 'Agent')
UPDATE public.users 
SET role = 'Agent' 
WHERE role IS NULL;
```

### Expected Roles

- **Admin**: Full access to all features
- **Team Leader/Supervisor**: Can view all team members' stats
- **Agent**: Can only view their own stats
- **Manager**: Can import data and manage stats

## Step 3: Import Stats Data

### Method 1: Using API (Recommended)

#### Get CSV Content

Prepare your CSV file (e.g., `data.csv`):

```csv
Supervisor,Name,ACW,AHT,Hold,Talk Time,CSAT_Score,DSAT,NPS_Score,Promoter (*),MOD,MOD (*),FCR,FCR (*),Surveys Answered,Calls Touched,Tickets Solved,Transactions,Productive Hours,TPH
Charlene Esparza,John Smith,01:32,08:29,00:09,07:03,100.00%,,88.89,8,,,88.89%,8,11,,,,,
```

#### Create Import Script

Create a file `scripts/import-stats.js`:

```javascript
const fs = require('fs');
const csvContent = fs.readFileSync('./data.csv', 'utf8');

fetch('http://localhost:3000/api/stats/import', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ csvContent }),
  credentials: 'include',
})
  .then(res => res.json())
  .then(data => console.log(data))
  .catch(err => console.error(err));
```

#### Run Import

```bash
node scripts/import-stats.js
```

Or use curl:

```bash
CSV_CONTENT=$(cat data.csv)
curl -X POST http://localhost:3000/api/stats/import \
  -H "Content-Type: application/json" \
  -d "{\"csvContent\": \"$CSV_CONTENT\"}" \
  -b "webex_auth=..." # Your auth cookie
```

### Method 2: Direct Database Insert

```sql
-- Insert stats directly
INSERT INTO public.stats (
  supervisor, name, acw, aht, hold, talk_time, csat_score,
  dsat, nps_score, promoter, mod, mod_value, fcr, fcr_value,
  surveys_answered, calls_touched, tickets_solved, transactions,
  productive_hours, tph, created_at, updated_at
) VALUES (
  'Charlene Esparza', 'John Smith', '01:32', '08:29', '00:09', '07:03', '100.00%',
  NULL, 88.89, 8, NULL, NULL, '88.89%', 8,
  11, NULL, NULL, NULL, NULL, NULL, NOW(), NOW()
);
```

### Verify Import

```sql
SELECT COUNT(*) FROM public.stats;
SELECT DISTINCT supervisor FROM public.stats;
SELECT * FROM public.stats LIMIT 5;
```

## Step 4: Access the Stats Page

### Navigate to Stats

1. Log in to the dashboard
2. Click "Stats" in the left sidebar
3. Or go directly to: `http://localhost:3000/dashboard/stats`

### Role-Based Views

#### Team Leader View
- Can search agents by name
- Can filter by team leader
- Can sort columns (click header)
- See all team members' stats

#### Agent View
- Can only see their own stats
- Same color-coding as team leaders
- Read-only view

## Step 5: Verify Passing Criteria

The page uses these criteria for green "passing" chips:

| Metric | Passing Criteria | Example |
|--------|-----------------|---------|
| ACW | ≤ 2:00 | Shows green if ≤ 120 seconds |
| AHT | ≤ 9:00 | Shows green if ≤ 540 seconds |
| Hold | ≤ 2:00 | Shows green if ≤ 120 seconds |
| Talk Time | ≤ 9:00 | Shows green if ≤ 540 seconds |
| CSAT | ≥ 87% | Shows green if ≥ 87 percentage |
| NPS | ≥ 50 | Shows green if ≥ 50 score |
| MOD | ≥ 30% | Shows green if ≥ 30 percentage |
| FCR | ≥ 80% | Shows green if ≥ 80 percentage |
| TPH | ≥ 6 | Shows green if ≥ 6 calls/hour |

## Step 6: Update Stats Regularly

### Schedule Regular Updates

Create a cron job to update stats periodically:

```bash
# In your deployment environment
# Update stats daily
0 2 * * * node scripts/fetch-and-import-stats.js
```

### Manual Update

To clear old stats and import new ones:

```bash
# Clear existing stats (be careful!)
DELETE FROM public.stats WHERE created_at < NOW() - INTERVAL '30 days';

# Then re-import with new data
node scripts/import-stats.js
```

## Troubleshooting

### Stats Not Showing

**Problem**: Stats page shows "No stats available"

**Solutions**:
1. Verify migration ran successfully:
   ```sql
   SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_name = 'stats';
   ```

2. Check if data was imported:
   ```sql
   SELECT COUNT(*) FROM public.stats;
   ```

3. Verify user name matches database:
   ```sql
   SELECT name FROM public.users WHERE email = 'user@company.com';
   SELECT DISTINCT name FROM public.stats;
   ```

### Search Not Finding Agents

**Problem**: Search returns no results

**Solutions**:
1. Check exact spelling in database
2. Verify agent name exists:
   ```sql
   SELECT DISTINCT name FROM public.stats 
   WHERE name ILIKE '%search_term%';
   ```

### Permission Denied on Import

**Problem**: Import API returns 403 Unauthorized

**Solutions**:
1. Verify user role is 'Admin' or 'Manager':
   ```sql
   SELECT role FROM public.users WHERE email = 'user@company.com';
   ```

2. Update role if needed:
   ```sql
   UPDATE public.users 
   SET role = 'Admin' 
   WHERE email = 'user@company.com';
   ```

### Color-Coding Not Working

**Problem**: Passing scores don't show as green

**Solutions**:
1. Verify data format matches expected:
   - Time: `MM:SS` format
   - Percentage: `XX.XX%` format
   - Numbers: numeric values

2. Check browser console for errors

3. Verify criteria in `lib/statsUtils.ts`:
   ```typescript
   PASSING_CRITERIA.AHT.maxSeconds // Should be 540 (9 minutes)
   ```

### Import Fails with Errors

**Problem**: CSV import returns failure messages

**Solutions**:
1. Check CSV format matches expected columns
2. Look for duplicate entries:
   ```sql
   SELECT name, supervisor, COUNT(*) 
   FROM public.stats 
   GROUP BY name, supervisor 
   HAVING COUNT(*) > 1;
   ```

3. Check for invalid data types:
   ```sql
   SELECT * FROM public.stats WHERE aht NOT LIKE '__:__';
   ```

## Performance Optimization

### Query Performance

The stats table is indexed on:
- `name` - for search queries
- `supervisor` - for filtering by team leader
- `created_at` - for sorting and date range queries

For large datasets (>10,000 records), consider:
- Archiving old stats
- Partitioning by date
- Adding more specific indexes

### Frontend Performance

- Stats page uses pagination for large datasets
- Search is client-side after API fetch
- Sorting is server-side for efficiency

## API Reference

### GET /api/stats

Fetch stats with role-based filtering

**Query Parameters**:
```
?search=john&supervisor=Charlene+Esparza&sortBy=name&sortOrder=asc
```

**Response**:
```json
{
  "stats": [
    {
      "id": "uuid",
      "supervisor": "Charlene Esparza",
      "name": "John Smith",
      "acw": "01:32",
      "aht": "08:29",
      ...
    }
  ],
  "supervisors": ["Charlene Esparza", "Geoffrey Figueroa"],
  "userRole": "Team Leader",
  "userName": "Charlene Esparza"
}
```

### POST /api/stats/import

Import stats from CSV (Admin/Manager only)

**Request Body**:
```json
{
  "csvContent": "Supervisor,Name,...\n..."
}
```

**Response**:
```json
{
  "success": true,
  "imported": 150,
  "failed": 2,
  "message": "Successfully imported 150 records (2 failed)"
}
```

## Security Considerations

### Row Level Security (RLS)

The stats table has RLS policies:
- All authenticated users can read stats
- Only service role can insert/update/delete

### Role-Based Access

- Agents can only see their own stats (enforced server-side)
- Team Leaders see only their team's stats
- Admins see all stats

### Data Protection

- User names are matched against users table for privacy
- No email addresses stored in stats table
- Import is admin-only

## Next Steps

1. ✅ Run database migration
2. ✅ Configure user roles
3. ✅ Import stats data
4. ✅ Test Stats page access
5. ✅ Verify color-coding
6. ⏭️ Set up automated imports (optional)
7. ⏭️ Configure date-based archiving (optional)
8. ⏭️ Add trend analysis/charts (future enhancement)

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review `docs/STATS.md` for detailed documentation
3. Check `lib/statsUtils.ts` for validation logic
4. Inspect browser console for client-side errors
5. Check server logs for API errors

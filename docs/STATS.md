# Stats Page Documentation

## Overview

The Stats page is a role-based performance metrics dashboard that displays agent KPIs with automatic color-coding based on passing criteria.

## Features

### Role-Based Access

1. **Agents**: Can view only their own performance statistics
2. **Team Leaders/Supervisors**: Can view all agents' stats, with filtering and search capabilities
3. **Admin/Manager**: Can view all stats across the organization

### Team Leader Features

- **Search**: Search agents by name with case-insensitive matching
- **Filtering**: Filter by team leader/supervisor
- **Sorting**: Click column headers to sort ascending/descending
- **Color-Coded Results**: Passing scores display with green chip background

### Agent Features

- View personal statistics only
- Stats matched via fuzzy search on database user names
- Same color-coding as team leaders

## Color-Coding System

### Passing Scores (Green Chip)
- **ACW**: ≤ 2:00 (2 minutes)
- **AHT**: ≤ 9:00 (9 minutes)
- **Hold**: ≤ 2:00 (2 minutes)
- **Talk Time**: ≤ 9:00 (9 minutes)
- **CSAT Score**: ≥ 87%
- **NPS Score**: ≥ 50
- **MOD**: ≥ 30%
- **FCR**: ≥ 80%
- **TPH**: ≥ 6

### Not Applicable Fields (Dash)
- DSAT
- Promoter (*)
- MOD (*)
- FCR (*)
- Surveys Answered
- Calls Touched
- Tickets Solved
- Transactions
- Productive Hours

### Not Passing Scores (Normal Text)
Any score that doesn't meet the passing criteria displays as normal text without styling.

## Setup Instructions

### 1. Database Migration

Run the migration to create the stats table:

```sql
-- File: sql_migrations/03_create_stats_table.sql
```

### 2. Update User Roles

Ensure users have appropriate roles in the database:

```sql
UPDATE public.users 
SET role = 'Team Leader' 
WHERE email = 'supervisor@company.com';

UPDATE public.users 
SET role = 'Agent' 
WHERE email = 'agent@company.com';
```

### 3. Import Data from CSV

#### Method 1: Using API Endpoint

```bash
curl -X POST http://localhost:3000/api/stats/import \
  -H "Content-Type: application/json" \
  -d '{
    "csvContent": "Supervisor,Name,ACW,AHT,...\nCharlene Esparza,John Smith,01:32,08:29,..."
  }'
```

#### Method 2: Manual Script

The `lib/statsImport.ts` provides utility functions:

```typescript
import { importStatsFromCSV } from '@/lib/statsImport'

const result = await importStatsFromCSV(csvContent)
console.log(`Imported: ${result.success}, Failed: ${result.failed}`)
```

### 4. Access the Page

Navigate to: `http://localhost:3000/dashboard/stats`

## CSV Format

Expected CSV columns:

```
Supervisor,Name,ACW,AHT,Hold,Talk Time,CSAT_Score,DSAT,NPS_Score,Promoter (*),MOD,MOD (*),FCR,FCR (*),Surveys Answered,Calls Touched,Tickets Solved,Transactions,Productive Hours,TPH
```

Example row:
```
Charlene Esparza,John Smith,01:32,08:29,00:09,07:03,100.00%,,88.89,8,,,88.89%,8,11,,,,,
```

## API Endpoints

### GET /api/stats

Fetch stats with role-based filtering.

**Query Parameters:**
- `search` (string): Search agent name
- `supervisor` (string): Filter by team leader
- `sortBy` (string): Field to sort by (default: "name")
- `sortOrder` (string): "asc" or "desc" (default: "asc")

**Response:**
```json
{
  "stats": [...],
  "supervisors": ["Charlene Esparza", "Geoffrey Figueroa"],
  "userRole": "Team Leader",
  "userName": "John Smith"
}
```

### POST /api/stats/import

Import stats from CSV (Admin/Manager only).

**Request Body:**
```json
{
  "csvContent": "Supervisor,Name,ACW,...\n..."
}
```

**Response:**
```json
{
  "success": true,
  "imported": 150,
  "failed": 2,
  "errors": ["Batch 0: duplicate key value..."],
  "message": "Successfully imported 150 records (2 failed)"
}
```

## Data Types

### TimeValue Format
- Stored as `MM:SS` or `HH:MM:SS`
- Comparison in seconds
- Display in original format

### Percentage Format
- Stored as `XX.XX%` string
- Parsed to number for comparison
- Display with % symbol

### Numeric Fields
- Stored as integers or decimals
- Direct numeric comparison
- Display as-is

## Database Schema

### stats table

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| supervisor | TEXT | Team leader name |
| name | TEXT | Agent name |
| acw | TEXT | Format: MM:SS |
| aht | TEXT | Format: MM:SS |
| hold | TEXT | Format: MM:SS |
| talk_time | TEXT | Format: MM:SS |
| csat_score | TEXT | Format: XX.XX% |
| dsat | TEXT | Optional |
| nps_score | DECIMAL | Numeric value |
| promoter | INTEGER | Count |
| mod | TEXT | Format: XX.XX% |
| mod_value | INTEGER | Count |
| fcr | TEXT | Format: XX.XX% |
| fcr_value | INTEGER | Count |
| surveys_answered | INTEGER | Count |
| calls_touched | INTEGER | Count |
| tickets_solved | INTEGER | Count |
| transactions | INTEGER | Count |
| productive_hours | TEXT | Format: HH:MM:SS |
| tph | DECIMAL | Calls per hour |
| created_at | TIMESTAMP | Record creation |
| updated_at | TIMESTAMP | Last update |

## Utility Functions

### `lib/statsUtils.ts`

- `timeToSeconds()`: Convert MM:SS to seconds
- `parsePercentage()`: Parse percentage strings
- `isScorePassing()`: Check if score meets criteria
- `isNAField()`: Determine if field is N/A
- `formatStatValue()`: Format display values

## Troubleshooting

### Stats Not Showing
1. Verify user role is set in database
2. Check stats table has data: `SELECT COUNT(*) FROM stats;`
3. Verify user name matches stats table names

### Import Fails
1. Check CSV format matches expected columns
2. Verify user has Admin/Manager role
3. Review error messages in API response

### Color-Coding Not Working
1. Verify stat value format (time should be MM:SS, percentage should end with %)
2. Check PASSING_CRITERIA values in statsUtils.ts
3. Inspect browser console for parsing errors

## Performance Notes

- Stats table indexed on: name, supervisor, created_at
- Queries filtered by user role for reduced data transfer
- Sorting done server-side before sending to client
- Large imports processed in 100-record batches

## Future Enhancements

- Export stats to CSV/Excel
- Date range filtering
- Trend analysis and charts
- Historical stat tracking
- Bulk upload UI component
- Performance alerts/notifications

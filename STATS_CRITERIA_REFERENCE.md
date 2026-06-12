# Stats Passing Criteria - Quick Reference

## ✅ PASSING SCORES (Show as GREEN chips)

### Time-Based Metrics (MM:SS format)

| Metric | ✅ Passes If | ❌ Fails If |
|--------|---------|----------|
| **ACW** (After Call Work) | ≤ 2:00 | > 2:00 |
| **AHT** (Avg Handle Time) | ≤ 9:00 | > 9:00 |
| **Hold** (Time on Hold) | ≤ 2:00 | > 2:00 |
| **Talk Time** | ≤ 9:00 | > 9:00 |

**Format examples:**
- `01:32` ✅ Passes (1 minute 32 seconds)
- `02:30` ❌ Fails (2 minutes 30 seconds - over 2:00 limit)

### Percentage-Based Metrics

| Metric | ✅ Passes If | ❌ Fails If |
|--------|---------|----------|
| **CSAT Score** | ≥ 87% | < 87% |
| **MOD** (Mod Rate) | ≥ 30% | < 30% |
| **FCR** (First Call Resolution) | ≥ 80% | < 80% |

**Format examples:**
- `87.50%` ✅ Passes (87.50 ≥ 87)
- `85.00%` ❌ Fails (85 < 87)

### Numeric Metrics

| Metric | ✅ Passes If | ❌ Fails If |
|--------|---------|----------|
| **NPS Score** | ≥ 50 | < 50 |
| **TPH** (Tickets Per Hour) | ≥ 6 | < 6 |

**Format examples:**
- `88.89` ✅ Passes (NPS ≥ 50)
- `7.5` ✅ Passes (TPH ≥ 6)
- `45` ❌ Fails (NPS < 50)
- `4.2` ❌ Fails (TPH < 6)

---

## ➖ NOT APPLICABLE FIELDS (Show as DASH: —)

These fields don't have passing criteria and display as `—`:

| Field | Reason |
|-------|--------|
| **DSAT** | No pass/fail criteria |
| **Promoter (*)** | N/A for scoring |
| **MOD (*)** | Counter only, not percentage |
| **FCR (*)** | Counter only, not percentage |
| **Surveys Answered** | Count metric |
| **Calls Touched** | Count metric |
| **Tickets Solved** | Count metric |
| **Transactions** | Count metric |
| **Productive Hours** | Time tracking only |

---

## 📊 Display Rules

### Green Chip (Passing)
```
Score PASSES criteria
Display: [Green background] Score Value
Example: [92.50%]
```

### Normal Text (Not Passing)
```
Score DOES NOT PASS criteria
Display: Score Value (normal text)
Example: 85.00%
```

### Dash (N/A or No Data)
```
Field is N/A or empty
Display: —
Example: —
```

---

## 🧮 Conversion Reference

### Time Format
- `MM:SS` = Minutes:Seconds
- `01:32` = 1 minute 32 seconds = 92 seconds total
- `09:00` = 9 minutes = 540 seconds total

### Internal Comparison
- Times stored as `MM:SS` string
- Converted to seconds for comparison
- Example: `08:29` converts to 509 seconds for comparison

### Percentage Format
- `87.50%` = 87.5 (percentage value)
- Stripped of `%` symbol for comparison
- Must include `%` symbol in data for proper parsing

---

## 🎯 Common Scenarios

### Scenario 1: Agent with Good ACW
```
ACW: 01:32
✅ Passes because 1:32 ≤ 2:00
Display: [Green chip] 01:32
```

### Scenario 2: Agent with Poor CSAT
```
CSAT_Score: 85.00%
❌ Fails because 85% < 87%
Display: 85.00% (normal text)
```

### Scenario 3: N/A Field
```
DSAT: (empty or any value)
➖ N/A field
Display: —
```

### Scenario 4: Good NPS Score
```
NPS_Score: 88.89
✅ Passes because 88.89 ≥ 50
Display: [Green chip] 88.89
```

---

## 🔍 Validation Rules

### For Time Fields (ACW, AHT, Hold, Talk Time)
- ✅ Valid: `01:32`, `09:00`, `00:15`
- ❌ Invalid: `1:32`, `1:32:00`, `90 seconds`
- ✅ Must be `MM:SS` format exactly

### For Percentage Fields (CSAT, MOD, FCR)
- ✅ Valid: `87.50%`, `100.00%`, `30%`
- ❌ Invalid: `87.5`, `87.50`, `0.875`
- ✅ Must include `%` symbol

### For Numeric Fields (NPS, TPH)
- ✅ Valid: `88.89`, `50`, `6.0`
- ❌ Invalid: `88.89%`, `88.89%`, `six`
- ✅ Must be numeric values

---

## 📋 Data Entry Checklist

When entering or importing stats data:

- [ ] Time fields use `MM:SS` format (e.g., `01:32`)
- [ ] Percentage fields include `%` (e.g., `87.50%`)
- [ ] Numeric fields are just numbers (e.g., `88.89`)
- [ ] N/A fields are left empty or null
- [ ] No extra spaces or characters
- [ ] Supervisor name matches database exactly
- [ ] Agent name matches database exactly

---

## 🔧 Quick Troubleshooting

**"My score should be passing but shows normal text"**
- Check format: Time should be `MM:SS`, Percentage should have `%`
- Verify criteria: ACW ≤ 2:00, CSAT ≥ 87%, etc.

**"Score shows as — instead of value"**
- This is correct if field is N/A (DSAT, Promoter, MOD(*), etc.)
- Or if data is empty/null

**"Color-coding not working"**
- Verify data format matches criteria above
- Check browser console for errors
- Review `lib/statsUtils.ts` for logic

---

## 📞 Reference

**For complete details**: See `docs/STATS.md`
**For setup guide**: See `docs/STATS_SETUP.md`
**For validation code**: See `lib/statsUtils.ts`

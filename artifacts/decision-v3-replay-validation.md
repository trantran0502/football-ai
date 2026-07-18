# Decision V3 Replay Validation

Generated at: 2026-07-18T15:33:21.413Z
Schema: decision-v3-replay-validation-v1

## Verdict

**INSUFFICIENT_DATA**

- Eligible records (3) below minimum threshold of 100.

## Dataset

- Total records: 208
- Eligible records: 3
- Excluded records: 205

### Exclusion Reasons

- EVIDENCE_CAPTURED_AFTER_KICKOFF: 15
- NOT_VERIFIED: 34
- RAW_ODDS_UNPARSEABLE: 156

## Legacy Performance

- Bets: 0
- Passes: 3
- Wins: 0
- Half wins: 0
- Pushes: 0
- Half losses: 0
- Losses: 0
- Hit rate: 0.00%
- ROI: 0.00%
- Net units: 0.0000
- Average odds: 0.0000
- Max drawdown: 0.0000

## Decision V3 Performance

- Bets: 3
- Passes: 0
- Wins: 1
- Half wins: 0
- Pushes: 0
- Half losses: 0
- Losses: 2
- Hit rate: 33.33%
- ROI: -35.00%
- Net units: -1.0500
- Average odds: 1.9500
- Max drawdown: 1.0500

## Agreement

- Direction agreement: 0.00%
- Market agreement: 0.00%
- Confidence agreement: 0.00%
- Candidate changed: 100.00%
- Overall agreement: 0.00%
- Legacy only bet: 0
- Decision only bet: 3
- Both bet: 0
- Both pass: 0

## Head-to-Head

- Both bet, legacy won / decision lost: 0
- Both bet, decision won / legacy lost: 0
- Both won: 0
- Both lost: 0

## Leakage Audit

- Checked: 18
- Passed: 3
- Excluded: 15

### Violations

- EVIDENCE_CAPTURED_AFTER_KICKOFF: 15

## Grouped Decision V3 Metrics

### Market Type

- moneyline: insufficient_sample (n=3)

### League

- Friendlies Clubs: insufficient_sample (n=2)
- Liga Pro: insufficient_sample (n=1)

### Decision Level

- bet: insufficient_sample (n=3)

### Confidence

- high: insufficient_sample (n=3)

### Evidence Completeness

- 1/3: insufficient_sample (n=3)

### Provider Confidence

- unknown: insufficient_sample (n=3)

### Runtime Weight Source

- fallback: insufficient_sample (n=3)

### Data Source

- mock: insufficient_sample (n=1)
- unknown: insufficient_sample (n=2)


## Notes

- Production recommendation output is unchanged.
- This report is replay validation only; it does not activate Decision V3 in Production.
- Mock fixtures are excluded unless explicitly enabled.

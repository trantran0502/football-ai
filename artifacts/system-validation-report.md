# Football AI V1 System Validation Report

- **Overall**: FAIL
- **Started**: 2026-07-17T03:59:16.044Z
- **Completed**: 2026-07-17T03:59:24.906Z
- **Duration**: 8862ms
- **Git Commit**: d71c3923f6f5ae10de768d5db0da7a7e9c516d29
- **Fixtures**: 12

## Summary

- **Build**: PASS (passed 1, failed 0)
- **Unit Tests**: PASS (passed 1, failed 0)
- **Market Engine**: PASS (passed 492, failed 0)
- **Rules**: PASS (passed 71, failed 0)
- **Patterns**: FAIL (passed 611, failed 3)
- **Knowledge Batch**: PASS (passed 44, failed 0)
- **Replay**: PASS (passed 30, failed 0)
- **Persistence**: PASS (passed 14, failed 0)
- **Incremental**: PASS (passed 25, failed 0)
- **Consistency**: PASS (passed 2, failed 0)
- **Verified Pipeline**: PASS (passed 146, failed 0)

## Consistency

- Batch checksum: 2e2c42ed9d24fa5522f6f828ec55b37a2a26b17b1344cb3ade8ff1a38c809b77
- Replay checksum: 2e2c42ed9d24fa5522f6f828ec55b37a2a26b17b1344cb3ade8ff1a38c809b77
- Incremental checksum: 2e2c42ed9d24fa5522f6f828ec55b37a2a26b17b1344cb3ade8ff1a38c809b77

## Patterns Details

- ERROR: HomeLowWaterBalanced matched at least once: pattern never matched across fixtures
- ERROR: BalancedUnderdog matched at least once: pattern never matched across fixtures
- ERROR: LowOverroundBalanced matched at least once: pattern never matched across fixtures
- FAIL `HomeLowWaterBalanced matched at least once`: pattern never matched across fixtures
- FAIL `BalancedUnderdog matched at least once`: pattern never matched across fixtures
- FAIL `LowOverroundBalanced matched at least once`: pattern never matched across fixtures
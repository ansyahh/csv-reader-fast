# csv-reader-fast

A faster csv-reader 1.0.0 for make.fun's "Read broken CSV files faster, 21 November 2026" bounty. A single `solve.js` reads a CSV text once, left to right, with csv-reader 1.0.0's broken-row policy — stray CRs, unterminated quotes, quote junk, short and long rows — and returns exactly its `{columns, rows, errors}` answer, but jumps between delimiters with regex scans and slices fields out in bulk instead of building every field one character at a time. `main.ts` is the harness driver: it reads every case from `/input/cases.json`, answers each with `run`, and writes `/output/answers.json`.

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/ansyahh/csv-reader-fast/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/ansyahh/csv-reader-fast/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

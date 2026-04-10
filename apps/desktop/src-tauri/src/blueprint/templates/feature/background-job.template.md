---
blueprintId: {{blueprintId}}
type: feature
displayName: {{displayName}}
status: draft
priority: medium
owner: human
tags:
  - job
  - background
---

## Goal

Run {{jobName}} as a scheduled or on-demand background job.

## Context

This job processes work asynchronously to avoid blocking request handlers. Must be idempotent and restartable.

## Acceptance Criteria

- [ ] Job runs on the defined schedule
- [ ] Job is idempotent (safe to re-run)
- [ ] Failures are logged with context
- [ ] Progress is reported (for long-running jobs)
- [ ] Can be triggered manually from admin UI
- [ ] Metrics emitted for duration and failure rate
- [ ] Graceful shutdown (complete current unit, then exit)

## Constraints

- Max runtime 30 minutes per invocation
- Must respect global concurrency limits

## Out of Scope

- Distributed coordination across workers

## Notes

Use the standard job framework.

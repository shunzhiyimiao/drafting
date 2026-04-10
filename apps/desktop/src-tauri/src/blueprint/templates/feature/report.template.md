---
blueprintId: {{blueprintId}}
type: feature
displayName: {{displayName}}
status: draft
priority: medium
owner: human
tags:
  - report
---

## Goal

Generate {{reportName}} report from {{dataSource}}.

## Context

Stakeholders need periodic reports to monitor {{metric}}. This feature generates and delivers the report.

## Acceptance Criteria

- [ ] Query the data source correctly
- [ ] Aggregate data per report spec
- [ ] Render in requested format (PDF/CSV/HTML)
- [ ] Include timestamp and filters used
- [ ] Deliver via email or download link
- [ ] Respect data access permissions
- [ ] Handle empty result sets gracefully

## Constraints

- Generation must complete within 5 minutes
- Max report size 50MB

## Out of Scope

- Interactive dashboards
- Real-time charts

## Notes

Pre-aggregate data if reports are heavy.

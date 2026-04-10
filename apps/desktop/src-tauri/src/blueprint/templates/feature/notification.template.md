---
blueprintId: {{blueprintId}}
type: feature
displayName: {{displayName}}
status: draft
priority: medium
owner: human
tags:
  - notification
---

## Goal

Send {{channel}} notifications for {{eventType}}.

## Context

Users need to be notified when {{eventType}} occurs. Notification must respect user preferences.

## Acceptance Criteria

- [ ] Trigger on the right event
- [ ] Render notification template with user context
- [ ] Respect user opt-in/opt-out preferences
- [ ] Delivery failures are retried with backoff
- [ ] Delivery status tracked
- [ ] Deduplicate to prevent spam
- [ ] Test mode available

## Constraints

- Must not block the triggering request
- Rate limit per user per channel

## Out of Scope

- Rich media in notifications

## Notes

Consider batch sending for efficiency.

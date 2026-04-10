---
blueprintId: {{blueprintId}}
type: feature
displayName: {{displayName}}
status: draft
priority: high
owner: human
tags:
  - auth
  - security
---

## Goal

Implement {{flowName}} authentication flow.

## Context

Users need to authenticate securely. This flow handles credential validation, session creation, and token issuance.

## Acceptance Criteria

- [ ] Credentials validated against the user store
- [ ] Failed attempts rate-limited per user
- [ ] Successful auth creates a secure session/token
- [ ] Token expiration enforced
- [ ] Refresh token flow supported
- [ ] Logout invalidates the session
- [ ] Audit log records auth events
- [ ] Password stored with proper hashing

## Constraints

- Passwords never logged
- Must follow OWASP guidelines
- HTTPS only

## Out of Scope

- Multi-factor authentication (separate flow)
- SSO integration (separate feature)

## Notes

Review with security team before deploying.

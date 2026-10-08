# 10. Invite links

Date: 2026-10-08. Status: Accepted. Spec: phase-1 acceptance criteria
"invite a second user by link" and "An invite link works exactly once and
expires after 7 days"; questions 6 and 9; review checklist "Invite tokens
are stored hashed, single use and expiring".

## Decision

- **Token:** 32 random bytes, base64url (43 characters, 256 bits). The link
  is `APP_URL/invites/<token>` and goes only into the invite email.
- **Storage:** only SHA-256 of the token (`invites.token_hash`). A database
  leak does not leak working links. A fast hash is fine here because the
  token is long and random, unlike a password.
- **Accepting:** `POST /api/v1/invites/:token/accept`, signed in. In one
  transaction the invite row is locked (`FOR UPDATE`), checked, the member
  added and the invite marked accepted, so two people using the same link
  at once cannot both join.
- **Answers:** unknown token 404 `invite_not_found`; used 410 `invite_used`;
  replaced by a newer invite 410 `invite_revoked`; past 7 days 410
  `invite_expired`; signed in with a different email 403
  `invite_wrong_email` (the invite stays usable for the right person).
- **Re-inviting** the same email revokes the open invite and sends a new
  link. A partial unique index allows one open invite per email per
  workspace. Inviting an existing member is 409 `already_member`.
- Only owners can invite, and invites always grant the member role.

## Consequences

- The owner never sees the link, so a lost email means sending a new
  invite. A "copy link" button would need the token in the API response;
  that is a choice for the UI step.
- Expired and used invites stay in the table. A cleanup job can come with
  the worker in Phase 5.

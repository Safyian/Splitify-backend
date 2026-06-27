# Splitify — Backend Developer Reference

## Project Overview

Splitify (branded **Splittify** in user-facing copy/emails) is a REST API backend for a mobile expense-splitting app. Users register, join groups, add shared expenses, and settle debts. The API is consumed by a Flutter mobile client.

Core domain concepts:
- **Groups** — shared spaces where members track expenses together. Each group has an `adminId` and a `balanceMode` (`pairwise` or `simplified`)
- **Expenses** — any purchase split among group members (equal, exact, or percentage)
- **Settlements** — a special expense record (description = `"Settlement"`) that cancels debt between two users
- **Settlement cycles** — when every balance in a group reaches zero, all current expenses are stamped with a shared `settledCycleId` and locked against editing/deletion
- **Activity** — an append-only audit log of all mutations within a group
- **Friends** — explicit friend list plus auto-derived group contacts, each with cross-group net balance
- **Placeholder users** — stub `User` documents created for people invited/added before they register; later **promoted in place** (same `_id`) when the real person signs up, preserving all group/expense/friend history

---

## Tech Stack

| Package | Version | Purpose |
|---|---|---|
| express | ^5.2.1 | HTTP framework |
| mongoose | ^9.1.5 | MongoDB ODM |
| bcryptjs | ^3.0.3 | Password hashing |
| jsonwebtoken | ^9.0.3 | JWT auth (7-day tokens) |
| zod | ^4.3.5 | Schema validation |
| express-rate-limit | ^8.3.1 | Rate limiting on auth routes |
| google-auth-library | ^10.7.0 | Verifying Google ID tokens (`OAuth2Client`) |
| jwks-rsa | ^4.1.0 | Fetching Apple's JWKS public keys for ID-token verification |
| twilio | ^6.0.2 | Sending phone OTP SMS |
| dotenv | ^17.2.3 | Env var loading |

Email is sent via the **Resend** API using native `fetch` (no SDK). There is no email SDK package in `package.json`. SMS OTP is sent via the **Twilio** SDK.

Runtime: **Node.js** with `"type": "module"` — the entire codebase uses ESM (`import`/`export`). No CommonJS (`require`) anywhere.

Scripts: `npm run dev` → `node --watch src/server.js` (no nodemon). `npm start` → `node src/server.js`. `npm test` is not implemented (exits 1). There is **no test suite**.

---

## Project Structure

```
src/
├── server.js               Entry point — loads dotenv, connects DB, starts Express (PORT default 8080)
├── app.js                  Express app setup — trust proxy, rate limiters, registers all routers, error handler
│
├── config/
│   └── db.js               Mongoose connection; calls process.exit(1) on failure
│
├── models/
│   ├── user.js             User schema — email/phone/social fields, placeholder flag, contact hashes,
│   │                       bcrypt + hash pre-save hooks, partial-unique indexes, token methods
│   ├── group.js            Group schema — members, emoji, defaultSplitType, adminId, balanceMode, settledAt
│   ├── expense.js          Expense schema — also used for settlements; settledCycleId for cycle locking
│   ├── activity.js         Activity log schema — denormalised actorName/groupName for fast reads
│   └── pending_friend.js   PendingFriend schema — DEFINED BUT UNUSED (no controller references it;
│                           invites are handled with placeholder Users instead)
│
├── controllers/
│   ├── auth.controller.js      register, login, loginWithPhone, logout, getMe, updateMe, deleteMe,
│   │                           verifyEmail, resendVerification, sendPhoneOtp, verifyPhoneOtp,
│   │                           forgotPassword, showResetForm, resetPassword, checkContacts,
│   │                           googleAuth, appleAuth
│   ├── user.controller.js      createUser, getUsers, updateUser, deleteUser (legacy CRUD, not auth-aware)
│   ├── groups.controller.js    createGroup, getMyGroups, getGroupsSummary, addMemberToGroup, leaveGroup,
│   │                           getGroupMembers, getGroupSettings, renameGroup, updateGroupEmoji,
│   │                           updateDefaultSplitType, updateBalanceMode, removeMemberFromGroup, deleteGroup
│   ├── expenses.controller.js  createExpense, getGroupExpenses, getGroupBalances, settleUp,
│   │                           updateExpense, deleteExpense, updateSettlement, getSettlementMax
│   ├── friends.controller.js   getFriends, addFriend, addFriendById, removeFriend, inviteFriend
│   └── activity.controller.js  getActivity (paginated, with per-group join cutoffs)
│
├── routes/
│   ├── auth.routes.js          (also mounts /users/check-contacts and /friends/invite)
│   ├── user.routes.js
│   ├── groups.routes.js
│   ├── expenses.routes.js
│   ├── friends.routes.js
│   └── activity.routes.js
│
├── middleware/
│   ├── auth.middleware.js      protect — verifies Bearer JWT, attaches req.user
│   ├── error.middleware.js     Global error handler — reads res.statusCode, returns { message }
│   └── validate.middleware.js  validate(schema) — runs Zod schema.parse(req.body), returns 400 on failure
│
├── utils/
│   ├── asyncHandler.js         Wraps async functions so thrown errors reach the error middleware
│   ├── token.js                generateToken(id) — signs a 7-day JWT with payload { id }
│   ├── splits.js               calculateEqualSplits, calculatePercentageSplits, calculateExactSplits
│   ├── balance.js              calculateGroupBalances, simplifyDebts, calculatePairwiseDebts,
│   │                           buildBalancesSection, buildPreview
│   ├── settlement.helper.js    applySettlementState — stamps settledCycleId + settledAt when all settled
│   ├── activity.helper.js      logActivity() — fire-and-forget; never throws to main flow
│   ├── email.helper.js         sendVerificationEmail, sendPasswordResetEmail — Resend REST API via fetch
│   ├── sms.helper.js           sendOtp (Twilio), generateOtp (6-digit)
│   ├── hash.helper.js          hashContact(value) — sha256 of normalised email/phone (contact discovery)
│   ├── social_verify.js        verifyGoogleToken, verifyAppleToken — provider token → trusted profile
│   └── social_auth.helper.js   resolveSocialUser(profile) — link/promote/create account by providerId/email
│
├── scripts/
│   └── backfill-hashes.js      One-off: populate emailHash/phoneHash on existing users
│
└── validators/
    ├── user.validator.js       createUserSchema, updateUserSchema, registerSchema, loginSchema,
    │                           forgotPasswordSchema (Zod). registerSchema is NOT wired to the register route
    └── expense.validator.js    validateExpenseInput, validateGroupMembers, validatePercentages, validateExactSplits
```

---

## Environment Variables

Loaded from a `.env` file at the project root (gitignored — never commit it).

| Variable | Description |
|---|---|
| `PORT` | Server port. **Defaults to `8080`** if not set |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign and verify JWTs |
| `APP_URL` | Base URL of this server. Used to build email verification (`/auth/verify/<token>`) and password reset (`/auth/reset-password?token=<token>`) links |
| `RESEND_API_KEY` | API key for the Resend email service |
| `GOOGLE_WEB_CLIENT_ID` | Google **web** client ID; Google ID tokens are verified against this audience. Has a hardcoded fallback in `social_verify.js` |
| `APPLE_BUNDLE_ID` | Expected `aud` claim for Apple ID tokens. Defaults to `app.splittify` |
| `SOCIAL_VERIFY_MODE` | Set to `mock` to trust decoded test payloads instead of verifying real tokens (see Social Auth) |
| `NODE_ENV` | When not `production`, social verification also runs in mock mode |
| `TWILIO_ACCOUNT_SID` | Twilio credentials for OTP SMS |
| `TWILIO_AUTH_TOKEN` | Twilio credentials for OTP SMS |
| `TWILIO_PHONE_NUMBER` | Twilio sender number |

The local `.env` currently only sets `JWT_SECRET`, `PORT`, `MONGO_URI`, `RESEND_API_KEY`, `APP_URL`, `GOOGLE_WEB_CLIENT_ID`. Twilio/Apple/social vars rely on defaults or mock mode in development.

---

## API Endpoints

All routes without a noted auth requirement are public. `[auth]` means the `protect` middleware runs. There is **no `/api` prefix** — routes are mounted at the root.

### Health
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Returns `{ status: "ok", timestamp }` |

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Register with email **or** phone + password. Email flow sends a verification email; phone flow sends an OTP. No JWT issued. Rate limited (10/15 min) |
| POST | `/auth/login` | — | Email + password login. Returns `{ token, user }`. Blocked if not verified / placeholder. Validated by `loginSchema`. Rate limited |
| POST | `/auth/login-phone` | — | Phone + password login. Returns `requiresPhoneVerification` if phone not yet verified. Rate limited |
| POST | `/auth/send-phone-otp` | — | (Re)send a phone OTP. Resend cap (3) then 24h block. Rate limited |
| POST | `/auth/verify-phone-otp` | — | Verify OTP; on success returns `{ token, user }` |
| POST | `/auth/logout` | — | Stateless — just returns 200. Client discards token |
| GET | `/auth/me` | [auth] | Returns current user `{ valid, user }` (id, name, email, phone) |
| PATCH | `/auth/me` | [auth] | Update display name |
| DELETE | `/auth/me` | [auth] | Delete account. Blocked if any unsettled balance (`!== 0`); removes user from groups and deletes now-empty groups they created |
| GET | `/auth/verify/:token` | — | Renders HTML success/failure page. **Token is a path param** (`req.params.token`) |
| POST | `/auth/resend-verification` | — | Resends verification email. Reuses a still-valid token; only regenerates if missing/expired. Returns 200 even if email unknown (prevents enumeration) |
| POST | `/auth/forgot-password` | — | Sends password reset email. Always 200 (prevents enumeration). Validated by `forgotPasswordSchema`. Rate limited |
| GET | `/auth/reset-password?token=` | — | Renders the HTML reset-password form |
| POST | `/auth/reset-password` | — | Form submit (`token`, `password`, `confirmPassword`); renders HTML result |
| POST | `/auth/google` | — | Google sign-in. Body `{ idToken }`. Rate limited |
| POST | `/auth/apple` | — | Apple sign-in. Body `{ idToken, name? }`. Rate limited |
| POST | `/users/check-contacts` | [auth] | Body `{ emailHashes[], phoneHashes[] }` (≤500 each). Returns registered users matching those contact hashes |
| POST | `/friends/invite` | [auth] | Invite an unregistered contact (see Friends) — defined here in `auth.routes.js` |

### Users (Legacy CRUD — not part of the main auth flow)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/users` | — | Create user directly (bypasses verification), validated by `createUserSchema` |
| GET | `/users` | [auth] | Get all users |
| PUT | `/users/:id` | [auth] | Update user by ID, validated by `updateUserSchema` |
| DELETE | `/users/:id` | [auth] | Delete user by ID |

### Groups
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/groups/new` | [auth] | Create group. Creator auto-added as first member and set as `adminId` |
| GET | `/groups` | [auth] | List groups the current user is a member of |
| GET | `/groups/summary` | [auth] | Groups with net balance + balance preview (uses group's `balanceMode`) |
| POST | `/groups/:groupId/members` | [auth] | Add member by `userId`, `email`, or `phone`. Any member can add. Creates a placeholder if no account/hash matches |
| DELETE | `/groups/:groupId/members/:memberId` | [auth] | Remove member. **Admin** can remove others; any member can remove **self**. Removed member must have zero balance |
| GET | `/groups/:groupId/members` | [auth] | List members (id, name, email, phone, isPlaceholder) |
| GET | `/groups/:groupId/settings` | [auth] | Full group settings (members, emoji, splitType, createdBy, adminId) |
| PATCH | `/groups/:groupId/name` | [auth] | Rename group. Any member |
| PATCH | `/groups/:groupId/emoji` | [auth] | Update emoji. Any member |
| PATCH | `/groups/:groupId/settings/split-type` | [auth] | Change defaultSplitType. Any member |
| PATCH | `/groups/:groupId/settings/balance-mode` | [auth] | Change balanceMode (`simplified`/`pairwise`). **Admin only** |
| POST | `/groups/:groupId/leave` | [auth] | Leave group. Blocked if `Math.abs(balance) >= 1` cent. Deletes group (+ its expenses/activity) if last member leaves |
| DELETE | `/groups/:groupId` | [auth] | Delete group. **Admin only**. All balances must be zero (`!== 0` guard) |

### Expenses
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/groups/:groupId/expenses` | [auth] | Create expense |
| GET | `/groups/:groupId/expenses` | [auth] | List expenses (newest first, populated, **paginated**: `page`, `limit` default 25) |
| GET | `/groups/:groupId/balances` | [auth] | Net balances (current members only) + `settlements` (simplified) + `pairwise` + `balanceMode` |
| PATCH | `/groups/:groupId/expenses/:expenseId` | [auth] | Update expense. Cannot edit settlements or expenses in a settled cycle |
| DELETE | `/groups/:groupId/expenses/:expenseId` | [auth] | Delete expense. Cannot delete if in a settled cycle |
| POST | `/groups/:groupId/settle` | [auth] | Record a settlement between two members (body `{ to, amount }`) |
| PATCH | `/groups/:groupId/settlements/:expenseId` | [auth] | Update settlement amount. Blocked if in a settled cycle |
| GET | `/groups/:groupId/settlements/:expenseId/max` | [auth] | Get max allowed amount for a settlement edit |

### Friends
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/friends` | [auth] | Combined list: explicit friends + group contacts, with cross-group net balance (uses each group's `balanceMode`) |
| POST | `/friends` | [auth] | Add friend by email (real accounts only). Bidirectional |
| POST | `/friends/add-by-id` | [auth] | Add friend by `userId` (used after `check-contacts`). Bidirectional |
| DELETE | `/friends/:friendId` | [auth] | Remove explicit friend (bidirectional). Deletes the placeholder if now unreferenced |
| POST | `/friends/invite` | [auth] | Invite unregistered contact by name + email/phone. Creates/reuses a placeholder, links bidirectionally. (Mounted in `auth.routes.js`) |

### Activity
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/activity` | [auth] | Paginated feed across all user's groups. `page` (default 1), `limit` (default 30). Non-creators only see events from their join cutoff onward |

---

## Database Models

### User
| Field | Type | Notes |
|---|---|---|
| `name` | String | required, trim |
| `email` | String | lowercase, trim, default `null`. Partial-unique index (only real strings) |
| `phone` | String | trim, default `null`. Partial-unique index |
| `isPhoneVerified` | Boolean | default false |
| `phoneOtp` / `phoneOtpExpiry` | String / Date | OTP and expiry (10 min) |
| `phoneOtpResendCount` | Number | resend counter; ≥3 triggers a 24h block |
| `phoneOtpBlockedUntil` | Date | block window for OTP abuse |
| `password` | String | `select: false`. **Required only when** not a placeholder and no `googleId`/`appleId` (social/placeholder accounts have no password) |
| `isPlaceholder` | Boolean | default false. Stub user awaiting registration |
| `googleId` / `appleId` | String | provider subject id, default `null`. Partial-unique indexes |
| `friends` | [ObjectId] | refs User |
| `emailHash` / `phoneHash` | String | sparse-indexed sha256 of email/phone for contact discovery (set by pre-save hook) |
| `isVerified` | Boolean | default false (email verification) |
| `verificationToken` / `verificationTokenExpiry` | String / Date | `select: false`; 24h expiry |
| `passwordResetToken` / `passwordResetTokenExpiry` | String / Date | `select: false`; 1h expiry |
| timestamps | — | `createdAt`, `updatedAt` |

Pre-save hooks: (1) hashes `password` with bcrypt (10 rounds) when modified and present (skips placeholders/social). (2) recomputes `emailHash`/`phoneHash` when `email`/`phone` change. Instance methods: `generateVerificationToken()` (+24h), `generatePasswordResetToken()` (+1h), both `crypto.randomBytes(32)`.

**Indexing**: email, phone, googleId, appleId all use `partialFilterExpression: { <field>: { $type: 'string' } }` so the many documents with `null` never collide on the unique index.

### Group
| Field | Type | Notes |
|---|---|---|
| `name` | String | required, trim |
| `emoji` | String | default `"🏠"` |
| `defaultSplitType` | String | `"equal"` \| `"exact"` \| `"percentage"`, default `"equal"` |
| `members` | [ObjectId] | refs User |
| `createdBy` | ObjectId | ref User, required |
| `adminId` | ObjectId | ref User, default `null`. Set to creator on create. Privileged ops (remove others, delete group, change balance mode) check this |
| `balanceMode` | String | `"simplified"` \| `"pairwise"`, default `"pairwise"` |
| `settledAt` | Date | null until all balances reach zero; reset to null if a later change reopens a balance |
| timestamps | — | `createdAt`, `updatedAt` |

### Expense
| Field | Type | Notes |
|---|---|---|
| `group` | ObjectId | ref Group, required |
| `description` | String | trim. Settlements use the hardcoded value `"Settlement"` |
| `amount` | Number | required, min 0 |
| `paidBy` | ObjectId | ref User, required |
| `splitType` | String | `"equal"` \| `"exact"` \| `"percentage"`, required, default `"equal"` |
| `splits` | Array | `[{ user: ObjectId, amount: Number, percentage: Number\|null }]` |
| `settledCycleId` | ObjectId | indexed, default `null`. Stamped when the group fully settles; locks the record from edit/delete |
| timestamps | — | `createdAt`, `updatedAt` |

Settlements are regular Expense documents distinguished only by `description === "Settlement"`.

### Activity
| Field | Type | Notes |
|---|---|---|
| `type` | String | enum: `expense_added`, `expense_updated`, `expense_deleted`, `settlement_made`, `member_added`, `member_removed`, `group_created`, `group_renamed`, `group_left`, `group_deleted` |
| `actor` | ObjectId | ref User, required |
| `group` | ObjectId | ref Group, required |
| `metadata` | Mixed | Per-event payload (amount, description, targetName, targetId, etc.) |
| `actorName` | String | Denormalised — stored at write time, no populate needed |
| `groupName` | String | Denormalised — same reason |
| timestamps | — | `createdAt`, `updatedAt` |

Index: `{ group: 1, createdAt: -1 }` for fast per-group feed queries.

### PendingFriend (unused)
Schema exists (`invitedBy`, `name`, `phone`, `email`, `phoneHash`, `emailHash`, `inviteToken`, `status`) but **no controller or route references it**. Invites currently use placeholder `User` documents instead. Don't assume it's wired in.

---

## Auth System

Splitify supports multiple sign-in paths, all of which converge on the same `{ token, user: { id, name, email, phone } }` response shape with a 7-day JWT (payload `{ id }`):

1. **Email + password** — verify email before login
2. **Phone + password** — verify phone via OTP before login
3. **Google** — `POST /auth/google`
4. **Apple** — `POST /auth/apple`

### Email registration / verification
1. `POST /auth/register` with `{ name, email, password }` (email OR phone required; password ≥8 with a letter and a number — checked inline in the controller)
2. A placeholder with a matching `emailHash`/`phoneHash` is **promoted in place** (reusing its `_id`) if found; otherwise a new user is created. The duplicate-email check excludes placeholders so a ghost never blocks real registration
3. `generateVerificationToken()` sets token + 24h expiry; `sendVerificationEmail()` builds a link to `APP_URL/auth/verify/<token>`
4. Returns 201 with no JWT
5. `GET /auth/verify/:token` finds the user by token (unexpired), sets `isVerified = true`, clears token fields, returns an **HTML page**
6. **Resend** (`/auth/resend-verification`): reuses the still-valid token and only regenerates when it is missing or expired — never regenerate a valid token

### Phone registration / OTP
1. `POST /auth/register` with a `phone` → generates a 6-digit OTP (10-min expiry), sends via Twilio, returns `{ requiresPhoneVerification: true, userId }`
2. `POST /auth/verify-phone-otp` with `{ phone, otp }` → on success sets `isPhoneVerified`, clears OTP state, returns `{ token, user }`
3. `POST /auth/send-phone-otp` re-sends; capped at 3 resends, then a 24h block (`phoneOtpBlockedUntil`)
4. `POST /auth/login-phone` checks password **before** verification status; if unverified returns `requiresPhoneVerification` (200, no token)

### Login (email)
1. Find user with `.select('+password')`
2. Reject placeholders with a "claim it" message
3. `bcrypt.compare()` **before** checking `isVerified` (avoids timing-based enumeration)
4. 403 if `!isVerified`; otherwise return `{ token, user }`

### Password reset
1. `POST /auth/forgot-password` → always 200; if user exists, sets a 1h reset token and emails `APP_URL/auth/reset-password?token=<token>`
2. `GET /auth/reset-password?token=` renders an HTML form (or an "expired" page)
3. `POST /auth/reset-password` validates token + password strength, sets new password (bcrypt hook runs), renders an HTML result page

### Social auth (Google / Apple)
`social_verify.js` is the **only** place that turns a raw provider token into a trusted profile, returning a uniform shape `{ provider, providerId, email, emailVerified, name }`:
- **Google**: `OAuth2Client.verifyIdToken({ idToken, audience: GOOGLE_WEB_CLIENT_ID })` — verified against the **web client** audience
- **Apple**: decode header → fetch the signing key from Apple's JWKS (`jwks-rsa`, cached 24h) → `jwt.verify` with RS256 → assert `iss === 'https://appleid.apple.com'` and `aud === APPLE_BUNDLE_ID`. Apple sends `name` only on the first authorization (in the request body), so it's passed through
- **Mock mode** (`SOCIAL_VERIFY_MODE === 'mock'` OR `NODE_ENV !== 'production'`): the `idToken` is treated as a decoded claims object, not a real JWT — lets the resolver be exercised without provider credentials. Real mode is the production path; the stub deliberately throws rather than silently trusting arbitrary input where verification isn't wired

`resolveSocialUser(profile)` (`social_auth.helper.js`) owns account identity. Resolution order:
1. **providerId already on a user** → return that user (already linked)
2. **email matches a real user** → link the provider id onto it (keep password + other provider), set `isVerified` if emailVerified
3. **emailHash matches a placeholder** → promote it in place (preserves `_id` and all history)
4. **otherwise** → create a fresh social user with no password
Apple hidden-relay (no email) skips the email branches and matches/creates on providerId only.

### Subsequent requests
Include `Authorization: Bearer <token>`. `protect` verifies the JWT and attaches the full user document (`-password`) to `req.user`.

---

## Key Conventions

### ESM modules
Every file uses `import`/`export`. No `require()`. All local imports must include the `.js` extension.

### asyncHandler vs try/catch
`asyncHandler` (from `utils/asyncHandler.js`) catches rejected promises and forwards to the global error middleware. **Note the codebase is inconsistent here**: auth routes and a few others use `asyncHandler`, but most group/expense/friend controllers wrap their bodies in their own `try/catch` that returns `res.status(...).json({ message })` directly. When editing an existing controller, **match the surrounding style** rather than imposing one. For the error-via-thrown pattern, set status before throwing:

```js
res.status(404);
throw new Error('Not found'); // errorHandler reads the pre-set status code
```

### validate middleware
`validate(schema)` runs a Zod `schema.parse(req.body)` and returns `400 { message, errors[] }` on failure. Currently wired only on `/auth/login` (`loginSchema`), `/auth/forgot-password` (`forgotPasswordSchema`), and the legacy `/users` routes. **`registerSchema` exists but is NOT applied to `/auth/register`** — that route validates inline in the controller instead. Validators live in `src/validators/`; Zod v4 syntax uses `.check(z.email(...))` / `.check(z.regex(...))`.

### protect middleware
Reads `Authorization: Bearer <token>`, verifies the JWT, attaches the full user document (password excluded) to `req.user`.

### Money arithmetic — integer cents
All balance/split math uses **integer cents** to avoid float drift. `calculateGroupBalances` returns a map of `userId → net cents`. Amounts are `Math.round(amount * 100)` on the way in and `/ 100` before DB writes / API responses. Use the utilities in `balance.js` and `splits.js`; never do money math on dollar floats.

Threshold conventions (be precise — they are **not** all identical):
- `simplifyDebts` advances a pointer when remaining `< 1` cent; `calculatePairwiseDebts` skips a pair when `Math.abs(netCents) < 1`
- `leaveGroup` blocks when `Math.abs(userBalance) >= 1` cent
- `applySettlementState` considers the group settled when every balance is `Math.abs(b) < 0.01` (balances are cents, so effectively zero)
- `removeMemberFromGroup`, `deleteGroup`, and `deleteMe` use a strict `!== 0` (cents) zero check
- `settleUp` / `updateSettlement` allow a `+ 0.01` dollar tolerance when checking the requested amount against the outstanding balance

### Settlement cycles (`settledCycleId`)
After any expense/settlement mutation, controllers call `applySettlementState(group)`. When all balances are zero it mints a new `ObjectId`, stamps every still-`null` `settledCycleId` in the group with it, and sets `group.settledAt`. If a balance reopens, `settledAt` is cleared. Expenses/settlements with a non-null `settledCycleId` are **locked** — edit/delete/settlement-edit return `400 { code: "SETTLED_LOCKED" }`. The intended flow is to add an adjustment rather than edit locked history.

### Balance modes (`pairwise` vs `simplified`)
Each group has a `balanceMode` (default `pairwise`). `GET /groups/:groupId/balances` always returns **both** a `settlements` array (simplified greedy debts) and a `pairwise` array (raw direct debts); the client picks based on `balanceMode`. `getGroupsSummary` and `getFriends` use `buildPreview` / the group's mode to compute the per-person preview. Only the admin can change the mode.

### Placeholder users & unification
People can be referenced before they register: `addMemberToGroup` and `inviteFriend` create `isPlaceholder: true` users (with `emailHash`/`phoneHash`, omitting absent fields to dodge the partial-unique indexes). When the real person registers (`register`) or signs in socially (`resolveSocialUser`), a placeholder matching the contact hash is **promoted in place** — `isPlaceholder` flips to false and the same `_id` is reused, so group/expense/friend history stays intact. `removeFriend` garbage-collects a placeholder only when it is no longer referenced by any group, friend list, or expense split.

### Contact discovery via hashes
`hashContact()` is sha256 of the lowercased, whitespace-stripped value. Clients upload `emailHashes`/`phoneHashes` to `POST /users/check-contacts` (≤500 each) to find which contacts are on Splitify without sending raw PII. `backfill-hashes.js` is a one-off to populate hashes on legacy users.

### Activity logging
Call `logActivity()` from `utils/activity.helper.js` **after** a successful mutation. It is internally wrapped in try/catch — it never throws and never blocks the response. `actor` must be the full `req.user` (needs `._id`, `.name`); `group` must be a document (needs `._id`, `.name`). `getActivity` applies a per-group **join cutoff**: group creators see full history; other members only see events from their `member_added` event (or the group's `createdAt` as a fallback) onward.

### Authorization patterns
Membership checks use `.some()` with `.toString()`:
```js
group.members.some(m => m.toString() === req.user._id.toString())
```
Never `.includes()` with ObjectIds (compares by reference, silently false). **Caveat**: `leaveGroup` and the `expense.validator.js` helpers still use `group.members.includes(...)` / `.includes(paidBy)` — pre-existing; do not "fix" without being asked.

Privileged operations are **admin-only** (`group.adminId?.toString() === req.user._id.toString()`): removing other members, deleting a group, changing balance mode. `adminId` is set to the creator at creation and cleared if the admin leaves.

---

## Do's and Don'ts

### Do
- Match the existing error-handling style of the file you're editing (`asyncHandler` + thrown errors in some files; inline `try/catch` returning JSON in others)
- Use `.toString()` when comparing ObjectIds, and `.some()` not `.includes()` for membership
- Keep money in integer cents inside calculations; convert to dollars only for DB writes and API responses, using the cent thresholds above
- Call `logActivity()` after every successful mutation, and `applySettlementState(group)` after any expense/settlement change
- Add `.select('+password')` / `.select('+verificationToken +verificationTokenExpiry')` / `.select('+passwordResetToken +passwordResetTokenExpiry')` explicitly when those excluded fields are needed
- Omit absent `email`/`phone`/`googleId`/`appleId` rather than setting `null` on new placeholder/social users, to respect the partial-unique indexes
- Route all provider-token trust through `social_verify.js` and all account identity through `resolveSocialUser`

### Don't
- Don't issue a JWT at email/phone registration — users must verify first
- Don't regenerate a still-valid verification token on resend — reuse it, only regenerate when missing/expired
- Don't use `req.user.password` in controllers — `protect` excludes it
- Don't edit settlements via the regular expense update endpoint, and don't edit/delete anything with a non-null `settledCycleId`
- Don't throw inside `logActivity()` — it must never break the main flow
- Don't perform float arithmetic on dollar amounts when computing balances — use the cent-based utilities
- Don't assume `PendingFriend` is wired up — it isn't

---

## Known Issues / Watch Out For

- **Orphaned departed-member balances**: when a member leaves or is removed while expenses referencing them remain, the *current-member* net balances no longer sum to zero. `getGroupBalances` filters the displayed balances to current members only, but the underlying `balancesCents` still includes the departed user's net. If the sum of balances is non-zero, suspect an orphaned departed-member balance rather than a math bug.

- **`getGroupsSummary` balance preview** uses an approximation path (`buildPreview` with the group's `balanceMode`) rather than the authoritative `GET /groups/:groupId/balances` response; numbers may differ slightly.

- **`POST /users`** is a legacy endpoint that creates users directly without verification, using `createUserSchema` which validates `age`/`role` fields that don't exist on the User model. It should not be used by the mobile app.

- **`registerSchema` is defined but unused** — `/auth/register` validates inline in the controller. The two can drift; update the controller, not just the schema, when changing registration rules.

- **Inconsistent settled thresholds** (see Money arithmetic) — `applySettlementState` uses `< 0.01`, `leaveGroup` uses `>= 1`, remove/delete/deleteMe use `!== 0`, debt builders use `< 1`. All operate on cents and all are effectively "≈ zero," but the exact comparison differs per call site.

- **`leaveGroup` and `expense.validator.js` use `.includes()`** on ObjectId arrays — contrary to the project's `.some()`/`.toString()` convention. Pre-existing; leave as-is unless explicitly fixing.

- **No refresh token / revocation** — JWTs are 7-day bearer tokens; logout is purely client-side.

- **Apple/Google verification depends on env/mode** — with `NODE_ENV !== 'production'` (or `SOCIAL_VERIFY_MODE=mock`), tokens are NOT cryptographically verified; the decoded payload is trusted as-is. Ensure `NODE_ENV=production` in production so real verification runs.

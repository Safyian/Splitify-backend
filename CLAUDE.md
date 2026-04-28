# Splitify — Backend Developer Reference

## Project Overview

Splitify is a REST API backend for a mobile expense-splitting app. Users register, join groups, add shared expenses, and settle debts. The API is consumed by a Flutter mobile client.

Core domain concepts:
- **Groups** — shared spaces where members track expenses together
- **Expenses** — any purchase split among group members (equal, exact, or percentage)
- **Settlements** — a special expense record (description = `"Settlement"`) that cancels debt between two users
- **Activity** — an append-only audit log of all mutations within a group
- **Friends** — explicit friend list plus auto-derived group contacts, each with cross-group net balance

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
| dotenv | ^17.2.3 | Env var loading |

Email is sent via the **Resend** API using native `fetch` (no SDK). There is no email SDK package in `package.json`.

Runtime: **Node.js** with `"type": "module"` — the entire codebase uses ESM (`import`/`export`). No CommonJS (`require`) anywhere.

Dev server: `node --watch src/server.js` (no nodemon).

---

## Project Structure

```
src/
├── server.js               Entry point — loads dotenv, connects DB, starts Express
├── app.js                  Express app setup — registers all routers, rate limiters, error handler
│
├── config/
│   └── db.js               Mongoose connection; calls process.exit(1) on failure
│
├── models/
│   ├── user.js             User schema — bcrypt pre-save hook, generateVerificationToken method
│   ├── group.js            Group schema — members array, emoji, defaultSplitType, settledAt
│   ├── expense.js          Expense schema — also used for settlements
│   └── activity.js         Activity log schema — denormalised actorName/groupName for fast reads
│
├── controllers/
│   ├── auth.controller.js      register, login, logout, getMe, updateMe, deleteMe, verifyEmail, resendVerification
│   ├── user.controller.js      createUser, getUsers, updateUser, deleteUser (legacy CRUD, not auth-aware)
│   ├── groups.controller.js    createGroup, getMyGroups, getGroupsSummary, addMemberToGroup, leaveGroup,
│   │                           getGroupMembers, getGroupSettings, renameGroup, updateGroupEmoji,
│   │                           updateDefaultSplitType, removeMemberFromGroup, deleteGroup
│   ├── expenses.controller.js  createExpense, getGroupExpenses, getGroupBalances, settleUp,
│   │                           updateExpense, deleteExpense, updateSettlement, getSettlementMax
│   ├── friends.controller.js   getFriends, addFriend, removeFriend
│   └── activity.controller.js  getActivity (paginated)
│
├── routes/
│   ├── auth.routes.js
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
│   ├── token.js                generateToken(id) — signs a 7-day JWT
│   ├── splits.js               calculateEqualSplits, calculatePercentageSplits, calculateExactSplits
│   ├── balance.js              calculateGroupBalances (net cents per member), simplifyDebts (greedy algorithm)
│   ├── activity.helper.js      logActivity() — fire-and-forget; never throws to main flow
│   └── email.helper.js         sendVerificationEmail() — calls Resend REST API via fetch
│
└── validators/
    ├── user.validator.js       registerSchema, loginSchema, createUserSchema, updateUserSchema (Zod)
    └── expense.validator.js    validateExpenseInput, validateGroupMembers, validatePercentages, validateExactSplits
```

---

## Environment Variables

All required in a `.env` file at the project root:

| Variable | Description |
|---|---|
| `PORT` | Server port. Defaults to `8080` if not set |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign and verify JWTs |
| `APP_URL` | Base URL of this server (e.g. `https://api.splitify.com`). Used to build email verification links |
| `RESEND_API_KEY` | API key for the Resend email service |

`.env` is gitignored. Never commit it.

---

## API Endpoints

All routes without a noted auth requirement are public. `[auth]` means the `protect` middleware runs.

### Health
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Returns `{ status: "ok", timestamp }` |

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Register. Sends verification email. Returns 201 with no JWT. Rate limited (10/15 min) |
| POST | `/auth/login` | — | Login. Returns `{ token, user }`. Blocked if not verified. Rate limited |
| POST | `/auth/logout` | — | Stateless — just returns 200. Client discards token |
| GET | `/auth/me` | [auth] | Returns current user `{ valid, user }` |
| PATCH | `/auth/me` | [auth] | Update display name |
| DELETE | `/auth/me` | [auth] | Delete account. Blocked if unsettled balances exist |
| GET | `/auth/verify-email` | — | Renders HTML success/failure page; deep-links to `splitify://` |
| POST | `/auth/resend-verification` | — | Resends verification email. Always returns 200 (prevents email enumeration) |

### Users (Legacy CRUD — not part of the main auth flow)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/users` | — | Create user directly (bypasses email verification) |
| GET | `/users` | [auth] | Get all users |
| PUT | `/users/:id` | [auth] | Update user by ID |
| DELETE | `/users/:id` | [auth] | Delete user by ID |

### Groups
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/groups/new` | [auth] | Create group. Creator auto-added as first member |
| GET | `/groups` | [auth] | List groups the current user is a member of |
| GET | `/groups/summary` | [auth] | Groups with net balance and pairwise debt preview |
| POST | `/groups/:groupId/members` | [auth] | Add member by email. Any member can add |
| DELETE | `/groups/:groupId/members/:memberId` | [auth] | Remove member. Creator only. Member must be settled |
| GET | `/groups/:groupId/members` | [auth] | List members with name + email |
| GET | `/groups/:groupId/settings` | [auth] | Full group settings (members, emoji, splitType, createdBy) |
| PATCH | `/groups/:groupId/name` | [auth] | Rename group. Any member |
| PATCH | `/groups/:groupId/emoji` | [auth] | Update emoji. Any member |
| PATCH | `/groups/:groupId/settings/split-type` | [auth] | Change defaultSplitType. Any member |
| POST | `/groups/:groupId/leave` | [auth] | Leave group. Blocked if unsettled balance |
| DELETE | `/groups/:groupId` | [auth] | Delete group. Creator only. All balances must be zero |

### Expenses
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/groups/:groupId/expenses` | [auth] | Create expense |
| GET | `/groups/:groupId/expenses` | [auth] | List expenses (newest first, populated) |
| GET | `/groups/:groupId/balances` | [auth] | Net balances + simplified debts + pairwise debts |
| PATCH | `/groups/:groupId/expenses/:expenseId` | [auth] | Update expense. Cannot edit settlements |
| DELETE | `/groups/:groupId/expenses/:expenseId` | [auth] | Delete expense |
| POST | `/groups/:groupId/settle` | [auth] | Record a settlement between two members |
| PATCH | `/groups/:groupId/settlements/:expenseId` | [auth] | Update settlement amount |
| GET | `/groups/:groupId/settlements/:expenseId/max` | [auth] | Get max allowed amount for a settlement edit |

### Friends
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/friends` | [auth] | Get combined list: explicit friends + group contacts, with cross-group balance |
| POST | `/friends` | [auth] | Add friend by email |
| DELETE | `/friends/:friendId` | [auth] | Remove explicit friend |

### Activity
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/activity` | [auth] | Paginated activity feed for all user's groups. Query params: `page` (default 1), `limit` (default 30) |

---

## Database Models

### User
| Field | Type | Notes |
|---|---|---|
| `name` | String | required, trim |
| `email` | String | required, unique, lowercase, trim |
| `password` | String | required, `select: false` (excluded by default from queries) |
| `friends` | [ObjectId] | refs User |
| `isVerified` | Boolean | default false |
| `verificationToken` | String | `select: false`; set by `generateVerificationToken()` |
| `verificationTokenExpiry` | Date | `select: false`; 24 hours from token generation |
| timestamps | — | `createdAt`, `updatedAt` |

Pre-save hook hashes `password` with bcrypt (10 rounds) when modified. `generateVerificationToken()` is an instance method using `crypto.randomBytes(32)`.

### Group
| Field | Type | Notes |
|---|---|---|
| `name` | String | required, trim |
| `emoji` | String | default `"🏠"` |
| `defaultSplitType` | String | `"equal"` \| `"exact"` \| `"percentage"`, default `"equal"` |
| `members` | [ObjectId] | refs User |
| `createdBy` | ObjectId | ref User, required |
| `settledAt` | Date | null until all balances reach zero; reset to null if a deletion reopens a balance |
| timestamps | — | `createdAt`, `updatedAt` |

### Expense
| Field | Type | Notes |
|---|---|---|
| `group` | ObjectId | ref Group, required |
| `description` | String | trim. Settlements use the hardcoded value `"Settlement"` |
| `amount` | Number | required, min 0 |
| `paidBy` | ObjectId | ref User, required |
| `splitType` | String | `"equal"` \| `"exact"` \| `"percentage"`, required |
| `splits` | Array | `[{ user: ObjectId, amount: Number, percentage: Number\|null }]` |
| timestamps | — | `createdAt`, `updatedAt` |

Settlements are regular Expense documents. They are distinguished only by `description === "Settlement"`.

### Activity
| Field | Type | Notes |
|---|---|---|
| `type` | String | enum: `expense_added`, `expense_updated`, `settlement_made`, `member_added`, `member_removed`, `group_created`, `group_renamed`, `group_left`, `group_deleted` |
| `actor` | ObjectId | ref User |
| `group` | ObjectId | ref Group |
| `metadata` | Mixed | Per-event payload (amount, description, targetName, etc.) |
| `actorName` | String | Denormalised — stored at write time, no populate needed on read |
| `groupName` | String | Denormalised — same reason |
| timestamps | — | `createdAt`, `updatedAt` |

Index: `{ group: 1, createdAt: -1 }` for fast per-group feed queries.

---

## Key Conventions

### ESM modules
Every file uses `import`/`export`. No `require()`. All local imports must include the `.js` extension.

### asyncHandler
Wrap every async route handler with `asyncHandler` from `utils/asyncHandler.js`. This catches rejected promises and forwards them to the global error middleware via `next(err)`.

```js
router.get('/route', protect, asyncHandler(myHandler));
```

Do not use try/catch inside handlers wrapped with `asyncHandler` unless you need to return a specific status. If you do use try/catch, set `res.status()` before throwing:

```js
// Pattern used in this codebase for error with status:
res.status(404);
throw new Error('Not found');
// errorHandler picks up the pre-set status code
```

### validate middleware
Apply `validate(schema)` before the controller for routes that accept a body. Uses Zod. Returns `400 { message, errors[] }` on failure.

```js
router.post('/auth/register', validate(registerSchema), asyncHandler(register));
```

Validators live in `src/validators/`. Zod schemas use `z.object()`. The `registerSchema` uses `.check()` (Zod v4 syntax) rather than `.refine()`.

### protect middleware
All authenticated routes use `protect` from `src/middleware/auth.middleware.js`. It reads the `Authorization: Bearer <token>` header, verifies the JWT, and attaches the full user document (excluding password) to `req.user`.

### Money arithmetic
All balance calculations use **integer cents** to avoid floating-point drift. Amounts are multiplied by 100 at the start of any calculation and divided by 100 before writing to the DB or returning in responses. The utility functions in `balance.js` and `splits.js` handle this consistently. Never perform money math directly on dollar floats.

### Activity logging
After any successful mutation, call `logActivity()` from `utils/activity.helper.js`. It is wrapped in try/catch internally — it will never throw and never block the response. Always call it *after* the DB write succeeds.

```js
await logActivity({ type: 'group_created', actor: req.user, group, metadata: { ... } });
```

The `actor` argument must be the full `req.user` object (needs `._id` and `.name`). The `group` argument must be a Mongoose document (needs `._id` and `.name`).

### Settlements as Expenses
Settlements are stored as `Expense` documents with `description: "Settlement"`. The `updateExpense` controller explicitly blocks edits to settlements. Separate `updateSettlement` and `getSettlementMax` endpoints handle settlement-specific mutations. When checking if a record is a settlement, compare `expense.description === "Settlement"`.

### Authorization pattern
Most group operations check membership with:
```js
group.members.some(m => m.toString() === req.user._id.toString())
```
Use `.some()` with `.toString()` comparison — never `.includes()` with ObjectId objects, as that compares by reference and will fail.

Removing members and deleting groups are **creator-only** operations (`group.createdBy.toString() === req.user._id.toString()`).

---

## Auth Flow

### Registration
1. `POST /auth/register` with `{ name, email, password }`
2. Zod validates: name ≥2 chars, valid email, password ≥8 chars with at least one letter and one number
3. Check for duplicate email
4. `User.create()` — pre-save hook hashes password
5. `user.generateVerificationToken()` — sets `verificationToken` and `verificationTokenExpiry` (+24h)
6. `sendVerificationEmail()` — sends via Resend; email contains a link to `APP_URL/auth/verify-email?token=<token>`
7. Returns 201 `{ message, email }` — **no JWT issued yet**

### Email Verification
1. User clicks link in email → `GET /auth/verify-email?token=<token>`
2. Finds user by token where expiry is still in the future
3. Sets `isVerified = true`, clears token fields
4. Returns an HTML page (not JSON) with a deep-link button to `splitify://login`
5. On failure (expired/used): returns a different HTML page with a deep-link to `splitify://resend-verification`

### Login
1. `POST /auth/login` with `{ email, password }`
2. Find user with `.select('+password')` to include the excluded field
3. `bcrypt.compare()` — always check before checking `isVerified` to avoid timing-based enumeration
4. Reject with 403 if `!user.isVerified`
5. Return `{ token, user: { id, name, email } }` — JWT valid 7 days

### Subsequent requests
Include `Authorization: Bearer <token>` on every protected request. The `protect` middleware populates `req.user` with the full user document (password excluded).

---

## Do's and Don'ts

### Do
- Use `asyncHandler` on every async route handler
- Use `.toString()` when comparing ObjectIds
- Use `.some()` not `.includes()` for ObjectId array membership checks
- Keep all money in integer cents inside calculation functions; convert to dollars only for DB writes and API responses
- Call `logActivity()` after every successful mutation
- Use `validate(schema)` middleware for all request bodies that need validation
- Add `.select('+password')` or `.select('+verificationToken +verificationTokenExpiry')` explicitly when those fields are needed — they are excluded by default

### Don't
- Don't issue a JWT at registration — users must verify email before they can log in
- Don't use `group.members.includes(objectId)` — it compares by reference and silently returns false
- Don't use `req.user.password` in controllers — the `protect` middleware intentionally excludes it
- Don't throw inside `logActivity()` calls — it must never break the main request flow
- Don't edit settlements via the regular expense update endpoint — `updateExpense` blocks this by design
- Don't add `try/catch` around every controller for generic 500s — use `asyncHandler` + the global error middleware instead
- Don't perform floating-point arithmetic directly on dollar amounts when computing balances — use the cent-based utilities in `balance.js` and `splits.js`
- Don't query all expenses for a group without populating `paidBy` and `splits.user` when passing to `calculateGroupBalances` — the balance util uses `.toString()` on potentially populated objects and handles both cases, but consistency matters

---

## Known Issues / Watch Out For

- **`updateExpense` has debug `console.log` statements** left in (`expenses.controller.js` lines 383–389). These log split details to stdout after every expense update and should be removed before production.

- **`POST /users`** is a legacy endpoint that creates users directly without email verification, using a schema (`createUserSchema`) that validates `age` and `role` fields that don't exist on the User model. This endpoint should not be used in the mobile app — it's a leftover from early development.

- **`verifyEmail` controller uses `req.params.token`** but the email link sends the token as a query string (`?token=`). Query string parameters are at `req.query`, not `req.params`. This means `req.params.token` is always `undefined` and verification always fails unless this is corrected to `req.query.token`.

- **`getGroupsSummary` balance preview** uses an approximation: it computes a pairwise amount from two net balances rather than running the full debt-simplification algorithm. The numbers shown in the preview may differ slightly from the authoritative values returned by `GET /groups/:groupId/balances`.

- **No refresh token mechanism** — JWTs are 7-day bearer tokens with no server-side revocation. Logout is purely client-side.

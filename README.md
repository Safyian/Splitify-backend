# 💸 Splittify API

> A production-ready REST API for splitting expenses among friends — built for a Flutter mobile client.

![Node.js](https://img.shields.io/badge/Node.js-ESM-339933?style=flat-square&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.x-000000?style=flat-square&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-Auth-000000?style=flat-square&logo=jsonwebtokens&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-Validation-3E67B1?style=flat-square)
![Railway](https://img.shields.io/badge/Deployed-Railway-0B0D0E?style=flat-square&logo=railway&logoColor=white)

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Environment Variables](#-environment-variables)
- [Running Locally](#-running-locally)
- [API Reference](#-api-reference)
  - [Health](#health)
  - [Auth](#auth-routes)
  - [Groups](#group-routes)
  - [Expenses](#expense-routes)
  - [Friends](#friend-routes)
  - [Activity](#activity-routes)
- [Auth Flow](#-auth-flow)
- [Deployment](#-deployment)
- [Security](#-security)
- [Roadmap](#-roadmap)

---

## 🧩 Overview

Splittify is a REST API backend for a mobile expense-splitting app. Users register, join groups, add shared expenses split by equal, exact, or percentage amounts, settle debts between each other, and track an activity feed of everything that happened inside their groups.

Sign-in is flexible: email/password, phone number + SMS OTP, **Google Sign-In**, and **Sign in with Apple** all converge on the same JWT session. People you split with do not need an account first — they exist as **placeholder users** and are seamlessly promoted to real accounts when they sign up.

The API is consumed by a Flutter mobile client and deployed on Railway with a MongoDB Atlas database.

> **Branding note:** the product is **Splittify** (two t's) in everything user-facing. The literal repository/folder is `Splitify` / `splitify` (one t) — only paths and clone URLs use that spelling.

---

## ✨ Features

- **Multi-method Authentication** — Four sign-in paths, all returning a 7-day JWT:
  - **Email + password** with an email-verification gate before login
  - **Phone + password** with SMS OTP verification (via Twilio)
  - **Google Sign-In** — id-token verified server-side with `google-auth-library`
  - **Sign in with Apple** — id-token verified server-side against Apple's JWKS
- **Account Linking & Placeholder Promotion** — `resolveSocialUser` links a social login to an existing account by provider id or email, and promotes pre-existing placeholder users in place (preserving their `_id` and all history)
- **Privacy-Preserving Contact Matching** — Clients upload SHA-256 hashes of emails/phones (`emailHash` / `phoneHash`); the server matches contacts without ever receiving raw addresses
- **Password Reset** — Secure forgot-password flow via tokenized email link (1-hour expiry), rendered as a server-side HTML form
- **Groups** — Create groups, add/remove members, set emoji, rename, configure default split type and balance mode, leave or delete
- **Expenses** — Add, edit, and delete expenses with equal, exact, or percentage splits
- **Debt Simplification** — Greedy algorithm reduces N-way debts to the minimum number of transactions
- **Settlements** — Record payments between members stored as special expense documents
- **Balance Tracking** — Per-group net balances, simplified debts, and pairwise direct debts
- **Friends** — Explicit friend list auto-merged with group contacts; each entry shows cross-group net balance; invite non-users by email/phone
- **Activity Feed** — Append-only audit log of all mutations, paginated, sorted newest-first
- **Cent-based arithmetic** — All money math uses integer cents internally to avoid floating-point drift
- **Rate Limiting** — Auth endpoints limited to 10 requests per 15 minutes
- **Input Validation** — Zod schemas on request bodies; returns structured 400 errors
- **Email Enumeration Prevention** — Forgot-password and resend-verification responses do not reveal whether an email exists
- **Safe Account Deletion** — Blocks delete if the user has unsettled balances in any group

---

## 🛠 Tech Stack

| Package | Version | Purpose |
|---|---|---|
| `express` | ^5.2.1 | HTTP framework |
| `mongoose` | ^9.1.5 | MongoDB ODM |
| `bcryptjs` | ^3.0.3 | Password hashing (10 rounds) |
| `jsonwebtoken` | ^9.0.3 | JWT signing/verification + Apple id-token verification |
| `google-auth-library` | ^10.7.0 | Verifying Google id-tokens against the web client ID |
| `jwks-rsa` | ^4.1.0 | Fetching Apple's public signing keys (JWKS) |
| `twilio` | ^6.0.2 | Sending phone OTP via SMS |
| `zod` | ^4.3.5 | Schema validation |
| `express-rate-limit` | ^8.3.1 | Rate limiting on auth routes |
| `dotenv` | ^17.2.3 | Environment variable loading |

Email is sent via the **Resend** REST API using native `fetch` — no SDK required.

Runtime: **Node.js** with `"type": "module"` (full ESM, no CommonJS `require`).

---

## 📁 Project Structure

```
src/
├── server.js                   Entry point — loads dotenv, connects DB, starts Express
├── app.js                      Express app setup — registers routers, rate limiters, error handler
│
├── config/
│   └── db.js                   Mongoose connection; exits the process on failure
│
├── models/
│   ├── user.js                 User schema — email/phone/social ids, placeholder flag,
│   │                           emailHash/phoneHash, bcrypt + hashing pre-save hooks, token methods
│   ├── group.js                Group schema — members, emoji, defaultSplitType, adminId,
│   │                           balanceMode, settledAt
│   ├── expense.js              Expense schema — also used for settlements; settledCycleId
│   ├── activity.js             Activity log schema — denormalised for fast reads
│   └── pending_friend.js       PendingFriend schema (defined but currently unused — invites use placeholder Users)
│
├── controllers/
│   ├── auth.controller.js      register, login, loginWithPhone, sendPhoneOtp, verifyPhoneOtp,
│   │                           googleAuth, appleAuth, logout, getMe, updateMe, deleteMe,
│   │                           verifyEmail, resendVerification, forgotPassword, showResetForm,
│   │                           resetPassword, checkContacts
│   ├── user.controller.js      Legacy CRUD (not part of the main auth flow)
│   ├── groups.controller.js    createGroup, getMyGroups, getGroupsSummary, addMemberToGroup,
│   │                           leaveGroup, getGroupMembers, getGroupSettings, renameGroup,
│   │                           updateGroupEmoji, updateDefaultSplitType, updateBalanceMode,
│   │                           removeMemberFromGroup, deleteGroup
│   ├── expenses.controller.js  createExpense, getGroupExpenses, getGroupBalances, settleUp,
│   │                           updateExpense, deleteExpense, updateSettlement, getSettlementMax
│   ├── friends.controller.js   getFriends, addFriend, addFriendById, inviteFriend, removeFriend
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
│   └── validate.middleware.js  validate(schema) — runs Zod parse, returns 400 on failure
│
├── utils/
│   ├── asyncHandler.js         Wraps async route handlers so errors reach the error middleware
│   ├── token.js                generateToken(id) — signs a 7-day JWT
│   ├── splits.js               calculateEqualSplits, calculatePercentageSplits, calculateExactSplits
│   ├── balance.js              calculateGroupBalances (net cents), simplifyDebts, calculatePairwiseDebts
│   ├── settlement.helper.js    applySettlementState — stamps a settled cycle when all balances are zero
│   ├── activity.helper.js      logActivity() — fire-and-forget, never throws
│   ├── email.helper.js         sendVerificationEmail, sendPasswordResetEmail via Resend API
│   ├── sms.helper.js           sendOtp (Twilio), generateOtp (6-digit)
│   ├── hash.helper.js          hashContact() — SHA-256 of normalised email/phone
│   ├── social_verify.js        verifyGoogleToken, verifyAppleToken — provider id-token → trusted profile
│   └── social_auth.helper.js   resolveSocialUser() — link/promote/create account from a social profile
│
├── scripts/
│   └── backfill-hashes.js      One-off: backfill emailHash/phoneHash on existing users
│
└── validators/
    ├── user.validator.js        registerSchema, loginSchema, forgotPasswordSchema (Zod)
    └── expense.validator.js     validateExpenseInput, validateGroupMembers, validatePercentages,
                                 validateExactSplits
```

---

## 🔑 Environment Variables

Create a `.env` file in the project root. Never commit it. Values below are **placeholders** — use your own.

| Variable | Description | Example / Placeholder |
|---|---|---|
| `PORT` | Server port. Defaults to `8080` if not set | `8080` |
| `MONGO_URI` | MongoDB connection string (e.g. MongoDB Atlas SRV URI) | `mongodb+srv://<user>:<pass>@<cluster>/<db>` |
| `JWT_SECRET` | Secret used to sign and verify JWTs — use a long random string | `<long-random-string>` |
| `APP_URL` | Base URL of this server. Used to build email links | `https://your-api.example.com` |
| `RESEND_API_KEY` | API key from [Resend](https://resend.com) for transactional email | `re_xxxxxxxx` |
| `GOOGLE_WEB_CLIENT_ID` | Google **web** client ID; used as the audience when verifying Google id-tokens | `xxxxxxxx.apps.googleusercontent.com` |
| `APPLE_BUNDLE_ID` | Expected `aud` for Apple id-tokens (defaults to `app.splittify`) | `app.splittify` |
| `SOCIAL_VERIFY_MODE` | `mock` to trust decoded test payloads instead of verifying real tokens; defaults to real verification in production | `mock` |
| `NODE_ENV` | When not `production`, social verification also runs in mock mode | `development` |
| `TWILIO_ACCOUNT_SID` | Twilio account SID for sending OTP SMS | `ACxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | `<twilio-auth-token>` |
| `TWILIO_PHONE_NUMBER` | Twilio sender number (E.164) | `+15555550123` |

> **Social verification modes:** When `SOCIAL_VERIFY_MODE=mock` **or** `NODE_ENV !== 'production'`, `social_verify.js` treats the incoming `idToken` as an already-decoded claims object (for curl/tests). In production with real verification, Google and Apple tokens are cryptographically verified (see [Auth Flow](#-auth-flow)).

---

## 🚀 Running Locally

```bash
# 1. Clone the repository
git clone https://github.com/Safyian/Splitify-backend.git
cd Splitify-backend

# 2. Install dependencies
npm install

# 3. Create your environment file and fill in all required variables
cp .env.example .env   # if present; otherwise create .env by hand

# 4. Start the dev server (uses Node.js --watch for auto-reload)
npm run dev

# The API is now running at http://localhost:8080
```

**Health check:**

```bash
curl http://localhost:8080/health
# → { "status": "ok", "timestamp": "..." }
```

---

## 📡 API Reference

All authenticated endpoints require:
```
Authorization: Bearer <token>
```

There is **no `/api` prefix** — routes are mounted at the root.

---

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Returns server status and timestamp |

**Response:**
```json
{ "status": "ok", "timestamp": "2024-01-15T10:30:00.000Z" }
```

---

### Auth Routes

| Method | Path | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `POST` | `/auth/register` | — | 10/15 min | Register a new account (email **or** phone) |
| `POST` | `/auth/login` | — | 10/15 min | Email/password login → JWT |
| `POST` | `/auth/login-phone` | — | 10/15 min | Phone/password login → JWT (or OTP prompt) |
| `POST` | `/auth/send-phone-otp` | — | 10/15 min | Send/resend an SMS OTP |
| `POST` | `/auth/verify-phone-otp` | — | 10/15 min | Verify SMS OTP → JWT |
| `POST` | `/auth/google` | — | 10/15 min | Google Sign-In → JWT |
| `POST` | `/auth/apple` | — | 10/15 min | Sign in with Apple → JWT |
| `POST` | `/auth/logout` | — | — | Stateless logout (client discards token) |
| `GET` | `/auth/me` | ✅ | — | Get current user profile |
| `PATCH` | `/auth/me` | ✅ | — | Update display name |
| `DELETE` | `/auth/me` | ✅ | — | Delete account (blocked if unsettled balances exist) |
| `GET` | `/auth/verify/:token` | — | — | Verify email from link (returns HTML page) |
| `POST` | `/auth/resend-verification` | — | — | Resend verification email (reuses a valid token) |
| `POST` | `/auth/forgot-password` | — | 10/15 min | Request a password reset email |
| `GET` | `/auth/reset-password` | — | — | Show password reset form (returns HTML) |
| `POST` | `/auth/reset-password` | — | — | Submit new password via form |
| `POST` | `/users/check-contacts` | ✅ | — | Match contacts by hashed email/phone |

**POST /auth/register** — *email account*
```json
// Request body
{ "name": "Alice", "email": "alice@example.com", "password": "secret123" }

// 201 Response
{ "message": "Account created. Please check your email to verify your account.", "email": "alice@example.com" }
```

**POST /auth/register** — *phone account*
```json
// Request body
{ "name": "Alice", "phone": "+15555550100", "password": "secret123" }

// 201 Response
{ "message": "OTP sent to your phone number", "requiresPhoneVerification": true, "userId": "64a1..." }
```

> Either `email` or `phone` is required. Password rules: minimum 8 characters, must contain at least one letter and one number. If a placeholder user already exists for this contact, it is **promoted in place** (same `_id`, history preserved).

**POST /auth/login**
```json
// Request body
{ "email": "alice@example.com", "password": "secret123" }

// 200 Response
{
  "token": "eyJhbGci...",
  "user": { "id": "64a1...", "name": "Alice", "email": "alice@example.com", "phone": null }
}
```

**POST /auth/login-phone**
```json
// Request body
{ "phone": "+15555550100", "password": "secret123" }

// 200 Response — verified
{ "token": "eyJhbGci...", "user": { "id": "64a1...", "name": "Alice", "email": null, "phone": "+15555550100" } }

// 200 Response — phone not yet verified
{ "requiresPhoneVerification": true, "phone": "+15555550100", "message": "Please verify your phone number." }
```

**POST /auth/send-phone-otp**
```json
// Request body
{ "phone": "+15555550100" }

// 200 Response
{ "message": "OTP sent successfully", "remainingResends": 2 }
```

> OTPs expire after 10 minutes. Resends are capped at 3; exceeding the cap blocks new OTPs for 24 hours.

**POST /auth/verify-phone-otp**
```json
// Request body
{ "phone": "+15555550100", "otp": "123456" }

// 200 Response
{
  "message": "Phone verified successfully",
  "token": "eyJhbGci...",
  "user": { "id": "64a1...", "name": "Alice", "email": null, "phone": "+15555550100" }
}
```

**POST /auth/google**
```json
// Request body — idToken from Google Sign-In on the client
{ "idToken": "<google-id-token>" }

// 200 Response
{
  "token": "eyJhbGci...",
  "user": { "id": "64a1...", "name": "Alice", "email": "alice@example.com", "phone": null }
}
```

> The id-token is verified with `google-auth-library` against `GOOGLE_WEB_CLIENT_ID` (audience). See [Auth Flow](#-auth-flow).

**POST /auth/apple**
```json
// Request body — name is only sent by Apple on the FIRST authorization
{ "idToken": "<apple-id-token>", "name": "Alice" }

// 200 Response
{
  "token": "eyJhbGci...",
  "user": { "id": "64a1...", "name": "Alice", "email": "alice@example.com", "phone": null }
}
```

> The id-token is verified against Apple's JWKS (`jwks-rsa` + `jsonwebtoken`), checking the `iss` (`https://appleid.apple.com`) and `aud` (`APPLE_BUNDLE_ID`) claims. Apple's private-relay (hidden email) case is supported by matching on the provider id alone.

**GET /auth/me**
```json
// 200 Response
{ "valid": true, "user": { "id": "64a1...", "name": "Alice", "email": "alice@example.com", "phone": null } }
```

**PATCH /auth/me**
```json
// Request body
{ "name": "Alice Smith" }

// 200 Response
{ "valid": true, "user": { "id": "64a1...", "name": "Alice Smith", "email": "alice@example.com", "phone": null } }
```

**POST /auth/forgot-password**
```json
// Request body
{ "email": "alice@example.com" }

// 200 Response (always 200, regardless of whether email exists)
{ "message": "If that email exists, a password reset link has been sent." }
```

**POST /auth/resend-verification**
```json
// Request body
{ "email": "alice@example.com" }

// 200 Response (unknown email — does not reveal existence)
{ "message": "If that email exists, a verification link has been sent." }

// 200 Response (known, unverified account)
{ "message": "Verification email resent. Please check your inbox." }
```

> **Token reuse:** resend-verification **reuses the still-valid outstanding token** and only regenerates a new one if the token is missing or expired — it never invalidates a link that is still good. (Already-verified accounts receive a `400`.)

**POST /users/check-contacts**
```json
// Request body — client uploads SHA-256 hashes, never raw addresses (max 500 each)
{
  "emailHashes": ["3a7bd3e2...", "..."],
  "phoneHashes": ["9c56cc51...", "..."]
}

// 200 Response — registered users whose hashes matched
{
  "registered": [
    { "id": "64c3...", "name": "Bob", "emailHash": "3a7bd3e2...", "phoneHash": null }
  ]
}
```

---

### Group Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/groups/new` | ✅ | Create a group (creator is auto-added as first member and admin) |
| `GET` | `/groups` | ✅ | List all groups the current user belongs to |
| `GET` | `/groups/summary` | ✅ | Groups with net balance and debt preview |
| `GET` | `/groups/:groupId/members` | ✅ | List members (name, email, phone, isPlaceholder) |
| `GET` | `/groups/:groupId/settings` | ✅ | Full group settings (members, emoji, splitType, creator, admin) |
| `POST` | `/groups/:groupId/members` | ✅ | Add a member by userId, email, or phone (any member can add) |
| `DELETE` | `/groups/:groupId/members/:memberId` | ✅ | Remove a member (admin removes others; anyone may remove self; must be settled) |
| `PATCH` | `/groups/:groupId/name` | ✅ | Rename the group (any member) |
| `PATCH` | `/groups/:groupId/emoji` | ✅ | Update group emoji (any member) |
| `PATCH` | `/groups/:groupId/settings/split-type` | ✅ | Change default split type (any member) |
| `PATCH` | `/groups/:groupId/settings/balance-mode` | ✅ | Change balance mode `simplified` \| `pairwise` (admin only) |
| `POST` | `/groups/:groupId/leave` | ✅ | Leave the group (blocked if unsettled balance) |
| `DELETE` | `/groups/:groupId` | ✅ | Delete group (admin only; all balances must be zero) |

**POST /groups/new**
```json
// Request body
{ "name": "Bali Trip 🌴" }

// 201 Response
{
  "id": "64b2...",
  "name": "Bali Trip 🌴",
  "emoji": "🏠",
  "defaultSplitType": "equal",
  "members": ["64a1..."],
  "createdBy": "64a1...",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

**GET /groups/summary**
```json
// 200 Response
[
  {
    "_id": "64b2...",
    "name": "Bali Trip 🌴",
    "emoji": "🏠",
    "defaultSplitType": "equal",
    "balanceMode": "pairwise",
    "createdBy": "64a1...",
    "adminId": "64a1...",
    "balance": { "net": -45.00, "status": "you_owe" },
    "preview": [
      { "userId": "64c3...", "name": "Bob", "amount": 45.00, "direction": "you_pay" }
    ],
    "othersCount": 0
  }
]
```

Balance `status` values: `you_are_owed` | `you_owe` | `settled`

**POST /groups/:groupId/members**
```json
// Request body — provide ONE of userId / email / phone
{ "email": "bob@example.com", "name": "Bob" }

// 200 Response (a placeholder user is created if no account/contact matches)
{
  "message": "Member added successfully",
  "groupId": "64b2...",
  "id": "64c3...",
  "name": "Bob",
  "email": "bob@example.com",
  "phone": null,
  "isPlaceholder": true
}
```

**PATCH /groups/:groupId/settings/split-type**
```json
// Request body — "equal" | "exact" | "percentage"
{ "defaultSplitType": "percentage" }
```

**PATCH /groups/:groupId/settings/balance-mode**
```json
// Request body — "simplified" | "pairwise" (admin only)
{ "balanceMode": "simplified" }

// 200 Response
{ "message": "Balance mode updated", "balanceMode": "simplified" }
```

---

### Expense Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/groups/:groupId/expenses` | ✅ | Create an expense |
| `GET` | `/groups/:groupId/expenses` | ✅ | List expenses (newest first, populated, paginated) |
| `GET` | `/groups/:groupId/balances` | ✅ | Net balances + simplified debts + pairwise debts |
| `PATCH` | `/groups/:groupId/expenses/:expenseId` | ✅ | Update an expense (settlements & settled-cycle items blocked) |
| `DELETE` | `/groups/:groupId/expenses/:expenseId` | ✅ | Delete an expense (settled-cycle items blocked) |
| `POST` | `/groups/:groupId/settle` | ✅ | Record a settlement between two members |
| `PATCH` | `/groups/:groupId/settlements/:expenseId` | ✅ | Update settlement amount |
| `GET` | `/groups/:groupId/settlements/:expenseId/max` | ✅ | Get max allowed amount for a settlement edit |

**POST /groups/:groupId/expenses — Equal split**
```json
{
  "description": "Dinner",
  "amount": 120.00,
  "paidBy": "64a1...",
  "splitType": "equal",
  "splits": [
    { "user": "64a1..." },
    { "user": "64c3..." },
    { "user": "64d4..." }
  ]
}
```

**POST /groups/:groupId/expenses — Percentage split**
```json
{
  "description": "Hotel",
  "amount": 300.00,
  "paidBy": "64a1...",
  "splitType": "percentage",
  "splits": [
    { "user": "64a1...", "percentage": 50 },
    { "user": "64c3...", "percentage": 30 },
    { "user": "64d4...", "percentage": 20 }
  ]
}
```

**POST /groups/:groupId/expenses — Exact split**
```json
{
  "description": "Groceries",
  "amount": 85.50,
  "paidBy": "64c3...",
  "splitType": "exact",
  "splits": [
    { "user": "64a1...", "amount": 40.00 },
    { "user": "64c3...", "amount": 45.50 }
  ]
}
```

**GET /groups/:groupId/expenses** — paginated via `?page=1&limit=25`
```json
// 200 Response
{
  "count": 1,
  "total": 1,
  "page": 1,
  "hasMore": false,
  "expenses": [ { "_id": "64f6...", "description": "Dinner", "amount": 120.00, "...": "..." } ]
}
```

**GET /groups/:groupId/balances**
```json
// 200 Response
{
  "balances": [
    { "userId": "64a1...", "name": "Alice", "net": 75.00 },
    { "userId": "64c3...", "name": "Bob",   "net": -75.00 }
  ],
  "settlements": [
    { "from": "64c3...", "fromName": "Bob", "to": "64a1...", "toName": "Alice", "amount": 75.00 }
  ],
  "pairwise": [
    { "from": "64c3...", "fromName": "Bob", "to": "64a1...", "toName": "Alice", "amount": 75.00 }
  ],
  "balanceMode": "pairwise"
}
```

> `balances` lists only current members. If the displayed net balances do not sum to zero, that indicates an **orphaned balance** left behind by a member who departed while still holding a non-zero net (see [Security](#-security)).

**POST /groups/:groupId/settle**
```json
// Request body
{ "to": "64a1...", "amount": 75.00 }

// 201 Response
{ "message": "Settlement recorded successfully", "settlement": { ... } }
```

---

### Friend Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/friends` | ✅ | Combined list: explicit friends + group contacts, with cross-group balance |
| `POST` | `/friends` | ✅ | Add a friend by email (must be a registered account) |
| `POST` | `/friends/add-by-id` | ✅ | Add a friend by user id (e.g. after `check-contacts`) |
| `POST` | `/friends/invite` | ✅ | Invite a non-user by name + email/phone (creates a placeholder) |
| `DELETE` | `/friends/:friendId` | ✅ | Remove an explicit friend |

**GET /friends**
```json
// 200 Response
[
  {
    "id": "64c3...",
    "name": "Bob",
    "email": "bob@example.com",
    "phone": null,
    "isPlaceholder": false,
    "isExplicitFriend": true,
    "isGroupContact": true,
    "balance": { "net": -45.00, "status": "you_owe" }
  }
]
```

Balance `status` values: `you_are_owed` | `you_owe` | `settled`. Results are sorted: unsettled balances first, then alphabetically by name.

**POST /friends**
```json
// Request body
{ "email": "bob@example.com" }

// 201 Response
{ "message": "Friend added successfully", "friend": { "id": "64c3...", "name": "Bob", "email": "bob@example.com", "phone": null, "isPlaceholder": false } }
```

**POST /friends/add-by-id**
```json
// Request body
{ "userId": "64c3..." }

// 201 Response
{ "message": "Friend added successfully", "friend": { "id": "64c3...", "name": "Bob", "email": "bob@example.com", "phone": null, "isPlaceholder": false } }
```

**POST /friends/invite**
```json
// Request body — name plus phone and/or email
{ "name": "Carol", "phone": "+15555550199" }

// 201 Response (creates/reuses a placeholder user, links bidirectionally)
{ "message": "Invitation created", "friend": { "id": "64e7...", "name": "Carol", "email": null, "phone": "+15555550199", "isPlaceholder": true } }
```

---

### Activity Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/activity` | ✅ | Paginated activity feed across all user's groups |

**Query parameters:** `page` (default `1`), `limit` (default `30`)

**GET /activity?page=1&limit=30**
```json
// 200 Response
{
  "activities": [
    {
      "_id": "64e5...",
      "type": "expense_added",
      "actorName": "Alice",
      "groupName": "Bali Trip 🌴",
      "metadata": { "description": "Dinner", "amount": 120.00 },
      "createdAt": "2024-01-15T19:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 30,
    "total": 45,
    "hasMore": true
  }
}
```

**Activity types:** `expense_added` | `expense_updated` | `expense_deleted` | `settlement_made` | `member_added` | `member_removed` | `group_created` | `group_renamed` | `group_left` | `group_deleted`

---

## 🔐 Auth Flow

Four sign-in methods converge on the same 7-day JWT session.

```
┌──────────────┐
│    Client    │
│              │   ── EMAIL ───────────────────────────────────────────────
│              │     POST /auth/register      ┌──────────────────┐
│              │ ──────────────────────────→  │  Create/promote  │
│              │  ←── 201 { message, email }  │  user; email via │
│              │                              │     Resend       │
│              │   GET /auth/verify/:token    └──────────────────┘
│              │ ──────────────────────────→  ┌──────────────────┐
│              │  ←── HTML success page       │  Mark isVerified │
│              │     POST /auth/login         └──────────────────┘
│              │ ──────────────────────────→  ┌──────────────────┐
│              │  ←── 200 { token, user }     │ password+verify  │
│              │                              └──────────────────┘
│              │
│              │   ── PHONE ───────────────────────────────────────────────
│              │     POST /auth/register (phone)   → SMS OTP (Twilio)
│              │     POST /auth/verify-phone-otp   ┌──────────────────┐
│              │ ──────────────────────────────→   │ check OTP +      │
│              │  ←── 200 { token, user }          │ mark verified    │
│              │     POST /auth/login-phone         └──────────────────┘
│              │
│              │   ── GOOGLE ──────────────────────────────────────────────
│              │     POST /auth/google { idToken } ┌──────────────────────┐
│              │ ──────────────────────────────→   │ verifyGoogleToken:   │
│              │  ←── 200 { token, user }          │ google-auth-library  │
│              │                                   │ audience = WEB ID    │
│              │                                   └──────────┬───────────┘
│              │   ── APPLE ───────────────────────────────── │ ───────────
│              │     POST /auth/apple { idToken }  ┌──────────▼───────────┐
│              │ ──────────────────────────────→   │ verifyAppleToken:    │
│              │  ←── 200 { token, user }          │ JWKS (jwks-rsa) +    │
│              │                                   │ iss/aud checks       │
│              │                                   └──────────┬───────────┘
│              │                                              │
│              │                                   ┌──────────▼───────────┐
│              │                                   │ resolveSocialUser:   │
│              │                                   │ match by providerId  │
│              │                                   │ → or email → link;   │
│              │                                   │ promote placeholder; │
│              │                                   │ else create; sign JWT│
│              │                                   └──────────────────────┘
│              │
│              │   ── PASSWORD RESET ──────────────────────────────────────
│              │     POST /auth/forgot-password → reset email (1h token)
│              │     GET  /auth/reset-password?token=...  → HTML form
│              │     POST /auth/reset-password (form)      → new password
└──────────────┘
```

**Social verification seam (`utils/social_verify.js`)**

- **Google** — `verifyGoogleToken` uses `google-auth-library`'s `OAuth2Client.verifyIdToken`, with the **audience pinned to `GOOGLE_WEB_CLIENT_ID`**, then maps the verified payload to a normalized profile (`{ provider, providerId, email, emailVerified, name }`).
- **Apple** — `verifyAppleToken` fetches Apple's public signing keys from the **JWKS endpoint** (`jwks-rsa`), verifies the token signature with `jsonwebtoken`, and asserts the `iss` (`https://appleid.apple.com`) and `aud` (`APPLE_BUNDLE_ID`) claims.
- **Account resolution (`utils/social_auth.helper.js`)** — `resolveSocialUser` looks up an account by `providerId` (`googleId` / `appleId`); failing that, by email, in which case it **links** the social id onto the existing account. A matching **placeholder** user is **promoted** in place. If nothing matches, a new account is created. Apple private-relay logins (no email) are matched by provider id only.

| Token | Expiry | Storage |
|---|---|---|
| Email verification | 24 hours | `verificationToken` field (excluded from default queries) — reused on resend while still valid |
| Phone OTP | 10 minutes | `phoneOtp` / `phoneOtpExpiry` (max 3 resends, then 24h block) |
| Password reset | 1 hour | `passwordResetToken` field (excluded from default queries) |
| JWT session | 7 days | Client-side only — no server-side revocation |

### User model & placeholder unification

`models/user.js` (verify against source) holds, among others:

| Field | Notes |
|---|---|
| `name` | required |
| `email` | optional, lowercased; **partial unique index** (only enforced when a string is present) |
| `phone` | optional; **partial unique index** |
| `password` | `select: false`; **not required** for social or placeholder accounts |
| `emailHash` / `phoneHash` | SHA-256 of normalized contact, for privacy-preserving matching |
| `googleId` / `appleId` | social provider subject ids used by `resolveSocialUser` |
| `isPlaceholder` | `true` for non-registered people referenced in groups/invites |
| `isVerified` / `verificationToken` / `verificationTokenExpiry` | email verification |
| `phoneOtp` / `phoneOtpExpiry` / `isPhoneVerified` | phone verification |
| `passwordResetToken` / `passwordResetTokenExpiry` | reset flow |
| `friends` | array of user ids |

**Placeholder users** let you split with people who haven't signed up: when you add someone by email/phone to a group (or invite them), a `User` with `isPlaceholder: true` is created (or reused via `emailHash` / `phoneHash`). When that person later registers or signs in socially, the existing placeholder is **promoted-or-created** — the same document is upgraded in place, keeping its `_id` so all group membership, expenses, and balances remain intact. The partial unique indexes on `email` / `phone` allow many placeholders without a contact while still preventing duplicate real accounts.

---

## ☁️ Deployment

The API is deployed on **Railway** with a **MongoDB Atlas** database.

**Railway setup:**
1. Connect your GitHub repository to Railway
2. Railway auto-detects Node.js and runs `npm start`
3. Add all environment variables in the Railway dashboard under **Variables** (including the Google/Apple and Twilio keys)
4. Railway provides a public domain — set this as `APP_URL`

**MongoDB Atlas setup:**
1. Create a free cluster on [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Add a database user and whitelist Railway's IP (or use `0.0.0.0/0` for all IPs)
3. Copy the SRV connection string into `MONGO_URI`

**Start command** (used by Railway):
```bash
npm start
# → node src/server.js
```

**Dev command** (local, uses Node.js watch mode):
```bash
npm run dev
# → node --watch src/server.js
```

---

## 🛡 Security

| Feature | Implementation |
|---|---|
| Password hashing | `bcryptjs` with 10 salt rounds via Mongoose pre-save hook |
| JWT authentication | 7-day signed tokens; `protect` middleware verifies every authenticated request |
| Social token verification | Google id-tokens verified against `GOOGLE_WEB_CLIENT_ID` (audience); Apple id-tokens verified via Apple's JWKS with `iss`/`aud` checks |
| Privacy-preserving contacts | Clients send SHA-256 `emailHash` / `phoneHash`; raw contact data is never required for matching |
| Phone OTP abuse protection | 6-digit OTP, 10-minute expiry, max 3 resends, then a 24-hour block |
| Input validation | Zod schemas on request bodies; structured 400 errors with field-level messages |
| Rate limiting | 10 requests / 15 minutes on auth routes (register, login, phone login/OTP, Google, Apple, forgot-password) |
| Email enumeration prevention | Forgot-password and resend-verification responses do not reveal whether an email exists |
| Verification token reuse | Resend reuses a still-valid verification token and only regenerates if missing/expired — outstanding links stay valid |
| Secure token generation | `crypto.randomBytes(32)` for verification and password reset tokens |
| Password strength enforcement | Minimum 8 characters, must contain at least one letter and one number |
| Integer-cent balances | All balances are computed in integer cents; "settled" means `Math.abs(net) < 1` cent, and leave/remove/delete guards block when `Math.abs(net) >= 1`. A non-zero sum of current-member balances signals an orphaned departed-member balance |
| Balance-gated deletions | Account deletion and group leaving are blocked if the user has unsettled balances |
| Member-gated mutations | All group and expense operations verify the requesting user is a group member |
| Admin-only destructive ops | Removing other members, deleting groups, and changing balance mode are restricted to the group admin |
| Field exclusion by default | `password`, `verificationToken`, and `passwordResetToken` are excluded from all queries unless explicitly selected |

---

## 🗺 Roadmap

- [x] Phone number + SMS OTP authentication
- [x] Google Sign-In (OAuth)
- [x] Sign in with Apple
- [x] Privacy-preserving contact matching (hashed email/phone)
- [x] Invite non-users via placeholder accounts
- [ ] Push notifications for new expenses and settlements
- [ ] Expense categories and tagging
- [ ] Multi-currency support with exchange rates
- [ ] Recurring expense templates
- [ ] Group invites via shareable link (bypass contact-lookup requirement)
- [ ] Expense receipts / photo attachments
- [ ] Export group history as CSV or PDF
- [ ] JWT refresh tokens and server-side revocation

---

👨‍💻 **Author:** Safyian Mughal — Backend & Flutter Developer

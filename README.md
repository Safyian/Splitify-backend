# 💸 Splitify API

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

Splitify is a REST API backend for a mobile expense-splitting app. Users register, join groups, add shared expenses split by equal, exact, or percentage amounts, settle debts between each other, and track an activity feed of everything that happened inside their groups.

The API is consumed by a Flutter mobile client and deployed on Railway with a MongoDB Atlas database.

---

## ✨ Features

- **Authentication** — JWT-based auth (7-day tokens) with email verification gate before login
- **Password Reset** — Secure forgot-password flow via tokenized email link (1-hour expiry), rendered as a server-side HTML form
- **Groups** — Create groups, add/remove members, set emoji, rename, configure default split type, leave or delete
- **Expenses** — Add, edit, and delete expenses with equal, exact, or percentage splits
- **Debt Simplification** — Greedy algorithm reduces N-way debts to the minimum number of transactions
- **Settlements** — Record payments between members stored as special expense documents
- **Balance Tracking** — Per-group net balances, simplified debts, and pairwise direct debts
- **Friends** — Explicit friend list auto-merged with group contacts; each entry shows cross-group net balance
- **Activity Feed** — Append-only audit log of all mutations, paginated, sorted newest-first
- **Cent-based arithmetic** — All money math uses integer cents internally to avoid floating-point drift
- **Rate Limiting** — Auth endpoints limited to 10 requests per 15 minutes
- **Input Validation** — Zod schemas on every request body; returns structured 400 errors
- **Email Enumeration Prevention** — Forgot-password and resend-verification always return 200 regardless of whether the email exists
- **Safe Account Deletion** — Blocks delete if the user has unsettled balances in any group

---

## 🛠 Tech Stack

| Package | Version | Purpose |
|---|---|---|
| `express` | ^5.2.1 | HTTP framework |
| `mongoose` | ^9.1.5 | MongoDB ODM |
| `bcryptjs` | ^3.0.3 | Password hashing (10 rounds) |
| `jsonwebtoken` | ^9.0.3 | JWT signing and verification |
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
│   ├── user.js                 User schema — bcrypt pre-save hook, token generation methods
│   ├── group.js                Group schema — members, emoji, defaultSplitType, settledAt
│   ├── expense.js              Expense schema — also used for settlements
│   └── activity.js             Activity log schema — denormalised for fast reads
│
├── controllers/
│   ├── auth.controller.js      register, login, logout, getMe, updateMe, deleteMe,
│   │                           verifyEmail, resendVerification, forgotPassword,
│   │                           showResetForm, resetPassword
│   ├── user.controller.js      Legacy CRUD (not part of the main auth flow)
│   ├── groups.controller.js    createGroup, getMyGroups, getGroupsSummary, addMemberToGroup,
│   │                           leaveGroup, getGroupMembers, getGroupSettings, renameGroup,
│   │                           updateGroupEmoji, updateDefaultSplitType, removeMemberFromGroup,
│   │                           deleteGroup
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
│   └── validate.middleware.js  validate(schema) — runs Zod parse, returns 400 on failure
│
├── utils/
│   ├── asyncHandler.js         Wraps async route handlers so errors reach the error middleware
│   ├── token.js                generateToken(id) — signs a 7-day JWT
│   ├── splits.js               calculateEqualSplits, calculatePercentageSplits, calculateExactSplits
│   ├── balance.js              calculateGroupBalances (net cents per member), simplifyDebts
│   ├── activity.helper.js      logActivity() — fire-and-forget, never throws
│   └── email.helper.js         sendVerificationEmail, sendPasswordResetEmail via Resend API
│
└── validators/
    ├── user.validator.js        registerSchema, loginSchema, forgotPasswordSchema (Zod)
    └── expense.validator.js     validateExpenseInput, validateGroupMembers, validatePercentages,
                                 validateExactSplits
```

---

## 🔑 Environment Variables

Create a `.env` file in the project root. Never commit it.

| Variable | Description |
|---|---|
| `PORT` | Server port. Defaults to `8080` if not set |
| `MONGO_URI` | MongoDB connection string (e.g. MongoDB Atlas SRV URI) |
| `JWT_SECRET` | Secret used to sign and verify JWTs — use a long random string |
| `APP_URL` | Base URL of this server (e.g. `https://your-api.railway.app`). Used to build email links |
| `RESEND_API_KEY` | API key from [Resend](https://resend.com) for sending transactional email |

---

## 🚀 Running Locally

```bash
# 1. Clone the repository
git clone https://github.com/Safyian/Splitify-backend.git
cd Splitify-backend

# 2. Install dependencies
npm install

# 3. Create your environment file
cp .env.example .env
# Fill in all required variables in .env

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
| `POST` | `/auth/register` | — | 10/15 min | Register a new account |
| `POST` | `/auth/login` | — | 10/15 min | Login and receive a JWT |
| `POST` | `/auth/logout` | — | — | Stateless logout (client discards token) |
| `GET` | `/auth/me` | ✅ | — | Get current user profile |
| `PATCH` | `/auth/me` | ✅ | — | Update display name |
| `DELETE` | `/auth/me` | ✅ | — | Delete account (blocked if unsettled balances exist) |
| `GET` | `/auth/verify-email` | — | — | Verify email from link (returns HTML page) |
| `POST` | `/auth/resend-verification` | — | — | Resend verification email |
| `POST` | `/auth/forgot-password` | — | 10/15 min | Request a password reset email |
| `GET` | `/auth/reset-password` | — | — | Show password reset form (returns HTML) |
| `POST` | `/auth/reset-password` | — | — | Submit new password via form |

**POST /auth/register**
```json
// Request body
{ "name": "Alice", "email": "alice@example.com", "password": "secret123" }

// 201 Response
{ "message": "Account created. Please check your email to verify your account.", "email": "alice@example.com" }
```

> Password rules: minimum 8 characters, must contain at least one letter and one number.

**POST /auth/login**
```json
// Request body
{ "email": "alice@example.com", "password": "secret123" }

// 200 Response
{
  "token": "eyJhbGci...",
  "user": { "id": "64a1...", "name": "Alice", "email": "alice@example.com" }
}
```

**GET /auth/me**
```json
// 200 Response
{ "valid": true, "user": { "id": "64a1...", "name": "Alice", "email": "alice@example.com" } }
```

**PATCH /auth/me**
```json
// Request body
{ "name": "Alice Smith" }

// 200 Response
{ "valid": true, "user": { "id": "64a1...", "name": "Alice Smith", "email": "alice@example.com" } }
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

// 200 Response (always 200 to prevent email enumeration)
{ "message": "If that email exists, a verification link has been sent." }
```

---

### Group Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/groups/new` | ✅ | Create a group (creator is auto-added as first member) |
| `GET` | `/groups` | ✅ | List all groups the current user belongs to |
| `GET` | `/groups/summary` | ✅ | Groups with net balance and pairwise debt preview |
| `GET` | `/groups/:groupId/members` | ✅ | List members with name and email |
| `GET` | `/groups/:groupId/settings` | ✅ | Full group settings (members, emoji, splitType, creator) |
| `POST` | `/groups/:groupId/members` | ✅ | Add a member by email (any member can add) |
| `DELETE` | `/groups/:groupId/members/:memberId` | ✅ | Remove a member (creator only; member must be settled) |
| `PATCH` | `/groups/:groupId/name` | ✅ | Rename the group (any member) |
| `PATCH` | `/groups/:groupId/emoji` | ✅ | Update group emoji (any member) |
| `PATCH` | `/groups/:groupId/settings/split-type` | ✅ | Change default split type (any member) |
| `POST` | `/groups/:groupId/leave` | ✅ | Leave the group (blocked if unsettled balance) |
| `DELETE` | `/groups/:groupId` | ✅ | Delete group (creator only; all balances must be zero) |

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
    "createdBy": "64a1...",
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
// Request body
{ "email": "bob@example.com" }

// 200 Response
{ "message": "Member added successfully", "groupId": "64b2...", "memberId": "64c3..." }
```

**PATCH /groups/:groupId/settings/split-type**
```json
// Request body — "equal" | "exact" | "percentage"
{ "defaultSplitType": "percentage" }
```

---

### Expense Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/groups/:groupId/expenses` | ✅ | Create an expense |
| `GET` | `/groups/:groupId/expenses` | ✅ | List all expenses (newest first, populated) |
| `GET` | `/groups/:groupId/balances` | ✅ | Net balances + simplified debts + pairwise debts |
| `PATCH` | `/groups/:groupId/expenses/:expenseId` | ✅ | Update an expense (settlements blocked) |
| `DELETE` | `/groups/:groupId/expenses/:expenseId` | ✅ | Delete an expense |
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
  ]
}
```

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
| `GET` | `/friends` | ✅ | Get combined list: explicit friends + group contacts, with cross-group balance |
| `POST` | `/friends` | ✅ | Add a friend by email |
| `DELETE` | `/friends/:friendId` | ✅ | Remove an explicit friend |

**GET /friends**
```json
// 200 Response
[
  {
    "id": "64c3...",
    "name": "Bob",
    "email": "bob@example.com",
    "isExplicitFriend": true,
    "isGroupContact": true,
    "balance": { "net": -45.00, "status": "you_owe" }
  }
]
```

Balance `status` values: `you_are_owed` | `you_owe` | `settled`

Results are sorted: unsettled balances first, then alphabetically by name.

**POST /friends**
```json
// Request body
{ "email": "bob@example.com" }

// 201 Response
{ "message": "Friend added successfully", "friend": { "id": "64c3...", "name": "Bob", "email": "bob@example.com" } }
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

**Activity types:** `expense_added` | `expense_updated` | `settlement_made` | `member_added` | `member_removed` | `group_created` | `group_renamed` | `group_left` | `group_deleted`

---

## 🔐 Auth Flow

```
┌──────────────┐     POST /auth/register      ┌──────────────────┐
│    Client    │ ──────────────────────────→  │   Create User    │
│              │  ←── 201 { message, email }  │  Send Email via  │
│              │                              │     Resend       │
│              │                              └──────────────────┘
│              │
│              │  User clicks link in email
│              │  GET /auth/verify-email?token=...
│              │ ──────────────────────────→  ┌──────────────────┐
│              │  ←── HTML success page       │  Mark isVerified │
│              │      deep-links to app       │  Clear token     │
│              │                              └──────────────────┘
│              │
│              │     POST /auth/login          ┌──────────────────┐
│              │ ──────────────────────────→  │  Verify password │
│              │  ←── 200 { token, user }     │  Check isVerified│
│              │                              │  Return JWT      │
│              │                              └──────────────────┘
│              │
│              │  POST /auth/forgot-password   ┌──────────────────┐
│              │ ──────────────────────────→  │  Generate token  │
│              │  ←── 200 { message }         │  Send reset email│
│              │                              └──────────────────┘
│              │
│              │  User clicks link in email
│              │  GET /auth/reset-password?token=...
│              │ ──────────────────────────→  ┌──────────────────┐
│              │  ←── HTML form page          │  Validate token  │
│              │                              │  Show form       │
│              │                              └──────────────────┘
│              │
│              │  POST /auth/reset-password (form submit)
│              │ ──────────────────────────→  ┌──────────────────┐
│              │  ←── HTML success page       │  Hash new pass   │
└──────────────┘      deep-links to app       │  Clear token     │
                                              └──────────────────┘
```

| Token | Expiry | Storage |
|---|---|---|
| Email verification | 24 hours | `verificationToken` field (excluded from default queries) |
| Password reset | 1 hour | `passwordResetToken` field (excluded from default queries) |
| JWT session | 7 days | Client-side only — no server-side revocation |

---

## ☁️ Deployment

The API is deployed on **Railway** with a **MongoDB Atlas** database.

**Railway setup:**
1. Connect your GitHub repository to Railway
2. Railway auto-detects Node.js and runs `npm start`
3. Add all environment variables in the Railway dashboard under **Variables**
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
| Input validation | Zod schemas on all request bodies; structured 400 errors with field-level messages |
| Rate limiting | 10 requests per 15 minutes on `/auth/register`, `/auth/login`, `/auth/forgot-password` |
| Email enumeration prevention | Forgot-password and resend-verification always return `200` regardless of whether the email exists |
| Secure token generation | `crypto.randomBytes(32)` for verification and password reset tokens |
| Password strength enforcement | Minimum 8 characters, must contain at least one letter and one number |
| Balance-gated deletions | Account deletion and group leaving are blocked if the user has unsettled balances |
| Member-gated mutations | All group and expense operations verify the requesting user is a group member |
| Creator-only destructive ops | Removing members and deleting groups are restricted to the group creator |
| Field exclusion by default | `password`, `verificationToken`, and `passwordResetToken` are excluded from all queries unless explicitly selected |

---

## 🗺 Roadmap

- [ ] Push notifications for new expenses and settlements
- [ ] Expense categories and tagging
- [ ] Multi-currency support with exchange rates
- [ ] Recurring expense templates
- [ ] Group invites via shareable link (bypass email-lookup requirement)
- [ ] OAuth login (Google)
- [ ] Expense receipts / photo attachments
- [ ] Export group history as CSV or PDF
- [ ] JWT refresh tokens and server-side revocation

---

👨‍💻 **Author:** Safyian Mughal — Backend & Flutter Developer

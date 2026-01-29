# Splitify Backend 🧾💸

Splitify is a backend API for an expense-sharing application (similar to Splitwise) that helps groups track shared expenses, calculate splits, and manage who owes whom.

This repository contains the **backend service**, built with **Node.js, Express, MongoDB, and JWT authentication**, following clean architecture and REST best practices.

---

## 🚀 Features

### 🔐 Authentication
- User registration with email & password
- User login with JWT authentication
- Secure protected routes using middleware
- Stateless authentication (single JWT, no refresh tokens)

### 👥 Groups
- Create a group
- Automatically add creator as a group member
- Fetch all groups the logged-in user belongs to
- Add members to a group using email

### 💸 Expenses
- Create expenses within a group
- Track who paid for an expense
- Split expenses equally among group members
- Strong backend validation to prevent invalid or duplicate splits

### 🧱 Architecture
- Clean separation of concerns:
  - Routes
  - Controllers
  - Models
  - Middleware
- REST-compliant API design
- Centralised error handling
- ES Modules (`type: module`)

---

## 🛠️ Tech Stack

- **Node.js**
- **Express.js**
- **MongoDB & Mongoose**
- **JWT (jsonwebtoken)**
- **bcryptjs** (password hashing)
- **ES Modules**
- **Git & GitHub**

---

## 📂 Project Structure

src/
├── app.js
├── server.js
├── config/
│ └── db.js
├── controllers/
│ ├── auth.controller.js
│ ├── user.controller.js
│ ├── groups.controller.js
│ └── expenses.controller.js
├── middleware/
│ ├── auth.middleware.js
│ ├── error.middleware.js
│ └── validate.middleware.js
├── models/
│ ├── user.js
│ ├── group.js
│ └── expense.js
├── routes/
│ ├── auth.routes.js
│ ├── user.routes.js
│ ├── groups.routes.js
│ └── expenses.routes.js
├── utils/
│ ├── asyncHandler.js
│ └── token.js
└── validators/
└── user.validator.js


---

## 🔑 Authentication Flow

1. User registers or logs in
2. Backend returns a JWT
3. JWT is sent via `Authorization: Bearer <token>`
4. Protected routes validate the token using middleware

---

## 📌 API Overview

### Auth
POST /auth/register
POST /auth/login
POST /auth/logout (soft logout)

### Users
GET /users/me

### Groups
POST /groups
GET /groups
POST /groups/:groupId/members

### Expenses
POST /groups/:groupId/expenses

---

## ⚙️ Getting Started (Local Setup)

### 1️⃣ Clone the repository
```bash
git clone https://github.com/Safyian/Splitify-backend.git
cd Splitify-backend

Install dependencies
npm install

Create environment variables
Create a .env file in the root:
PORT=3000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key

Run the Server 
npm run dev

Server will start on:
http://localhost:3000

🧪 API Testing

You can test the APIs using:

Postman

Insomnia

Thunder Client (VS Code)

All protected routes require:
Authorization: Bearer <JWT_TOKEN>

🚧 Roadmap (Upcoming Features)

Fetch group expenses

Balance calculation (who owes whom)

Settle up logic

Invitation system for non-registered users

Flutter mobile app integration

Notifications & reminders

📈 Learning Outcomes

This project demonstrates:

Real-world backend architecture

Secure authentication design

RESTful API principles

Data integrity & validation

Git & GitHub workflow

👨‍💻 Author

Safyian Mughal
Backend & Flutter Developer

📄 License

This project is for learning and portfolio purposes.


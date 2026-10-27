# Group Expense Splitter (Splitwise-style) - Implementation Plan

## Overview
A production-grade, full-stack group expense splitting web application with mathematically exact integer-paise calculations, optimal debt settlement algorithms, role-based access control, real-time activity auditing, multi-currency support, and a responsive mobile-first UI.

---

## Phases & Execution Strategy

### Phase 1: Project Scaffolding & Database Schema
- [x] Initial plan and repository structure setup (`PLAN.md`, `.gitignore`, `.env.example`, `docker-compose.yml`)
- [x] Root `package.json` with workspace orchestration scripts
- [x] Backend setup in `/server`: TypeScript, Express, Prisma ORM, CORS, Helmet, Morgan, Zod, Vitest, Supertest
- [x] Prisma schema with models: `User`, `Group`, `GroupMember`, `Expense`, `ExpenseSplit`, `Payment`, `Activity`
- [x] Configure SQLite as local zero-config database (with Docker Postgres option via `docker-compose.yml`)
- [x] Prisma migration / db push, client generation, and sanity verification
- [x] Git commit: `chore: scaffold monorepo and database schema`

### Phase 2: Core Pure Logic Modules & Unit Tests (TDD)
- [x] `server/src/lib/money.ts`:
  - Zero float arithmetic; all money represented as integer paise (Int/BigInt)
  - `parseRupeesToPaise(str)`: handles string parsing, rejects negative numbers, >2 decimals, and malformed characters
  - `formatINR(paise)`: formats to Indian Rupee standard format (e.g., `₹1,200.50`)
- [x] `server/src/lib/splits.ts`:
  - Pure split computation: EQUAL, EXACT, PERCENT
  - Largest-remainder algorithm (Hare-Niemeyer / Hamilton method) ensuring `sum(shares) === totalPaise` deterministically
  - Handling edge cases (e.g., 100 paise split 3 ways, 1 paise split 3 ways, basis-point percent splits)
- [x] `server/src/lib/settle.ts`:
  - Net balance derivation: `net[user] = paid - owed + sent - received` with `sum(net) === 0` invariant assertion
  - Greedy min-cash-flow algorithm (at most N-1 transactions)
  - Optimal settlement: Zero-sum subset partition using Bitmask Dynamic Programming for N <= 12, falling back to greedy for N > 12. Explanation of NP-hard subset-sum trade-offs in comments and README.
- [x] Comprehensive unit test suite in `server/tests/unit/`:
  - Money parsing/formatting
  - Equal split remainder distribution (100 paise, 1 paise, large amounts)
  - Percent split rounding & invalid sum rejection
  - Exact split sum validation
  - Property-based test with 250 random iterations verifying `sum(net) === 0`
  - Settle-up tests: 2-person, 3-person chain collapse, bitmask DP vs greedy proof, zero balance idempotency
- [x] Git commit: `test: implement core money, split, and settle algorithms with comprehensive test suite`

### Phase 3: Authentication & Group Management APIs
- [x] Express middleware & utilities:
  - Zod validation middleware validating `body`, `params`, and `query` returning `{ error: { code, message, fields? } }`
  - Global error handler and standardized HTTP error classes (400, 401, 403, 404, 409, 500)
  - JWT token generation & verification (Bearer token + Cookie support), bcrypt password hashing
  - `requireAuth` and `requireGroupMember` middleware
  - Health check endpoint `GET /health`
- [x] Auth endpoints (`/api/auth`):
  - `POST /register`, `POST /login`, `POST /logout`, `GET /me`
  - Rate limiting on auth routes
- [x] Groups endpoints (`/api/groups`):
  - `POST /`: create group (creator is OWNER)
  - `GET /`: list my groups with computed net balance per group
  - `GET /:id`: group details, members, and roles
  - `POST /:id/members`: add member by email with clear 404 if not registered, 409 if already member
- [x] Tests for Auth & Groups (`server/tests/integration/api.test.ts`)
- [x] Git commit: `feat: implement authentication and group management endpoints with tests`

### Phase 4: Expense Management, Balances, Settle-Up & Activity APIs
- [x] Expense endpoints (`/api/groups/:id/expenses`):
  - `POST /`: create expense (EQUAL, EXACT, PERCENT) with validation and activity recording in a single Prisma transaction
  - `GET /`: list expenses with splits, paidBy info, active exchange rates
  - `PUT /:expenseId`: update expense (only creator or group owner), recomputing splits and updating activity in transaction
  - `DELETE /:expenseId`: soft delete (`deletedAt`), activity recorded
- [x] Balances & Settlement endpoints:
  - `GET /api/groups/:id/balances`: net balance per member in paise derived dynamically
  - `GET /api/groups/:id/settlements`: optimal settlement plan
  - `POST /api/groups/:id/payments`: record settlement payment (validates members, from != to, amount > 0, warning if exceeding debt)
  - `GET /api/groups/:id/payments`: list recorded payments
- [x] Activity endpoint:
  - `GET /api/groups/:id/activity`: paginated audit log, newest first
- [x] Integration tests covering expense creation, splits, update, soft delete, balance restoration, payment application
- [x] Git commit: `feat: implement expenses, balances, payments, and activity audit log with integration tests`

### Phase 5: Mobile-First Frontend Application
- [x] React + Vite + TypeScript setup in `/client`
- [x] Tailwind CSS configuration with custom theme tokens, modern typography (Inter), glassmorphism, responsive utilities
- [x] TanStack React Query + React Router v6 setup, Axios API client with token interceptor and consistent error toasts
- [x] Reusable components:
  - Navbar, Avatar, Badges, Modals, Confirm Dialogs, Skeletons, Form controls
  - Money formatting utilities (`formatINR`, `parseRupeesToPaise`)
- [x] Pages & Views:
  - Auth: Login & Register with clear inline validation errors
  - Groups List: Dashboard displaying group cards with color-coded net balances (green/red) and quick stats
  - Group Detail Tabs:
    - **Expenses Tab**: searchable list, user's share indicator, edit/delete actions
    - **Add/Edit Expense Modal**: live preview of individual shares in rupees, live remaining balance indicator, split type segmented control, multi-currency conversion preview
    - **Balances Tab**: member breakdown ("gets back ₹X" vs "owes ₹X"), visual bar indicators
    - **Settle Up Tab**: minimal settlement transactions ("A pays B ₹X") with one-click "Record Payment" modal and payment history
    - **Activity Tab**: chronological audit events with relative timestamps
    - **Add Member Modal**: email search with clear error messaging
- [x] Mobile-first responsive optimization down to 360px viewport without horizontal scroll
- [x] Git commit: `feat: build modern mobile-first frontend with real-time balance calculations`

### Phase 6: Seed Script, Multi-Currency Stretch, Documentation & Final Polish
- [x] Seed script (`server/src/seed.ts` via `npm run seed`):
  - 5 demo users with password `Demo@1234`
  - 2 distinct groups ("Flatmates 402", "Goa Roadtrip 2026")
  - 9 varied expenses (equal, exact, percent splits, odd-paise remainders, multi-currency)
  - Recorded payments and activity logs
  - Formatted terminal table output with test credentials
- [x] Multi-currency stretch feature:
  - Expense support for non-INR currencies (USD, EUR, GBP, AED)
  - Fixed exchange rate stored as scaled integer / exact decimal string
  - Conversion to group currency paise using round-half-up
  - Frontend display showing both original currency amount and converted group amount
- [x] Comprehensive `README.md`
- [x] Final verification: all 46 tests passing, builds clean

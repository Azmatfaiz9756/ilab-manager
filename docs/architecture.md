# iLab Manager — Architecture & System Documentation

## 1. System Overview
**iLab Manager** is a multi-tenant SaaS application built for commercial iPhone repair and micro-soldering laboratories.
It standardizes device intake, IMEI tracking, technician assignments, board repair logging, QC checklists, chain-of-custody movements, and intelligent return claim detection.

---

## 2. Monorepo Organization
```
ilab-manager/
├── apps/
│   ├── backend/             # Node.js + Express + TypeScript + Prisma ORM
│   │   ├── prisma/          # schema.prisma & seed.ts
│   │   ├── src/
│   │   │   ├── config/      # Environment variables configuration
│   │   │   ├── middleware/  # JWT Auth, strict tenant isolation, RBAC
│   │   │   ├── routes/      # Auth, Catalog, Devices, Repairs, QC, Claims, Team, Analytics
│   │   │   ├── services/    # Return Claim Engine, Status Machine, Movement Service
│   │   │   └── server.ts    # Server setup, helmet, rate-limit, static upload storage
│   │   └── tests/           # Unit & lifecycle tests
│   └── mobile/              # React Native + Expo (SDK 58) + TypeScript
│       ├── App.tsx          # Root provider, auth gate, bottom navigation tabs
│       └── src/
│           ├── components/  # StatusBadge, etc.
│           ├── screens/     # Auth, Dashboard, NewDeviceIntake, MyRepairs, QC, IMEISearch, Team
│           ├── services/    # api.ts (auto token refresh + tenant headers)
│           ├── store/       # Zustand authStore + SecureStore token persistence
│           └── theme/       # colors & spacing (Deep Navy #0B0F19, Electric Blue #3B82F6)
├── packages/
│   └── shared/              # Shared types, Zod schemas, Luhn IMEI checker, Status transitions
├── docs/                    # Architectural & operational documentation
└── docker-compose.yml       # Production-ready PostgreSQL container specification
```

---

## 3. Multi-Tenant Isolation
- **Tenant Scope Enforcement**: Every database query on devices, IMEIs, repair jobs, return claims, and audit logs must be scoped to the authenticated user's `labId`.
- **Row-Level Security & Middleware**: `requireLabTenant` in `apps/backend/src/middleware/auth.ts` inspects incoming JWT tokens and rejects any request attempting cross-lab access.
- **IMEI Uniqueness Per Lab**: The database model `DeviceImei` enforces `@@unique([labId, imei])`. Two distinct laboratories can repair different phones with different histories, but one lab can never see or cross-contaminate another lab's records.

---

## 4. Intelligent Return Claim Detection Engine
When a device is presented for intake, `ReturnClaimEngine.evaluate`:
1. Scans both Primary and Secondary IMEIs across historical lab records.
2. If previous completed jobs exist, compares incoming fault IDs and normalized categories with previous repair attempts.
3. Classifies the claim:
   - **`SAME_FAULT`**: Previous repair attempted the exact same hardware failure (e.g., Face ID).
   - **`DIFFERENT_FAULT`**: Device returning for an unrelated issue (e.g., Previously Audio IC, now Charging Port).
   - **`REPEAT_RETURN`**: Device returning $\ge 2$ times.
4. Generates an automated warning for QC and assigned technicians displaying previous repair results, previous technician attribution, and diagnosis notes.

---

## 5. Device Lifecycle & State Machine
Device transitions strictly follow `ALLOWED_STATUS_TRANSITIONS`:
- `RECEIVED` $\rightarrow$ `QC_INSPECTION` $\rightarrow$ `WAITING_FOR_ASSIGNMENT` $\rightarrow$ `ASSIGNED_TO_TECHNICIAN`
- `ASSIGNED_TO_TECHNICIAN` $\rightarrow$ `ACCEPTED_BY_TECHNICIAN` $\rightarrow$ `REPAIR_IN_PROGRESS`
- `REPAIR_IN_PROGRESS` $\rightarrow$ `PARTS_REQUIRED` | `ON_HOLD` | `REPAIR_COMPLETED` | `REPAIR_NOT_POSSIBLE`
- `REPAIR_COMPLETED` $\rightarrow$ `QC_PENDING`
- `QC_PENDING` $\rightarrow$ `QC_PASSED` $\rightarrow$ `READY_FOR_DISPATCH` $\rightarrow$ `DISPATCHED`
- `QC_PENDING` $\rightarrow$ `QC_FAILED` $\rightarrow$ `RETURN_TO_TECHNICIAN` (with mandatory reason and fresh repair attempt)
- Any arbitrary status jump is blocked and rejected by `StatusTransitionService`.

---

## 6. Running the Project Locally
### Backend:
```bash
cd apps/backend
npm install
npx prisma generate
npm run build
npm run dev
```

### Mobile:
```bash
cd apps/mobile
npm install
npm run android   # or npm run ios / npm run web
```

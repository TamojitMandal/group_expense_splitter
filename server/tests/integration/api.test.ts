import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db';

const app = createApp();

describe('Integration Tests: Full API Workflow', () => {
  let user1Token: string;
  let user2Token: string;
  let user3Token: string;
  let user1Id: string;
  let user2Id: string;
  let user3Id: string;
  let groupId: string;
  let expenseId: string;

  beforeAll(async () => {
    // Clear test database
    await prisma.activity.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.expenseSplit.deleteMany();
    await prisma.expense.deleteMany();
    await prisma.groupMember.deleteMany();
    await prisma.group.deleteMany();
    await prisma.user.deleteMany();

    // Register User 1
    const res1 = await request(app).post('/api/auth/register').send({
      name: 'Alice Johnson',
      email: 'alice@example.com',
      password: 'Password@123',
    });
    expect(res1.status).toBe(201);
    user1Token = res1.body.token;
    user1Id = res1.body.user.id;

    // Register User 2
    const res2 = await request(app).post('/api/auth/register').send({
      name: 'Bob Smith',
      email: 'bob@example.com',
      password: 'Password@123',
    });
    expect(res2.status).toBe(201);
    user2Token = res2.body.token;
    user2Id = res2.body.user.id;

    // Register User 3 (will NOT be added to group initially)
    const res3 = await request(app).post('/api/auth/register').send({
      name: 'Charlie Brown',
      email: 'charlie@example.com',
      password: 'Password@123',
    });
    expect(res3.status).toBe(201);
    user3Token = res3.body.token;
    user3Id = res3.body.user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Auth Endpoints', () => {
    it('rejects registration with invalid email or short password with field errors (400)', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: '',
        email: 'invalid-email',
        password: '123',
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.fields).toBeDefined();
      expect(res.body.error.fields.email).toBeDefined();
      expect(res.body.error.fields.name).toBeDefined();
    });

    it('rejects duplicate email with 409 Conflict', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Alice Duplicate',
        email: 'alice@example.com',
        password: 'Password@123',
      });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('logs in user with correct credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'alice@example.com',
        password: 'Password@123',
      });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('alice@example.com');
    });

    it('rejects login with wrong password (401)', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'alice@example.com',
        password: 'WrongPassword',
      });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('fetches current user via GET /api/auth/me', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${user1Token}`);
      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(user1Id);
    });
  });

  describe('Group Management', () => {
    it('creates a new group with creator as OWNER', async () => {
      const res = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          name: 'Weekend Trip',
          currency: 'INR',
        });
      expect(res.status).toBe(201);
      expect(res.body.group.name).toBe('Weekend Trip');
      groupId = res.body.group.id;
    });

    it('adds registered user Bob to the group', async () => {
      const res = await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          email: 'bob@example.com',
        });
      expect(res.status).toBe(201);
      expect(res.body.member.userId).toBe(user2Id);
    });

    it('returns 404 with clear message when adding an unregistered email', async () => {
      const res = await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          email: 'nonexistent@example.com',
        });
      expect(res.status).toBe(404);
      expect(res.body.error.message).toContain('No registered user found with email "nonexistent@example.com"');
    });

    it('returns 409 when adding an existing member', async () => {
      const res = await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          email: 'bob@example.com',
        });
      expect(res.status).toBe(409);
    });

    it('returns 403 Forbidden when non-member Charlie tries to access group details', async () => {
      const res = await request(app)
        .get(`/api/groups/${groupId}`)
        .set('Authorization', `Bearer ${user3Token}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Expenses, Balances, Settle-Up, and Payments', () => {
    it('creates an equal-split expense of ₹1,000 (100000 paise)', async () => {
      const res = await request(app)
        .post(`/api/groups/${groupId}/expenses`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          description: 'Hotel Room',
          amountPaise: 100000,
          paidById: user1Id,
          splitType: 'EQUAL',
          participantUserIds: [user1Id, user2Id],
        });

      expect(res.status).toBe(201);
      expect(res.body.expense.description).toBe('Hotel Room');
      expect(res.body.expense.splits).toHaveLength(2);
      expect(res.body.expense.splits[0].owedPaise).toBe(50000);
      expect(res.body.expense.splits[1].owedPaise).toBe(50000);
      expenseId = res.body.expense.id;
    });

    it('computes correct balances: Alice gets back ₹500, Bob owes ₹500', async () => {
      const res = await request(app)
        .get(`/api/groups/${groupId}/balances`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      const aliceBalance = res.body.balances.find((b: any) => b.userId === user1Id);
      const bobBalance = res.body.balances.find((b: any) => b.userId === user2Id);

      expect(aliceBalance.netPaise).toBe(50000);
      expect(bobBalance.netPaise).toBe(-50000);
    });

    it('generates suggested settlement: Bob pays Alice ₹500', async () => {
      const res = await request(app)
        .get(`/api/groups/${groupId}/settlements`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.settlements).toHaveLength(1);
      expect(res.body.settlements[0].fromUser.id).toBe(user2Id);
      expect(res.body.settlements[0].toUser.id).toBe(user1Id);
      expect(res.body.settlements[0].amountPaise).toBe(50000);
    });

    it('editing an expense recomputes splits and updates balances correctly', async () => {
      // Edit Hotel Room from ₹1,000 to ₹1,400 (140000 paise)
      const res = await request(app)
        .put(`/api/groups/${groupId}/expenses/${expenseId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          description: 'Luxury Hotel Room',
          amountPaise: 140000,
          paidById: user1Id,
          splitType: 'EQUAL',
          participantUserIds: [user1Id, user2Id],
        });

      expect(res.status).toBe(200);
      expect(res.body.expense.description).toBe('Luxury Hotel Room');
      expect(res.body.expense.amountPaise).toBe(140000);

      // Verify updated balances: Alice paid 140000, owes 70000 -> net +70000
      const balRes = await request(app)
        .get(`/api/groups/${groupId}/balances`)
        .set('Authorization', `Bearer ${user1Token}`);

      const alice = balRes.body.balances.find((b: any) => b.userId === user1Id);
      const bob = balRes.body.balances.find((b: any) => b.userId === user2Id);
      expect(alice.netPaise).toBe(70000);
      expect(bob.netPaise).toBe(-70000);
    });

    it('recording a payment reduces the debt and updates settlement plan', async () => {
      // Bob pays Alice ₹400 (40000 paise)
      const res = await request(app)
        .post(`/api/groups/${groupId}/payments`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          fromUserId: user2Id,
          toUserId: user1Id,
          amountPaise: 40000,
          note: 'Partial payment for hotel',
        });

      expect(res.status).toBe(201);
      expect(res.body.payment.amountPaise).toBe(40000);

      // Settle-up plan should now show Bob owes Alice ₹300 (30000 paise)
      const planRes = await request(app)
        .get(`/api/groups/${groupId}/settlements`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(planRes.status).toBe(200);
      expect(planRes.body.settlements).toHaveLength(1);
      expect(planRes.body.settlements[0].amountPaise).toBe(30000);
    });

    it('soft deleting an expense restores balances', async () => {
      // Create a second temporary expense
      const tempExpRes = await request(app)
        .post(`/api/groups/${groupId}/expenses`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          description: 'Temporary Snacks',
          amountPaise: 20000, // ₹200
          paidById: user1Id,
          splitType: 'EQUAL',
          participantUserIds: [user1Id, user2Id],
        });
      const tempId = tempExpRes.body.expense.id;

      // Soft delete it
      const deleteRes = await request(app)
        .delete(`/api/groups/${groupId}/expenses/${tempId}`)
        .set('Authorization', `Bearer ${user1Token}`);
      expect(deleteRes.status).toBe(200);

      // Deleted expense should NOT appear in active expenses
      const expListRes = await request(app)
        .get(`/api/groups/${groupId}/expenses`)
        .set('Authorization', `Bearer ${user1Token}`);
      expect(expListRes.body.expenses.some((e: any) => e.id === tempId)).toBe(false);

      // Balances should be unchanged by the deleted expense
      const balRes = await request(app)
        .get(`/api/groups/${groupId}/balances`)
        .set('Authorization', `Bearer ${user1Token}`);
      const alice = balRes.body.balances.find((b: any) => b.userId === user1Id);
      // Net without temp expense: 70000 - 40000 (payment) = 30000
      expect(alice.netPaise).toBe(30000);
    });

    it('fetches chronological activity feed', async () => {
      const res = await request(app)
        .get(`/api/groups/${groupId}/activity`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.activities.length).toBeGreaterThan(0);
      // Newest first
      expect(res.body.activities[0].type).toBeDefined();
    });
  });
});

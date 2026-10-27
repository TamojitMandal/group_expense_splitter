import bcrypt from 'bcryptjs';
import { prisma } from './db';
import { calculateEqualSplits, calculateExactSplits, calculatePercentSplits } from './lib/splits';
import { convertForeignToPaise, formatINR } from './lib/money';

async function seed() {
  console.log('🌱 Starting database seeding...\n');

  // Clean existing records in correct order to respect foreign key constraints
  await prisma.activity.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.expenseSplit.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.group.deleteMany();
  await prisma.user.deleteMany();

  const commonPassword = 'Demo@1234';
  const passwordHash = await bcrypt.hash(commonPassword, 10);

  // 1. Create Demo Users
  const usersData = [
    { name: 'Priya Sharma', email: 'priya@example.com' },
    { name: 'Ravi Kumar', email: 'ravi@example.com' },
    { name: 'Ananya Verma', email: 'ananya@example.com' },
    { name: 'Rohit Patel', email: 'rohit@example.com' },
    { name: 'Sneha Iyer', email: 'sneha@example.com' },
  ];

  const users = await Promise.all(
    usersData.map((u) =>
      prisma.user.create({
        data: {
          name: u.name,
          email: u.email,
          passwordHash,
        },
      })
    )
  );

  const [priya, ravi, ananya, rohit, sneha] = users;
  console.log(`✅ Created ${users.length} demo users`);

  // 2. Create Groups
  // Group 1: Flatmates 402
  const group1 = await prisma.group.create({
    data: {
      name: 'Flatmates 402',
      currency: 'INR',
      createdById: priya.id,
      members: {
        create: [
          { userId: priya.id, role: 'OWNER' },
          { userId: ravi.id, role: 'MEMBER' },
          { userId: ananya.id, role: 'MEMBER' },
          { userId: rohit.id, role: 'MEMBER' },
        ],
      },
    },
  });

  await prisma.activity.create({
    data: {
      groupId: group1.id,
      actorId: priya.id,
      type: 'GROUP_CREATED',
      message: `${priya.name} created group "${group1.name}"`,
    },
  });

  // Group 2: Goa Roadtrip 2026
  const group2 = await prisma.group.create({
    data: {
      name: 'Goa Roadtrip 2026',
      currency: 'INR',
      createdById: ravi.id,
      members: {
        create: [
          { userId: ravi.id, role: 'OWNER' },
          { userId: priya.id, role: 'MEMBER' },
          { userId: rohit.id, role: 'MEMBER' },
          { userId: sneha.id, role: 'MEMBER' },
        ],
      },
    },
  });

  await prisma.activity.create({
    data: {
      groupId: group2.id,
      actorId: ravi.id,
      type: 'GROUP_CREATED',
      message: `${ravi.name} created group "${group2.name}"`,
    },
  });

  console.log(`✅ Created 2 groups: "${group1.name}" and "${group2.name}"`);

  // 3. Create Expenses for Group 1: Flatmates 402
  const g1Members = [priya.id, ravi.id, ananya.id, rohit.id];

  // Expense 1.1: Equal split ₹1,000 (100,000 paise)
  const exp1_1Splits = calculateEqualSplits(100000, g1Members);
  const exp1_1 = await prisma.expense.create({
    data: {
      groupId: group1.id,
      description: 'Monthly Wi-Fi & Fiber Broadband',
      amountPaise: 100000,
      paidById: priya.id,
      splitType: 'EQUAL',
      createdById: priya.id,
      splits: {
        create: exp1_1Splits.map((s) => ({ userId: s.userId, owedPaise: s.owedPaise })),
      },
    },
  });
  await prisma.activity.create({
    data: {
      groupId: group1.id,
      actorId: priya.id,
      type: 'EXPENSE_ADDED',
      message: `${priya.name} added "${exp1_1.description}" (${formatINR(100000)})`,
    },
  });

  // Expense 1.2: Equal split ₹1,200.50 (120,050 paise - odd paise division!)
  const exp1_2Splits = calculateEqualSplits(120050, g1Members);
  const exp1_2 = await prisma.expense.create({
    data: {
      groupId: group1.id,
      description: 'Organic Groceries & Cooking Staples',
      amountPaise: 120050,
      paidById: ravi.id,
      splitType: 'EQUAL',
      createdById: ravi.id,
      splits: {
        create: exp1_2Splits.map((s) => ({ userId: s.userId, owedPaise: s.owedPaise })),
      },
    },
  });
  await prisma.activity.create({
    data: {
      groupId: group1.id,
      actorId: ravi.id,
      type: 'EXPENSE_ADDED',
      message: `${ravi.name} added "${exp1_2.description}" (${formatINR(120050)})`,
    },
  });

  // Expense 1.3: Exact split ₹3,000 (300,000 paise)
  const exp1_3Splits = calculateExactSplits(300000, [
    { userId: priya.id, amountPaise: 100000 },
    { userId: ravi.id, amountPaise: 100000 },
    { userId: ananya.id, amountPaise: 100000 },
  ]);
  const exp1_3 = await prisma.expense.create({
    data: {
      groupId: group1.id,
      description: 'Deep Cleaning & Sofa Sanitization',
      amountPaise: 300000,
      paidById: ananya.id,
      splitType: 'EXACT',
      createdById: ananya.id,
      splits: {
        create: exp1_3Splits.map((s) => ({ userId: s.userId, owedPaise: s.owedPaise })),
      },
    },
  });
  await prisma.activity.create({
    data: {
      groupId: group1.id,
      actorId: ananya.id,
      type: 'EXPENSE_ADDED',
      message: `${ananya.name} added "${exp1_3.description}" (${formatINR(300000)})`,
    },
  });

  // Expense 1.4: Percent split ₹2,450.75 (245,075 paise) with 40%, 30%, 30%
  const exp1_4Splits = calculatePercentSplits(245075, [
    { userId: priya.id, percent: 40 },
    { userId: ravi.id, percent: 30 },
    { userId: rohit.id, percent: 30 },
  ]);
  const exp1_4 = await prisma.expense.create({
    data: {
      groupId: group1.id,
      description: 'Winter Electricity & Heating Bill',
      amountPaise: 245075,
      paidById: rohit.id,
      splitType: 'PERCENT',
      createdById: rohit.id,
      splits: {
        create: exp1_4Splits.map((s) => ({
          userId: s.userId,
          owedPaise: s.owedPaise,
          basisPoints: s.basisPoints,
        })),
      },
    },
  });
  await prisma.activity.create({
    data: {
      groupId: group1.id,
      actorId: rohit.id,
      type: 'EXPENSE_ADDED',
      message: `${rohit.name} added "${exp1_4.description}" (${formatINR(245075)})`,
    },
  });

  // Expense 1.5: Multi-currency stretch: $20.00 USD @ 83.25 = ₹1,665.00 (166,500 paise)
  const convertedUsdPaise = convertForeignToPaise(2000, '83.25');
  const exp1_5Splits = calculateEqualSplits(convertedUsdPaise, g1Members);
  const exp1_5 = await prisma.expense.create({
    data: {
      groupId: group1.id,
      description: 'Netflix 4K Premium Plan (Annual)',
      currency: 'USD',
      originalAmountPaise: 2000,
      exchangeRate: '83.25',
      amountPaise: convertedUsdPaise,
      paidById: priya.id,
      splitType: 'EQUAL',
      createdById: priya.id,
      splits: {
        create: exp1_5Splits.map((s) => ({ userId: s.userId, owedPaise: s.owedPaise })),
      },
    },
  });
  await prisma.activity.create({
    data: {
      groupId: group1.id,
      actorId: priya.id,
      type: 'EXPENSE_ADDED',
      message: `${priya.name} added "${exp1_5.description}" ($20.00 ≈ ${formatINR(convertedUsdPaise)})`,
    },
  });

  // 4. Create Expenses for Group 2: Goa Roadtrip 2026
  const g2Members = [ravi.id, priya.id, rohit.id, sneha.id];

  // Expense 2.1: Equal split ₹15,000 (1,500,000 paise)
  const exp2_1Splits = calculateEqualSplits(1500000, g2Members);
  const exp2_1 = await prisma.expense.create({
    data: {
      groupId: group2.id,
      description: 'Beachfront Villa Booking (3 Nights)',
      amountPaise: 1500000,
      paidById: ravi.id,
      splitType: 'EQUAL',
      createdById: ravi.id,
      splits: {
        create: exp2_1Splits.map((s) => ({ userId: s.userId, owedPaise: s.owedPaise })),
      },
    },
  });
  await prisma.activity.create({
    data: {
      groupId: group2.id,
      actorId: ravi.id,
      type: 'EXPENSE_ADDED',
      message: `${ravi.name} added "${exp2_1.description}" (${formatINR(1500000)})`,
    },
  });

  // Expense 2.2: Percent split ₹3,333.33 (333,333 paise) with 33.34%, 33.33%, 33.33%
  const exp2_2Splits = calculatePercentSplits(333333, [
    { userId: priya.id, percent: '33.34' },
    { userId: rohit.id, percent: '33.33' },
    { userId: sneha.id, percent: '33.33' },
  ]);
  const exp2_2 = await prisma.expense.create({
    data: {
      groupId: group2.id,
      description: 'Seafood Shack Dinner & Cocktails',
      amountPaise: 333333,
      paidById: priya.id,
      splitType: 'PERCENT',
      createdById: priya.id,
      splits: {
        create: exp2_2Splits.map((s) => ({
          userId: s.userId,
          owedPaise: s.owedPaise,
          basisPoints: s.basisPoints,
        })),
      },
    },
  });
  await prisma.activity.create({
    data: {
      groupId: group2.id,
      actorId: priya.id,
      type: 'EXPENSE_ADDED',
      message: `${priya.name} added "${exp2_2.description}" (${formatINR(333333)})`,
    },
  });

  // Expense 2.3: Exact split ₹8,500 (850,000 paise)
  const exp2_3Splits = calculateExactSplits(850000, [
    { userId: ravi.id, amountPaise: 450000 },
    { userId: rohit.id, amountPaise: 400000 },
  ]);
  const exp2_3 = await prisma.expense.create({
    data: {
      groupId: group2.id,
      description: 'Scuba Diving & Jet Ski Rental',
      amountPaise: 850000,
      paidById: sneha.id,
      splitType: 'EXACT',
      createdById: sneha.id,
      splits: {
        create: exp2_3Splits.map((s) => ({ userId: s.userId, owedPaise: s.owedPaise })),
      },
    },
  });
  await prisma.activity.create({
    data: {
      groupId: group2.id,
      actorId: sneha.id,
      type: 'EXPENSE_ADDED',
      message: `${sneha.name} added "${exp2_3.description}" (${formatINR(850000)})`,
    },
  });

  // Expense 2.4: Equal split ₹4,200 (420,000 paise)
  const exp2_4Splits = calculateEqualSplits(420000, g2Members);
  const exp2_4 = await prisma.expense.create({
    data: {
      groupId: group2.id,
      description: 'Highway Tolls & Petrol Refueling',
      amountPaise: 420000,
      paidById: rohit.id,
      splitType: 'EQUAL',
      createdById: rohit.id,
      splits: {
        create: exp2_4Splits.map((s) => ({ userId: s.userId, owedPaise: s.owedPaise })),
      },
    },
  });
  await prisma.activity.create({
    data: {
      groupId: group2.id,
      actorId: rohit.id,
      type: 'EXPENSE_ADDED',
      message: `${rohit.name} added "${exp2_4.description}" (${formatINR(420000)})`,
    },
  });

  console.log('✅ Created 9 varied expenses with equal, exact, percent, and multi-currency splits');

  // 5. Create Settlement Payment in Group 1
  const paymentAmountPaise = 25000; // ₹250.00
  const payment = await prisma.payment.create({
    data: {
      groupId: group1.id,
      fromUserId: ravi.id,
      toUserId: priya.id,
      amountPaise: paymentAmountPaise,
      note: 'Partial settlement for Wi-Fi and supplies via UPI',
    },
  });

  await prisma.activity.create({
    data: {
      groupId: group1.id,
      actorId: ravi.id,
      type: 'PAYMENT_RECORDED',
      message: `${ravi.name} paid ${priya.name} ${formatINR(paymentAmountPaise)}`,
      metadata: JSON.stringify({
        paymentId: payment.id,
        amountPaise: paymentAmountPaise,
      }),
    },
  });
  console.log(`✅ Recorded settlement payment: Ravi paid Priya ${formatINR(paymentAmountPaise)}`);

  console.log('\n======================================================');
  console.log('🎉 SEEDING COMPLETED SUCCESSFULLY!');
  console.log('======================================================\n');
  console.log('📋 DEMO ACCOUNTS TABLE:');
  console.log('┌──────────────────┬─────────────────────┬──────────────┐');
  console.log('│ Name             │ Email               │ Password     │');
  console.log('├──────────────────┼─────────────────────┼──────────────┤');
  usersData.forEach((u) => {
    console.log(
      `│ ${u.name.padEnd(16)} │ ${u.email.padEnd(19)} │ ${commonPassword.padEnd(12)} │`
    );
  });
  console.log('└──────────────────┴─────────────────────┴──────────────┘\n');
}

seed()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient, SubscriptionTier, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const IPHONE_MODELS = [
  // iPhone 8 series
  { family: 'iPhone 8 series', name: 'iPhone 8', orderIndex: 80 },
  { family: 'iPhone 8 series', name: 'iPhone 8 Plus', orderIndex: 81 },
  // iPhone X series
  { family: 'iPhone X series', name: 'iPhone X', orderIndex: 100 },
  { family: 'iPhone X series', name: 'iPhone XR', orderIndex: 101 },
  { family: 'iPhone X series', name: 'iPhone XS', orderIndex: 102 },
  { family: 'iPhone X series', name: 'iPhone XS Max', orderIndex: 103 },
  // iPhone 11 series
  { family: 'iPhone 11 series', name: 'iPhone 11', orderIndex: 110 },
  { family: 'iPhone 11 series', name: 'iPhone 11 Pro', orderIndex: 111 },
  { family: 'iPhone 11 series', name: 'iPhone 11 Pro Max', orderIndex: 112 },
  // iPhone 12 series
  { family: 'iPhone 12 series', name: 'iPhone 12', orderIndex: 120 },
  { family: 'iPhone 12 series', name: 'iPhone 12 mini', orderIndex: 121 },
  { family: 'iPhone 12 series', name: 'iPhone 12 Pro', orderIndex: 122 },
  { family: 'iPhone 12 series', name: 'iPhone 12 Pro Max', orderIndex: 123 },
  // iPhone 13 series
  { family: 'iPhone 13 series', name: 'iPhone 13', orderIndex: 130 },
  { family: 'iPhone 13 series', name: 'iPhone 13 mini', orderIndex: 131 },
  { family: 'iPhone 13 series', name: 'iPhone 13 Pro', orderIndex: 132 },
  { family: 'iPhone 13 series', name: 'iPhone 13 Pro Max', orderIndex: 133 },
  // iPhone 14 series
  { family: 'iPhone 14 series', name: 'iPhone 14', orderIndex: 140 },
  { family: 'iPhone 14 series', name: 'iPhone 14 Plus', orderIndex: 141 },
  { family: 'iPhone 14 series', name: 'iPhone 14 Pro', orderIndex: 142 },
  { family: 'iPhone 14 series', name: 'iPhone 14 Pro Max', orderIndex: 143 },
  // iPhone 15 series
  { family: 'iPhone 15 series', name: 'iPhone 15', orderIndex: 150 },
  { family: 'iPhone 15 series', name: 'iPhone 15 Plus', orderIndex: 151 },
  { family: 'iPhone 15 series', name: 'iPhone 15 Pro', orderIndex: 152 },
  { family: 'iPhone 15 series', name: 'iPhone 15 Pro Max', orderIndex: 153 },
  // iPhone 16 series
  { family: 'iPhone 16 series', name: 'iPhone 16', orderIndex: 160 },
  { family: 'iPhone 16 series', name: 'iPhone 16 Plus', orderIndex: 161 },
  { family: 'iPhone 16 series', name: 'iPhone 16 Pro', orderIndex: 162 },
  { family: 'iPhone 16 series', name: 'iPhone 16 Pro Max', orderIndex: 163 },
  // iPhone 17 series
  { family: 'iPhone 17 series', name: 'iPhone 17', orderIndex: 170 },
  { family: 'iPhone 17 series', name: 'iPhone 17 Air', orderIndex: 171 },
  { family: 'iPhone 17 series', name: 'iPhone 17 Pro', orderIndex: 172 },
  { family: 'iPhone 17 series', name: 'iPhone 17 Pro Max', orderIndex: 173 },
  // iPhone 18 series
  { family: 'iPhone 18 series', name: 'iPhone 18', orderIndex: 180 },
  { family: 'iPhone 18 series', name: 'iPhone 18 Pro', orderIndex: 181 },
  { family: 'iPhone 18 series', name: 'iPhone 18 Pro Max', orderIndex: 182 },
];

const FAULT_CATALOG = [
  {
    category: 'FACE ID',
    faults: [
      'Face ID Not Working',
      'Face ID Disabled',
      'Face ID Flex Issue',
      'Face ID Setup Failed',
      'Face ID Intermittent',
    ],
  },
  {
    category: 'FRONT CAMERA',
    faults: [
      'Front Camera Not Working',
      'Front Camera Black Screen',
      'Front Camera Blurry',
      'Front Camera Focus Issue',
      'Front Camera Flex Issue',
    ],
  },
  {
    category: 'REAR CAMERA',
    faults: [
      'Rear Camera Not Working',
      'Main Camera Issue',
      'Ultra Wide Camera Issue',
      'Telephoto Camera Issue',
      'Camera Shaking',
      'Camera Black Screen',
      'Camera Focus Issue',
    ],
  },
  {
    category: 'POWER AND BOOT',
    faults: [
      'Dead / No Power',
      'Restart Issue',
      'Boot Loop',
      'Stuck on Apple Logo',
      'Random Shutdown',
      'Heating Issue',
      'Power Consumption Issue',
    ],
  },
  {
    category: 'DISPLAY',
    faults: [
      'No Display',
      'Display Lines',
      'Green Screen',
      'White Screen',
      'Touch Not Working',
      'Ghost Touch',
      'Display Flickering',
    ],
  },
  {
    category: 'NETWORK',
    faults: [
      'No Service',
      'Searching Network',
      'Baseband Issue',
      'Wi-Fi Not Working',
      'Bluetooth Not Working',
    ],
  },
  {
    category: 'CHARGING',
    faults: [
      'Not Charging',
      'Slow Charging',
      'Wireless Charging Issue',
      'Charging Port Issue',
    ],
  },
  {
    category: 'AUDIO',
    faults: [
      'Earpiece Issue',
      'Loudspeaker Issue',
      'Microphone Issue',
      'Audio IC Issue',
    ],
  },
  {
    category: 'OTHER',
    faults: [
      'Water Damage',
      'Short Circuit',
      'Board Damage',
      'Unknown Hardware Issue',
    ],
  },
];

async function seed() {
  console.log('Seeding iLab Manager database...');

  // 1. Subscription Plans
  const plans = [
    { tier: SubscriptionTier.STARTER, name: 'Starter', maxEmployees: 5, maxMonthlyDevices: 100, priceMonthly: 49.0 },
    { tier: SubscriptionTier.PRO, name: 'Pro', maxEmployees: 15, maxMonthlyDevices: 500, priceMonthly: 149.0 },
    { tier: SubscriptionTier.BUSINESS, name: 'Business', maxEmployees: 40, maxMonthlyDevices: 2000, priceMonthly: 349.0 },
    { tier: SubscriptionTier.ENTERPRISE, name: 'Enterprise', maxEmployees: 500, maxMonthlyDevices: 99999, priceMonthly: 999.0 },
  ];

  for (const p of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { tier: p.tier },
      update: { name: p.name, maxEmployees: p.maxEmployees, maxMonthlyDevices: p.maxMonthlyDevices, priceMonthly: p.priceMonthly },
      create: p,
    });
  }

  // 2. iPhone Device Models
  for (const m of IPHONE_MODELS) {
    await prisma.deviceModel.upsert({
      where: { name: m.name },
      update: { family: m.family, orderIndex: m.orderIndex },
      create: m,
    });
  }

  // 3. Fault Catalog
  let catIndex = 0;
  for (const item of FAULT_CATALOG) {
    catIndex++;
    let category = await prisma.faultCategory.findFirst({
      where: { name: item.category, labId: null },
    });

    if (!category) {
      category = await prisma.faultCategory.create({
        data: {
          name: item.category,
          orderIndex: catIndex,
          labId: null,
        },
      });
    }

    let fIndex = 0;
    for (const faultName of item.faults) {
      fIndex++;
      const existing = await prisma.fault.findFirst({
        where: { name: faultName, categoryId: category.id, labId: null },
      });
      if (!existing) {
        await prisma.fault.create({
          data: {
            categoryId: category.id,
            labId: null,
            name: faultName,
            orderIndex: fIndex,
          },
        });
      }
    }
  }

  // 4. Default Super Admin User
  const adminPassword = await bcrypt.hash('Admin@iLab2026!', 10);
  await prisma.user.upsert({
    where: { email: 'superadmin@ilabmanager.com' },
    update: { isSuperAdmin: true },
    create: {
      email: 'superadmin@ilabmanager.com',
      name: 'Super Administrator',
      passwordHash: adminPassword,
      isSuperAdmin: true,
    },
  });

  console.log('Seeding completed successfully!');
}

seed()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { db } from '../src/server/db';
import { paymentProcessors } from '../src/server/schema';

async function createTestProcessor() {
  const processor = await db
    .insert(paymentProcessors)
    .values({
      name: 'Test-Crypto-Percentage',
      processorType: 'crypto',
      feeType: 'percentage',
      feePercentage: '3.5',
      feeFixedAmount: null,
      defaultUserSplit: '25',
      defaultProcessorSplit: '75',
      active: true
    })
    .returning();

  console.log('Created test processor:', processor[0]);
  process.exit(0);
}

createTestProcessor().catch((err) => {
  console.error('Error creating test processor:', err);
  process.exit(1);
});

const { setDoc } = require('./middleware/db');

async function main() {
  await setDoc('settings', 'upi', { upiId: 'yb.dnshoppy0001@sbi', businessName: 'DN Shoppy' });
  console.log("UPI updated in DB successfully!");
  process.exit(0);
}

main();

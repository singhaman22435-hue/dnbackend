const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { setDoc } = require('./middleware/db');

async function main() {
  const keyId = process.argv[2] || process.env.RAZORPAY_KEY_ID || 'rzp_live_ToavHwGofVYh11';
  const keySecret = process.argv[3] || process.env.RAZORPAY_KEY_SECRET || 'uJ9S2ETCYApXxET691Cmpixk';

  await setDoc('settings', 'razorpay', {
    keyId: keyId.trim(),
    keySecret: keySecret.trim(),
    updatedAt: new Date().toISOString()
  });

  console.log(`✅ Razorpay keys configured successfully in DB! (Key ID: ${keyId})`);
  setTimeout(() => process.exit(0), 1000);
}

main();

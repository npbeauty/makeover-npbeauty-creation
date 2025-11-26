# NP Beauty — Node Backend (LIVE Mode)

## Setup
1. Copy your frontend files into `public/` (index.html, CSS, JS, images, etc.).
2. Copy `.env.example` to `.env` and fill in real LIVE keys for:
   - RAZORPAY_KEY_ID, RAZORPAY_SECRET_KEY
   - STRIPE_SECRET_KEY
   - PAYPAL_CLIENT_ID, PAYPAL_SECRET
   - PAYPAL_MODE=live

3. Optional app settings in `.env`:
   - `CURRENCY=INR`
   - `MIN_BOOKING=1000` (if you want a minimum booking validation)

## Install & Run
```bash
npm install
npm start
# or for development
# npm run dev

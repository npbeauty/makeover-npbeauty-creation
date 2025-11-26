require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const payments = require('./payments'); // payments.js is in the same folder

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Parse body
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve frontend from ../public
app.use(express.static(path.join(__dirname, '../public')));

// ======================
// PAYMENT ENDPOINTS
// ======================

// Razorpay
app.post('/create-razorpay-order', payments.createRazorpayOrder);
app.post('/verify-razorpay-payment', payments.verifyRazorpayPayment);

// Stripe
app.post('/create-stripe-session', payments.createStripeSession);

// PayPal (MISSING ROUTE ADDED)
app.post('/create-paypal-order', payments.createPaypalOrder);
app.post('/capture-paypal-payment', payments.capturePaypalPayment);

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// Fallback: Always return index.html for frontend routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

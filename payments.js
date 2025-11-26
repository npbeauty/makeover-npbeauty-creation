require('dotenv').config();
const Razorpay = require('razorpay');
const Stripe = require('stripe');
const axios = require('axios');
const crypto = require('crypto');

/**
 * Environment variables expected:
 * RAZORPAY_KEY_ID
 * RAZORPAY_KEY_SECRET
 * STRIPE_SECRET_KEY
 * PAYPAL_CLIENT_ID
 * PAYPAL_CLIENT_SECRET
 * PAYPAL_MODE = 'live' or 'sandbox' (optional; default = sandbox)
 */

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || '';
const PAYPAL_CLIENT = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';
const PAYPAL_API = (process.env.PAYPAL_MODE === 'live') ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET
});

const stripe = Stripe(STRIPE_SECRET);

// Helper: get PayPal OAuth token
async function getPaypalToken() {
  if (!PAYPAL_CLIENT || !PAYPAL_SECRET) throw new Error('PayPal credentials missing');
  const auth = Buffer.from(`${PAYPAL_CLIENT}:${PAYPAL_SECRET}`).toString('base64');
  const resp = await axios.post(
    `${PAYPAL_API}/v1/oauth2/token`,
    'grant_type=client_credentials',
    {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );
  return resp.data.access_token;
}

module.exports = {

  /**
   * Create Razorpay order
   * Expects body: { amount: <number in RUPEES>, currency: 'INR' }
   * Returns Razorpay order object (amount in paise).
   */
  createRazorpayOrder: async (req, res) => {
    try {
      const { amount, currency = 'INR' } = req.body;
      if (!amount || isNaN(amount) || Number(amount) <= 0) {
        return res.status(400).json({ error: 'Invalid amount. Send amount in rupees (number).' });
      }
      // convert to paise
      const amountPaise = Math.round(Number(amount) * 100);

      const order = await razorpay.orders.create({
        amount: amountPaise,
        currency,
        receipt: `booking_${Date.now()}`,
        payment_capture: 1
      });

      return res.json(order);
    } catch (err) {
      console.error('createRazorpayOrder error:', err?.response?.data || err.message || err);
      return res.status(500).json({ error: 'Razorpay order creation failed', details: err?.message || err });
    }
  },

  /**
   * Verify Razorpay payment signature
   * Expects body: { razor: { razorpay_payment_id, razorpay_order_id, razorpay_signature }, booking: {...} }
   * Returns { success: true } when signature matches.
   */
  verifyRazorpayPayment: async (req, res) => {
    try {
      const { razor, booking } = req.body;
      if (!razor || !razor.razorpay_payment_id || !razor.razorpay_order_id || !razor.razorpay_signature) {
        return res.status(400).json({ success: false, error: 'Missing razor payload' });
      }

      const generated_signature = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(`${razor.razorpay_order_id}|${razor.razorpay_payment_id}`)
        .digest('hex');

      if (generated_signature === razor.razorpay_signature) {
        // TODO: Record booking and payment in DB here (booking param has user data)
        console.log('Razorpay verification OK for order:', razor.razorpay_order_id);
        return res.json({ success: true });
      } else {
        console.warn('Razorpay signature mismatch', { generated: generated_signature, received: razor.razorpay_signature });
        return res.status(400).json({ success: false, error: 'signature_mismatch' });
      }
    } catch (err) {
      console.error('verifyRazorpayPayment error:', err);
      return res.status(500).json({ success: false, error: 'verify failed', details: err?.message || err });
    }
  },

  /**
   * Create Stripe Checkout session
   * Expects body: { booking: {...}, amount: <number in RUPEES>, currency: 'INR' }
   */
  createStripeSession: async (req, res) => {
    try {
      const { booking = {}, amount, currency = 'INR' } = req.body;
      if (!amount || isNaN(amount) || Number(amount) <= 0) {
        return res.status(400).json({ error: 'Invalid amount. Send amount in rupees (number).' });
      }

      const unitAmount = Math.round(Number(amount) * 100); // rupees -> paise
      const successUrl = `${req.headers.origin || 'http://localhost:3000'}/success.html`;
      const cancelUrl = `${req.headers.origin || 'http://localhost:3000'}/failure.html`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `Booking: ${Array.isArray(booking.services) ? booking.services.map(s => s.name).join(', ') : (booking.name || 'Customer')}`
            },
            unit_amount: unitAmount
          },
          quantity: 1
        }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { booking: JSON.stringify(booking || {}) }
      });

      return res.json({ id: session.id });
    } catch (err) {
      console.error('createStripeSession error:', err);
      return res.status(500).json({ error: 'Stripe session creation failed', details: err?.message || err });
    }
  },

  /**
   * Create PayPal order (server-side)
   * Expects body: { amount: <number in RUPEES or currency units>, currency: 'INR' (optional)}
   * Returns { orderId }
   */
  createPaypalOrder: async (req, res) => {
    try {
      const { amount, currency = 'INR' } = req.body;
      if (!amount || isNaN(amount) || Number(amount) <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
      }

      const accessToken = await getPaypalToken();

      const orderResp = await axios.post(
        `${PAYPAL_API}/v2/checkout/orders`,
        {
          intent: 'CAPTURE',
          purchase_units: [{
            amount: { currency_code: currency, value: String(amount) }
          }]
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return res.json({ orderId: orderResp.data.id, order: orderResp.data });
    } catch (err) {
      console.error('createPaypalOrder error:', err?.response?.data || err);
      return res.status(500).json({ error: 'PayPal create order failed', details: err?.response?.data || err?.message || err });
    }
  },

  /**
   * Capture PayPal order
   * Expects body: { orderId }
   */
  capturePaypalPayment: async (req, res) => {
    try {
      const { orderId } = req.body;
      if (!orderId) return res.status(400).json({ success: false, error: 'Missing orderId' });

      const accessToken = await getPaypalToken();

      const captureResp = await axios.post(
        `${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`,
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return res.json({ success: true, capture: captureResp.data });
    } catch (err) {
      console.error('capturePaypalPayment error:', err?.response?.data || err);
      return res.status(500).json({ success: false, error: 'PayPal capture failed', details: err?.response?.data || err?.message || err });
    }
  }

};


const dotenv = require('dotenv').config();
const User = require("../model/userModel");
const Product = require("../model/productModel");
const Address = require('../model/addressModel');
const Cart=require('../model/cartModel')
const Order = require('../model/orderModel');
const { authenticate } = require('passport');
const Razorpay = require("razorpay");
const Offer= require('../model/offerModel');
const  Wishlist=require('../model/wishlistModel');
const Coupon=require('../model/couponModel');
const Wallet = require('../model/walletModel');






const loadCheckout = async (req, res) => {
    try {
      const userId = req.session.user_id;
      if (!userId) {
        return res.redirect("/login");
      }
  
      const userData = await User.findById(userId);
      const addresses = await Address.find({ user: userId });
      const cart = await Cart.findOne({ userId }).populate({
        path: 'items.productId',
        populate: { path: 'offer' }
      });
  
      if (!cart || cart.items.length === 0) {
        return res.redirect("/cart");
      }
  
      let subtotal = 0;
      let couponDiscount = 0;
      cart.items.forEach(item => {
        const product = item.productId;
        let discountPercentage = 0;
        let discountedPrice = product.price;
        // Check if the product has an active offer
        if (product.offer && product.offer.length > 0) {
          const activeOffers = product.offer.filter(offer => offer.status === 'active');
          if (activeOffers.length > 0) {
            const maxDiscount = Math.max(...activeOffers.map(offer => offer.discount));
            discountPercentage = maxDiscount;
            discountedPrice = product.price - (product.price * discountPercentage / 100);
          }
        }
  
        item.discountedPrice = discountedPrice;
        item.discountPercentage = discountPercentage;
        item.totalPrice = discountedPrice * item.quantity; 
        subtotal += item.totalPrice; 
      });
  
      // Calculate coupon discount if a valid coupon is applied
      if (req.body.couponCode) {
        const coupon = await Coupon.findOne({ code: req.body.couponCode, status: 'active' });
        if (coupon && subtotal >= coupon.minAmount) {
          couponDiscount = Math.min((subtotal * coupon.discount) / 100, coupon.maxDiscount);
        }
      }
  
      const totalAmount = subtotal - couponDiscount;
  
      // Fetch all active coupons
      const coupons = await Coupon.find({ status: 'active' });
  
      res.render('checkout', {
        addresses,
        cart,
        userData,
        totalAmount: totalAmount.toFixed(2),
        razorpayKeyId: process.env.RAZORPAY_KEY_ID,
        coupons, 
        couponDiscount: couponDiscount.toFixed(2)
      });
    } catch (error) {
      console.error(error);
      res.status(500).send('An error occurred');
    }
  };

// payment confirmation

const verifyPayment = async (req, res) => {
  try {
      const { razorpay_payment_id, razorpay_order_id, razorpay_signature, orderId } = req.body;

      const isValidSignature = verifyRazorpayPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);

      if (isValidSignature) {
          await Order.findByIdAndUpdate(orderId, {
              payment_status: 'Completed',
              'payment_details.razorpay_payment_id': razorpay_payment_id,
              'payment_details.razorpay_order_id': razorpay_order_id,
              'payment_details.razorpay_signature': razorpay_signature
          });

          res.json({ success: true, message: "Payment verified and order placed successfully." });
      } else {
          await Order.findByIdAndUpdate(orderId, { payment_status: 'Failed' });
          res.json({ success: false, message: 'Payment verification failed' });
      }
  } catch (error) {
      console.error('Error verifying payment:', error);
      res.status(500).json({ success: false, message: 'Error verifying payment' });
  }
};
// Server-side code (in your controller file)
// Server-side code (in your controller file)
const paymentFailure = async (req, res) => {
  try {
      const { razorpay_order_id, orderId } = req.body;

      const updatedOrder = await Order.findByIdAndUpdate(
          orderId,
          { 
              payment_status: 'Failed',
              'payment_details.razorpay_order_id': razorpay_order_id
          },
          { new: true }
      );

      if (!updatedOrder) {
          return res.status(404).json({ success: false, message: 'Order not found' });
      }

      res.json({
          success: true,
          message: 'Payment failure recorded',
          order: updatedOrder
      });
  } catch (error) {
      console.error('Error in handlePaymentFailure:', error);
      res.status(500).json({
          success: false,
          message: 'Internal server error',
          error: error.message
      });
  }
};


  const checkoutAddAddress = async (req, res) => {
    try {
      const userId = req.session.user_id;
      if (!userId) {
        return res.json({ success: false, message: 'User not logged in' });
      }
  
      const newAddress = new Address({
        user: userId,
        fullName: req.body.fullName,
        addressLine1: req.body.addressLine1,
        addressLine2: req.body.addressLine2,
        city: req.body.city,
        state: req.body.state,
        postalCode: req.body.postalCode,
        country: req.body.country,
        phoneNumber: req.body.phoneNumber
      });
  
      await newAddress.save();
  
      // Fetch all updated addresses after saving the new one
      const addresses = await Address.find({ user: userId });
  
      res.json({ success: true, addresses });
    } catch (error) {
      console.error(error);
      res.json({ success: false, message: 'An error occurred while adding the address' });
    }
  };
  
  const checkoutEditAddress = async (req, res) => {
    try {
      const userId = req.session.user_id;
      if (!userId) {
        return res.json({ success: false, message: 'User not logged in' });
      }
  
      const addressId = req.params.id;
      const updatedAddress = {
        fullName: req.body.fullName,
        addressLine1: req.body.addressLine1,
        addressLine2: req.body.addressLine2,
        city: req.body.city,
        state: req.body.state,
        postalCode: req.body.postalCode,
        country: req.body.country,
        phoneNumber: req.body.phoneNumber
      };
  
      await Address.findByIdAndUpdate(addressId, updatedAddress);
  
      // Fetch all updated addresses after saving the changes
      const addresses = await Address.find({ user: userId });
  
      res.json({ success: true, addresses });
    } catch (error) {
      console.error(error);
      res.json({ success: false, message: 'An error occurred while updating the address' });
    }
  };
  
  const checkoutDeleteAddress = async (req, res) => {
    try {
      const userId = req.session.user_id;
      if (!userId) {
        return res.json({ success: false, message: 'User not logged in' });
      }
  
      const addressId = req.params.id;
      await Address.findByIdAndDelete(addressId);
  
      res.json({ success: true, message: 'Address deleted successfully' });
    } catch (error) {
      console.error(error);
      res.json({ success: false, message: 'An error occurred while deleting the address' });
    }
  };
  
module.exports={
    loadCheckout,
    checkoutAddAddress,
    checkoutDeleteAddress,
    checkoutEditAddress,
    verifyPayment,
    paymentFailure

}  
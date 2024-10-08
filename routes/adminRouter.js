const express = require('express');
const adminRouter = express.Router();
const bodyParser = require('body-parser');
const session = require('express-session');
const dotenv = require('dotenv').config();
const adminController = require('../controller/adminController');
const adminAuth = require("../middleware/adminAuth");
const multer = require('../middleware/multer');
const categoryController=require("../controller/categoryController");
const productController=require("../controller/productController");
const {isLogin}=require('../middleware/adminAuth')
const offerController=require('../controller/offerController');

adminRouter.use(bodyParser.json());
adminRouter.use(bodyParser.urlencoded({ extended: true }));


adminRouter.post('/', adminController.verifyAdmin);
adminRouter.get('/login',adminController.adminLogin)

adminRouter.get('/dashboard',isLogin, adminController.adminDash);
// adminRouter.get('/dash',adminController.dash);
// Category routes
adminRouter.get('/dashboard/categoryList',isLogin, categoryController.loadCategory);
adminRouter.post('/dashboard/categoryList',isLogin,categoryController.addCategory);
adminRouter.post('/dashboard/editCategory',isLogin, categoryController.editCategory);
adminRouter.post('/dashboard/loadCategory/:categoryId',isLogin, categoryController.loadCategory);
adminRouter.post('/dashboard/toggleCategoryStatus/:categoryId',isLogin,categoryController.toggleCategoryStatus);

adminRouter.get('/dashboard/allcustomer', isLogin, adminController.allCustomers);

adminRouter.post('/dashboard/block/:userId', isLogin, adminController.blockUser);
adminRouter.post('/dashboard/unblock/:userId',isLogin,  adminController.unblockUser);

// Brand routes
adminRouter.get('/dashboard/brandList',isLogin, adminController.loadBrand);
adminRouter.post('/dashboard/addBrand',isLogin, adminController.addBrand);
adminRouter.post('/dashboard/editBrand',isLogin, adminController.editBrand);
adminRouter.post('/dashboard/toggleBrandStatus/:brandId', isLogin,adminController.toggleBrandStatus);


// Product routes
adminRouter.get('/dashboard/productList',isLogin,productController.loadProducts);
adminRouter.get('/dashboard/addProduct',isLogin,productController.loadAddProduct);
adminRouter.post('/dashboard/addProduct', multer.array('images', 3),isLogin, productController.addProduct);
adminRouter.get('/dashboard/editProduct/:id',isLogin,productController.loadEditProduct);
adminRouter.post('/dashboard/editProduct/:id', multer.array('images', 3), isLogin, productController.editProduct);

adminRouter.post('/dashboard/toggleProductStatus/:productId',isLogin,productController.toggleProductStatus);


// Route to load the order list
adminRouter.get('/dashboard/orderList',isLogin, adminController.loadOrderList);
adminRouter.post('/dashboard/orderList/update-order-status',isLogin, adminController.updateOrderStatus);
// offer
adminRouter.get('/dashboard/offers',isLogin, offerController.listOffers);
adminRouter.get('/dashboard/offers/create', isLogin, offerController.createOfferForm);
adminRouter.post('/dashboard/offers/create', isLogin, offerController.createOffer);
adminRouter.post('/dashboard/offers/:id/toggle-status',isLogin,  offerController.toggleOfferStatus);
adminRouter.get('/dashboard/offers/:id', isLogin, offerController.getOfferDetails);
adminRouter.post('/dashboard/offers/:id/edit', isLogin, offerController.editOffer);
adminRouter.post('/dashboard/offers/:id/delete',  offerController.deleteOffer);

// coupons

adminRouter.get('/dashboard/coupons', isLogin,adminController.listCoupons);
adminRouter.get('/dashboard/coupons/create',isLogin, adminController.showCreateCouponForm);
adminRouter.post('/dashboard/coupons/create', isLogin,adminController.createCoupon);
adminRouter.get('/dashboard/coupons/:id', isLogin,adminController.getCouponById);
adminRouter.post('/dashboard/coupons/edit',isLogin, adminController.updateCoupon);

adminRouter.post('/dashboard/coupons/toggle-status/:id',isLogin, adminController.toggleCouponStatus);

adminRouter.get('/sales-report',isLogin, adminController.getSalesReport);
adminRouter.get('/download-report',isLogin, adminController.downloadSalesReport);
adminRouter.post('/adminLogout', adminController.adminLogout);






module.exports = adminRouter;

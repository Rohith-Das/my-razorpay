const User = require('../model/userModel');
const Category = require('../model/categoryModel');
const Brand = require('../model/brandModel');
const Product = require('../model/productModel');
const bcrypt = require('bcrypt');
const { query } = require('express');
const multer = require('../middleware/multer');
const Order = require('../model/orderModel');
const Offer= require('../model/offerModel');
const Coupon=require('../model/couponModel');
const moment = require('moment');
const PDFDocument = require('pdfkit');
const excel = require('excel4node');



const adminLogin = async (req, res) => {
    try {
        res.render('adminLogin');
    } catch (error) {
        res.send(error.message);
    }
}

const adminDash = async (req, res) => {
    try {
        const { filter, startDate, endDate, page = 1, limit = 10 } = req.query;
        const pageNumber = parseInt(page);
        const limitNumber = parseInt(limit);

        // Date filter setup
        let dateFilter = {};
        if (filter === 'daily') {
            dateFilter = {
                createdAt: {
                    $gte: moment().startOf('day').toDate(),
                    $lte: moment().endOf('day').toDate(),
                },
            };
        } else if (filter === 'weekly') {
            dateFilter = {
                createdAt: {
                    $gte: moment().startOf('week').toDate(),
                    $lte: moment().endOf('week').toDate(),
                },
            };
        } else if (filter === 'monthly') {
            dateFilter = {
                createdAt: {
                    $gte: moment().startOf('month').toDate(),
                    $lte: moment().endOf('month').toDate(),
                },
            };
        } else if (filter === 'yearly') {
            dateFilter = {
                createdAt: {
                    $gte: moment().startOf('year').toDate(),
                    $lte: moment().endOf('year').toDate(),
                },
            };
        } else if (filter === 'custom' && startDate && endDate) {
            dateFilter = {
                createdAt: {
                    $gte: moment(startDate).startOf('day').toDate(),
                    $lte: moment(endDate).endOf('day').toDate(),
                },
            };
        }

        // Get overall sales data
        const aggregateResult = await Order.aggregate([
            { $match: dateFilter },
            {
                $group: {
                    _id: null,
                    overallOrderAmount: { $sum: '$total_amount' },
                    overallDiscount: { $sum: { $ifNull: ['$coupon_discount', 0] } },
                    overallSalesCount: { $sum: 1 },
                },
            },
        ]);

        const { overallOrderAmount = 0, overallDiscount = 0, overallSalesCount = 0 } =
            aggregateResult[0] || {};

        const totalOrders = await Order.countDocuments(dateFilter);
        const orders = await Order.find(dateFilter)
            .populate('user_id')
            .skip((pageNumber - 1) * limitNumber)
            .limit(limitNumber)
            .sort({ createdAt: -1 });

        const orderDetails = orders.map(order => ({
            orderDate: moment(order.createdAt).format('YYYY-MM-DD'),
            orderId: order.order_id,
            customerName: order.user_id?.name || 'Unknown',
            paymentMethod: order.payment_type,
            couponCode: order.coupon_details ? order.coupon_details.code : 'N/A',
            orderStatus: order.payment_status,
            discount: order.coupon_discount || 0,
            itemQuantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
            totalAmount: order.total_amount,
        }));

        // Fetch Top 10 selling products
     
        // top
        const topSellingProducts = await Order.aggregate([
            {$unwind : "$items"},
            {$group :{
                _id : "$items.product_id",
                totalSold : {$sum : "$items.quantity"}
            }},
            { $lookup:{
                from:"products",
                localField: "_id",
                foreignField: "_id",
                as: "productDetails"
            }},
            { $unwind: "$productDetails" },
            { $sort: { totalSold: -1 }},
            { $limit: 10 },
            { $project: {
                _id: 1,
                productName: "$productDetails.productName",
                totalSold: 1,
                price: "$productDetails.price",
                brand: "$productDetails.brand"
            }}

        ]);
        const topSellingBrands = await Order.aggregate([
            { $unwind: "$items" },
            { $lookup: {
                from: "products", // Make sure this matches your Product collection name
                localField: "items.product_id",
                foreignField: "_id",
                as: "productDetails"
            }},
            { $unwind: "$productDetails" },
            { $group: {
                _id: "$productDetails.brand", // Assuming brand ID is stored in productDetails.brand
                totalSold: { $sum: "$items.quantity" }
            }},
            { $lookup: {
                from: "brands", // Make sure this matches your Brand collection name
                localField: "_id",
                foreignField: "_id",
                as: "brandDetails"
            }},
            { $unwind: "$brandDetails" },
            { $sort: { totalSold: -1 }},
            { $limit: 10 },
            { $project: {
                _id: 1,
                brandName: "$brandDetails.brandName",
                totalSold: 1
            }}
        ]);
        const topSellingCategories = await Order.aggregate([
            { $unwind: "$items" },
            { $lookup: {
                from: "products", // Make sure this matches your Product collection name
                localField: "items.product_id",
                foreignField: "_id",
                as: "productDetails"
            }},
            { $unwind: "$productDetails" },
            { $group: {
                _id: "$productDetails.category", // Assuming category ID is stored in productDetails.category
                totalSold: { $sum: "$items.quantity" }
            }},
            { $lookup: {
                from: "categories", // Make sure this matches your Category collection name
                localField: "_id",
                foreignField: "_id",
                as: "categoryDetails"
            }},
            { $unwind: "$categoryDetails" },
            { $sort: { totalSold: -1 }},
            { $limit: 10 },
            { $project: {
                _id: 1,
                categoryName: "$categoryDetails.categoryName",
                totalSold: 1
            }}
        ]);



        // Pagination calculation
        const totalPages = Math.ceil(totalOrders / limitNumber);
        const hasNextPage = pageNumber < totalPages;
        const hasPrevPage = pageNumber > 1;

        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.json({
                overallSalesCount,
                overallOrderAmount,
                overallDiscount,
                orders: orderDetails,
                topSellingProducts,
                pagination: {
                    currentPage: pageNumber,
                    totalPages,
                    hasNextPage,
                    hasPrevPage,
                    totalOrders: overallSalesCount,
                },
            });
        }

        res.render('adminDashboard', {
            filter,
            topSellingProducts,
            topSellingBrands,
            topSellingCategories,
            startDate: startDate || '',
            endDate: endDate || '',
            overallSalesCount,
            overallOrderAmount,
            overallDiscount,
            orders: orderDetails,
            topSellingProducts,
            pagination: {
                currentPage: pageNumber,
                totalPages,
                hasNextPage,
                hasPrevPage,
                totalOrders: overallSalesCount,
            },
        });
    } catch (error) {
        console.error('Error fetching sales data:', error);
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(500).json({ error: 'Error fetching sales data' });
        }
        res.status(500).send('Error loading dashboard');
    }
};


const verifyAdmin = async (req, res) => {
    try {
        const email = req.body.email;
        const password = req.body.password;
        const userData = await User.findOne({ email: email });

        if (userData) {
            if (userData.is_blocked) {
                return res.render('adminLogin', { message: "Your account is blocked. Please contact support." });
            }
            const passwordMatch = await bcrypt.compare(password, userData.password);

            if (passwordMatch) {
                if (userData.is_admin === 1) {
                    req.session.admin_id = userData._id; 
                    res.redirect("/admin/dashboard");
                } else {
                    res.render('adminLogin', { message: "Email and password are incorrect" });
                }
            } else {
                res.render('adminLogin', { message: "Email and password are incorrect" });
            }
        } else {
            res.render('adminLogin', { message: "Email and password are incorrect" });
        }
    } catch (error) {
        res.send(error.message);
    }
};



const allCustomers = async (req, res) => {
    try {
        const search = req.query.search || '';
        const page = parseInt(req.query.page) || 1;
        const limit = 10; 
        const skip = (page - 1) * limit;

        const query = {
            is_admin: 0,
            $or: [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ]
        };
        const totalUsers = await User.countDocuments(search ? query : { is_admin: 0 });
        const totalPages = Math.ceil(totalUsers / limit);

        const users = await User.find(search ? query : { is_admin: 0 })
            .skip(skip)
            .limit(limit);

        res.render('customer3', { 
            users, 
            search, 
            currentPage: page, 
            totalPages,
            totalUsers
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
    }
};

// Block User
const blockUser = async (req, res) => {
    try {
        const userId = req.params.userId;
        await User.findByIdAndUpdate(userId, { is_blocked: true });
        res.redirect('/admin/dashboard/allcustomer');
    } catch (error) {
        res.send(error.message);
    }
};

// Unblock User
const unblockUser = async (req, res) => {
    try {
        const userId = req.params.userId;
        await User.findByIdAndUpdate(userId, { is_blocked: false });
        res.redirect('/admin/dashboard/allcustomer');
    } catch (error) {
        res.send(error.message);
    }
};





const loadBrand = async (req, res) => {
    try {
        const search = req.query.search || ''; 
        const page = parseInt(req.query.page) || 1;
        const limit = 5; 
        const skip = (page - 1) * limit; 
      
        const query = search 
            ? { name: { $regex: search, $options: 'i' } } 
            : {};

        const totalBrands = await Brand.countDocuments(query);
        const brands = await Brand.find(query)
            .skip(skip)
            .limit(limit);
        const totalPages = Math.ceil(totalBrands / limit);
        res.render('brands', {
            brands,
            currentPage: page,
            totalPages,
            totalBrands,
            search
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
    }
};


const addBrand = async (req, res) => {
    try {
        const { brandName, description, status } = req.body;
        const existingBrand = await Brand.findOne({ brandName });

        if (existingBrand) {
            const brands = await Brand.find();
            return res.render('brands', { 
                brands, 
                message: 'Brand already exists' 
            });
        }
        const newBrand = new Brand({ brandName, description, is_deleted: status === 'unlisted' });
        await newBrand.save();
        res.redirect('/admin/dashboard/brandList');
    } catch (error) {
        res.status(500).send(error.message);
    }
};
const editBrand = async (req, res) => {
    try {
        const { id, brandName, description, status } = req.body;

        // Check for duplicate brand name
        const existingBrand = await Brand.findOne({ brandName, _id: { $ne: id } });

        if (existingBrand) {
            const brands = await Brand.find();
            return res.render('brands', { 
                brands, 
                message: 'Brand name already exists' 
            });
        }

        const updatedBrand = await Brand.findByIdAndUpdate(id, { brandName, description, is_deleted: status === 'unlisted' }, { new: true });

        if (updatedBrand) {
            res.redirect('/admin/dashboard/brandList');
        } else {
            res.redirect('/admin/dashboard/brandList', { message: 'Brand not found' });
        }
    } catch (error) {
        res.status(500).send(error.message);
    }
};


const toggleBrandStatus = async (req, res) => {
    try {
        const { brandId } = req.params;
        const brand = await Brand.findById(brandId);

        if (brand) {
            brand.is_deleted = !brand.is_deleted;
            await brand.save();

            res.json({ success: true, message: 'Brand status updated successfully' });
        } else {
            res.status(404).json({ success: false, message: 'Brand not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Function to get active categories
const getActiveCategories = async () => {
    return await Category.find({ is_delete: false, status: 'active' });
};

// Function to get active brands
const getActiveBrands = async () => {
    return await Brand.find({ is_deleted: false });
};



  const loadOrderList = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query;

        const totalOrders = await Order.countDocuments({
            $or: [
                { order_id: { $regex: search, $options: 'i' } },
                { 'user_id.name': { $regex: search, $options: 'i' } },
                { payment_status: { $regex: search, $options: 'i' } }
            ]
        });

        const totalPages = Math.ceil(totalOrders / limit);
        const currentPage = Math.max(1, Math.min(page, totalPages)); 

        const orders = await Order.find({
            $or: [
                { order_id: { $regex: search, $options: 'i' } },
                { 'user_id.name': { $regex: search, $options: 'i' } },
                { payment_status: { $regex: search, $options: 'i' } }
            ]
        })
        .populate('user_id')
        .sort({ createdAt: -1 })
        .skip((currentPage - 1) * limit)
        .limit(limit);

        res.render('adminOrderList', { orders, currentPage, totalPages, search });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).send('Error fetching orders');
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const { orderId, itemId, status } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const item = order.items.id(itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Order item not found' });
        }
        const statusTransitions = {
            'Pending': ['Processing'],
            'Processing': ['Shipped'],
            'Shipped': ['Delivered'],
            'Delivered': ['Cancelled', 'Returned'],
            'Cancelled': [],
            'Return Requested': ['Returned', 'Rejected'],
            'Returned': [],
            'Rejected': []
        };
        if (!statusTransitions[item.status].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status change' });
        }

        item.status = status;
        await order.save();

        res.json({ success: true, message: 'Order status updated successfully' });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ success: false, message: 'Failed to update order status' });
    }
};
// coupon management
const listCoupons = async (req, res) => {
    try {
      const page = parseInt(req.query.page || 1);
      const limit = 10;
      const skip = (page - 1) * limit;
      
      const totalCoupons = await Coupon.countDocuments();
      const totalPages = Math.ceil(totalCoupons / limit);
      const coupons = await Coupon.find().skip(skip).limit(limit).sort({createdAt: -1});
      
      res.render('couponList', { 
        coupons,
        currentPage: page,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        totalCoupons 
      });
    } catch (error) {
      console.error('Error fetching coupons:', error);
      res.status(500).send('Error fetching coupons');
    }
  };
  const showCreateCouponForm = async (req, res) => {
    try {
      res.render('coupon');
    } catch (error) {
      console.error('Error rendering create coupon form:', error);
      res.status(500).send('Error displaying the create coupon form');
    }
  };
  
  // Create Coupon
  const createCoupon = async (req, res) => {
    try {
      const { code, description, discount, minAmount, maxDiscount, expiryDate } = req.body;
      const newCoupon = new Coupon({
        code,
        description,
        discount,
        minAmount,
        maxDiscount,
        expiryDate
      });
      const currentDate = new Date();
      
      if (new Date(currentDate) > expiryDate) {
        return res.status(400).json({ success: false, message: "Expire date must be in the future" });
      }
  
      await newCoupon.save();
  
      // Fetch updated coupon list to get pagination variables
      const totalCoupons = await Coupon.countDocuments();
      const limit = 10;
      const totalPages = Math.ceil(totalCoupons / limit);
      const coupons = await Coupon.find().sort({ createdAt: -1 }).limit(limit);
      const currentPage = 1; // Reset to page 1 or set to the appropriate page
  
      // Render couponList with all necessary variables
      res.render('couponList', {
        successMessage: 'Coupon created successfully!',
        coupons,
        currentPage,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
        totalCoupons
      });
      
    } catch (error) {
      console.error('Error creating coupon:', error);
      res.render('coupon', { errorMessage: 'Error creating coupon. Please try again.' });
    }
  };
  
  
  // Get Coupon by ID (for Edit Modal)
  const getCouponById = async (req, res) => {
    try {
      const coupon = await Coupon.findById(req.params.id);
      if (!coupon) {
        return res.status(404).json({ message: 'Coupon not found' });
      }
      res.json(coupon);
    } catch (error) {
      console.error('Error fetching coupon:', error);
      res.status(500).json({ message: 'Error fetching coupon' });
    }
  };
  
 // Update Coupon
const updateCoupon = async (req, res) => {
    try {
      const { id, code, description, discount, minAmount, maxDiscount, expiryDate } = req.body;
      await Coupon.findByIdAndUpdate(id, {
        code,
        description,
        discount,
        minAmount,
        maxDiscount,
        expiryDate
      });
      const currentDate=new Date();
      if(new Date(currentDate ) < expiryDate){
        return res.status(400).json({ success: false, message: "Expire date must be in the future" });
      }
      const page = 1; 
      const limit = 10;
      const totalCoupons = await Coupon.countDocuments();
      const totalPages = Math.ceil(totalCoupons / limit);
      const coupons = await Coupon.find().limit(limit).sort({createdAt: -1});
      res.render('couponList', { 
        successMessage: 'Coupon updated successfully!', 
        coupons,
        currentPage: page,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        totalCoupons 
      });
    } catch (error) {
      console.error('Error updating coupon:', error);
      const page = 1;
      const limit = 10;
      const totalCoupons = await Coupon.countDocuments();
      const totalPages = Math.ceil(totalCoupons / limit);
      const coupons = await Coupon.find().limit(limit).sort({createdAt: -1});
  
      res.render('couponList', { 
        errorMessage: 'Error updating coupon. Please try again.', 
        coupons,
        currentPage: page,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        totalCoupons 
      });
    }
  };
 // Toggle Coupon Status (List/Unlist)
const toggleCouponStatus = async (req, res) => {
    try {
      const coupon = await Coupon.findById(req.params.id);
      if (!coupon) {
        return res.status(404).send('Coupon not found');
      }
      coupon.status = coupon.status === 'active' ? 'inactive' : 'active';
      await coupon.save();
  
      const page=req.query.page ||1;
      res.redirect(`/admin/dashboard/coupons?page=${page}`);  
    } catch (error) {
      console.error('Error toggling coupon status:', error);
      const coupons = await Coupon.find();
      res.render('couponList', { errorMessage: 'Error toggling coupon status. Please try again.', coupons });
    }
  };

// Sales report start here
const getSalesReport = async (req, res) => {
    try {
        const { filter, startDate, endDate, page = 1, limit = 10 } = req.query;
        let dateFilter = {};
        if (filter === 'daily') {
            dateFilter = { $gte: moment().startOf('day').toDate(), $lte: moment().endOf('day').toDate() };
        } else if (filter === 'weekly') {
            dateFilter = { $gte: moment().startOf('isoWeek').toDate(), $lte: moment().endOf('isoWeek').toDate() };
        } else if (filter === 'monthly') {
            dateFilter = { $gte: moment().startOf('month').toDate(), $lte: moment().endOf('month').toDate() };
        } else if (filter === 'yearly') {
            dateFilter = { $gte: moment().startOf('year').toDate(), $lte: moment().endOf('year').toDate() };
        } else if (filter === 'custom' && startDate && endDate) {
            dateFilter = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }
        const totalOrders = await Order.countDocuments({ created_at: { $gte: dateFilter.$gte, $lte: dateFilter.$lte } });
        const aggregateResult = await Order.aggregate([
            { $match: { created_at: { $gte: dateFilter.$gte, $lte: dateFilter.$lte } } },
            { $group: {
                _id: null,
                totalSales: { $sum: '$total_amount' },
                totalDiscount: { $sum: { $ifNull: ['$coupon_discount', 0] } }
            }}
        ]);

        const overallOrderAmount = aggregateResult.length > 0 ? aggregateResult[0].totalSales : 0;
        const overallDiscount = aggregateResult.length > 0 ? aggregateResult[0].totalDiscount : 0;
        const orders = await Order.find({ created_at: { $gte: dateFilter.$gte, $lte: dateFilter.$lte } })
            .populate('user_id')
            .skip((page - 1) * limit)
            .limit(Number(limit));

        const orderDetails = orders.map(order => ({
            orderDate: moment(order.created_at).format('YYYY-MM-DD'),
            orderId: order.order_id,
            customerName: order.user_id ? order.user_id.name : 'No Name',
            paymentMethod: order.payment_type,
            couponCode: order.coupon_details ? order.coupon_details.code : 'N/A',
            orderStatus: order.payment_status,
            discount: order.coupon_discount || 0,
            itemQuantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
            totalAmount: order.total_amount
        }));

        const totalPages = Math.ceil(totalOrders / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;
        res.json({
            overallSalesCount: totalOrders,
            overallOrderAmount,
            overallDiscount,
            orders: orderDetails,
            pagination: {
                currentPage: Number(page),
                totalPages,
                totalOrders,
                hasNextPage,
                hasPrevPage
            }
        });
    } catch (error) {
        console.error('Error generating sales report:', error);
        res.status(500).json({ message: 'Failed to generate sales report.' });
    }
};
const downloadSalesReport = async (req, res) => {
    try {
        const { filter, startDate, endDate, format } = req.query;
        let dateFilter = {};
        if (filter === 'daily') {
            dateFilter = { $gte: moment().startOf('day').toDate(), $lte: moment().endOf('day').toDate() };
        } else if (filter === 'weekly') {
            dateFilter = { $gte: moment().startOf('isoWeek').toDate(), $lte: moment().endOf('isoWeek').toDate() };
        } else if (filter === 'monthly') {
            dateFilter = { $gte: moment().startOf('month').toDate(), $lte: moment().endOf('month').toDate() };
        } else if (filter === 'yearly') {
            dateFilter = { $gte: moment().startOf('year').toDate(), $lte: moment().endOf('year').toDate() };
        } else if (filter === 'custom' && startDate && endDate) {
            dateFilter = { $gte: new Date(startDate), $lte: new Date(endDate) };
        } else {
            throw new Error('Invalid date filter');
        }

        const orders = await Order.find({ createdAt: dateFilter }).populate('user_id');

        if (orders.length === 0) {
            return res.status(404).json({ message: 'No orders found for the specified date range.' });
        }

        if (format === 'pdf') {
            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=sales_report.pdf');
            
            doc.pipe(res);
            doc.fontSize(18).text('Sales Report', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Date Range: ${moment(dateFilter.$gte).format('YYYY-MM-DD')} to ${moment(dateFilter.$lte).format('YYYY-MM-DD')}`);
            doc.moveDown();
            // Define table structure
            const table = {
                headers: ['Order Date', 'Customer Name', 'Payment Method', 'Order Status', 'Discount', 'Total Amount'],
                rows: []
            };
            orders.forEach(order => {
                table.rows.push([
                    moment(order.createdAt).format('YYYY-MM-DD'),
                    order.user_id ? order.user_id.name : 'Guest User',
                    order.payment_type,
                    order.payment_status,
                    `$${(order.coupon_discount || 0).toFixed(2)}`,
                    `$${order.total_amount.toFixed(2)}`
                ]);
            });
            // Draw the table
            const startY = 150;
            const rowHeight = 20;
            const colWidths = [80, 100, 80, 80, 60, 80];

            // Draw headers
            doc.font('Helvetica-Bold');
            table.headers.forEach((header, i) => {
                doc.text(header, 50 + colWidths.slice(0, i).reduce((sum, w) => sum + w, 0), startY);
            });

            // Draw rows
            doc.font('Helvetica');
            let currentY = startY + rowHeight;
            table.rows.forEach((row, rowIndex) => {
                if (currentY > 700) {
                    doc.addPage();
                    doc.text('Sales Report (Continued)', { align: 'center' });
                    doc.moveDown();
                    currentY = 100;
                    // Redraw headers on new page
                    doc.font('Helvetica-Bold');
                    table.headers.forEach((header, i) => {
                        doc.text(header, 50 + colWidths.slice(0, i).reduce((sum, w) => sum + w, 0), currentY);
                    });
                    doc.font('Helvetica');
                    currentY += rowHeight;
                }
                row.forEach((cell, cellIndex) => {
                    doc.text(cell, 50 + colWidths.slice(0, cellIndex).reduce((sum, w) => sum + w, 0), currentY);
                });
                currentY += rowHeight;
            });

            // Add summary
            doc.addPage();
            doc.fontSize(14).text('Summary', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Total Orders: ${orders.length}`);
            doc.text(`Total Sales: $${orders.reduce((sum, order) => sum + order.total_amount, 0).toFixed(2)}`);
            doc.text(`Total Discount: $${orders.reduce((sum, order) => sum + (order.coupon_discount || 0), 0).toFixed(2)}`);

            doc.end();
        } else if (format === 'excel') {
            const workbook = new excel.Workbook();
            const worksheet = workbook.addWorksheet('Sales Report');
            const headerStyle = workbook.createStyle({
                font: { bold: true, color: '#FFFFFF' },
                fill: { type: 'pattern', patternType: 'solid', fgColor: '#4472C4' }
            });

            const headers = ['Order Date', 'Customer Name', 'Payment Method', 'Order Status', 'Discount', 'Total Amount'];
            headers.forEach((header, index) => {
                worksheet.cell(1, index + 1).string(header).style(headerStyle);
            });
            orders.forEach((order, index) => {
                const row = index + 2;
                worksheet.cell(row, 1).string(moment(order.createdAt).format('YYYY-MM-DD'));
                worksheet.cell(row, 2).string(order.user_id ? order.user_id.name : 'Guest User');
                worksheet.cell(row, 3).string(order.payment_type);
                worksheet.cell(row, 4).string(order.payment_status);
                worksheet.cell(row, 5).number(order.coupon_discount || 0);
                worksheet.cell(row, 6).number(order.total_amount);
            });
            const summaryRow = orders.length + 3;
            worksheet.cell(summaryRow, 1).string('Summary').style({ font: { bold: true } });
            worksheet.cell(summaryRow + 1, 1).string(`Total Orders: ${orders.length}`);
            worksheet.cell(summaryRow + 2, 1).string(`Total Sales: $${orders.reduce((sum, order) => sum + order.total_amount, 0).toFixed(2)}`);
            worksheet.cell(summaryRow + 3, 1).string(`Total Discount: $${orders.reduce((sum, order) => sum + (order.coupon_discount || 0), 0).toFixed(2)}`);

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=sales_report.xlsx');

            workbook.write('sales_report.xlsx', res);
        } else {
            throw new Error('Invalid format specified');
        }
    } catch (error) {
        console.error('Error in downloadSalesReport:', error);
        res.status(500).json({ 
            message: 'Failed to generate sales report', 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};
const adminLogout = async (req,res)=>{
    req.session.destroy(err => {
        if (err) {
            return res.send(err.message);
        }
        res.redirect('/home');
    });
}

module.exports = {
  
    adminLogin,
    adminDash,
    
    verifyAdmin,
    allCustomers,
    blockUser,
    unblockUser,
    loadBrand,
    editBrand,
    addBrand,
    toggleBrandStatus,
    loadOrderList,
    updateOrderStatus,
   
    listCoupons,
    createCoupon,
    showCreateCouponForm,
    getCouponById,
    updateCoupon,
    
    toggleCouponStatus,
    getSalesReport,
    downloadSalesReport ,
    adminLogout

};

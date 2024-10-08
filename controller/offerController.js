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



const listOffers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1; 
        const limit = parseInt(req.query.limit) || 10; 
        const skip = (page - 1) * limit;
        const offers = await Offer.find()
            .populate('productIds', 'productName')
            .populate('categoryIds', 'categoryName')
            .skip(skip)
            .limit(limit)
            .exec();

        const products = await Product.find({ is_deleted: false }).select('productName');
        const categories = await Category.find({ is_delete: false }).select('categoryName');
        const totalOffer=await Offer.countDocuments();

        res.render('offerList', { offers, products, categories,currentPage:page,totalPages:Math.ceil(totalOffer/limit) });
    } catch (error) {
        console.error("Error fetching offers:", error);
        res.status(500).send("Error fetching offers: " + error.message);
    }
};


const createOfferForm = async (req, res) => {
    try {
        const products = await Product.find({ is_deleted: false }).select('productName');
        const categories = await Category.find({ is_delete: false }).select('categoryName');
        res.render('offer', { products, categories });
    } catch (error) {
        res.status(500).send("Error fetching products and categories");
    }
};
const createOffer = async (req, res) => {
    try {
        const { offerName, discount, expireDate, offerType, references } = req.body;
        console.log('Received offer data:', { offerName, discount, expireDate, offerType, references });
        if (!Array.isArray(references) || references.length === 0) {
            throw new Error('No products or categories selected');
        }
        const newOffer = new Offer({
            offerName,
            discount,
            expireDate,
            offerType,
            productIds: offerType === 'product' ? references : [],
            categoryIds: offerType === 'category' ? references : [],
        });
        await newOffer.save();
        console.log('New offer created:', newOffer);
        const calculateDiscountedPrice = (price, discount) => {
            return Math.round(price * (1 - discount / 100));
        };
        let productsToUpdate = [];
        if (offerType === 'product') {
            productsToUpdate = await Product.find({ _id: { $in: references } });
        } else if (offerType === 'category') {
            productsToUpdate = await Product.find({ category: { $in: references } });
        }

        console.log(`Found ${productsToUpdate.length} products to update`);
        const updatePromises = productsToUpdate.map(async (product) => {
            console.log(`Updating product: ${product._id}`);
            product.offer = newOffer._id;
            product.discountedPrice = calculateDiscountedPrice(product.price, newOffer.discount);
            return product.save();
        });

        const updatedProducts = await Promise.all(updatePromises);
        console.log(`Updated ${updatedProducts.length} products`);

        res.redirect('/admin/dashboard/offers');
    } catch (error) {
        console.error("Error creating offer:", error);
        res.status(500).send("Error creating offer: " + error.message);
    }
};
const toggleOfferStatus = async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id);
        if (!offer) {
            return res.status(404).json({ success: false, message: "Offer not found" });
        }

        const newStatus = req.body.newStatus;
        if (newStatus !== 'active' && newStatus !== 'inactive') {
            return res.status(400).json({ success: false, message: "Invalid status" });
        }

        offer.status = newStatus;
        await offer.save();

        let productsToUpdate = [];
        if (offer.offerType === "product") {
            productsToUpdate = await Product.find({ _id: { $in: offer.productIds } });
        } else if (offer.offerType === "category") {
            productsToUpdate = await Product.find({ category: { $in: offer.categoryIds } });
        }

        const calculateDiscountedPrice = (price, discount) => {
            return Math.round(price * (1 - discount / 100));
        };

        for (const product of productsToUpdate) {
            if (newStatus === "inactive") {
                if (product.offer && product.offer.toString() === offer._id.toString()) {
                    product.offer = null;
                    product.discountedPrice = product.price;
                }
            } else {
                if (!product.offer || (product.offer && offer.discount > product.offer.discount)) {
                    product.offer = offer._id;
                    product.discountedPrice = calculateDiscountedPrice(product.price, offer.discount);
                }
            }
            await product.save();
        }

        res.json({ success: true, message: `Offer status updated to ${newStatus}` });
    } catch (error) {
        console.error("Error toggling offer status:", error);
        res.status(500).json({ success: false, message: "Error toggling offer status: " + error.message });
    }
};

const getOfferDetails = async (req, res) => {
    try {
        
        const offer = await Offer.findById(req.params.id)
            .populate('productIds', 'productName')
            .populate('categoryIds', 'categoryName');
            
        res.json(offer);
    } catch (error) {
        console.error("Error fetching offer details:", error);
        res.status(500).json({ error: "Error fetching offer details" });
    }
};

const editOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const { offerName, discount, expireDate, offerType, references } = req.body;

        const parsedDiscount = parseFloat(discount);
        if (isNaN(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100) {
            return res.status(400).json({ success: false, message: "Invalid discount value" });
        }

        const updatedOffer = await Offer.findByIdAndUpdate(
            id,
            {
                offerName,
                discount: parsedDiscount,
                expireDate,
                offerType,
                productIds: offerType === 'product' ? references : [],
                categoryIds: offerType === 'category' ? references : [],
            },
            { new: true, runValidators: true }
        );
        const currentDate = new Date();
        if (new Date(expireDate) < currentDate) {
            return res.status(400).json({ success: false, message: "Expire date must be in the future" });
        }
        
        if (!updatedOffer) {
            return res.status(404).json({ success: false, message: "Offer not found" });
        }

        const calculateDiscountedPrice = (price, discount) => {
            return Math.round(price * (1 - discount / 100));
        };

        let productsToUpdate = [];
        if (offerType === 'product') {
            productsToUpdate = await Product.find({ _id: { $in: references } });
        } else if (offerType === 'category') {
            productsToUpdate = await Product.find({ category: { $in: references } });
        }
        for (const product of productsToUpdate) {
            product.offer = updatedOffer._id;
            product.discountedPrice = calculateDiscountedPrice(product.price, updatedOffer.discount);
            await product.save();
        }

        res.json({ success: true, message: "Offer updated successfully and applied to products" });
    } catch (error) {
        console.error("Error updating offer:", error);
        res.status(500).json({ success: false, message: "Error updating offer: " + error.message });
    }
};
const deleteOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const offer = await Offer.findByIdAndDelete(id);

        if (!offer) {
            return res.status(404).json({ success: false, message: "Offer not found" });
        }
        let productsToUpdate = [];
        if (offer.offerType === 'product') {
            productsToUpdate = await Product.find({ _id: { $in: offer.productIds } });
        } else if (offer.offerType === 'category') {
            productsToUpdate = await Product.find({ category: { $in: offer.categoryIds } });
        }

        for (const product of productsToUpdate) {
            if (product.offer && product.offer.toString() === offer._id.toString()) {
                product.offer = null;
                product.discountedPrice = product.price; 
                await product.save();
            }
        }

        res.redirect('/admin/dashboard/offers');
    } catch (error) {
        console.error("Error deleting offer:", error);
        res.status(500).send("Error deleting offer: " + error.message);
    }
};

module.exports={
    createOffer,
    createOfferForm ,
    listOffers,
    toggleOfferStatus,
    getOfferDetails,
    editOffer,
    deleteOffer,
   
}
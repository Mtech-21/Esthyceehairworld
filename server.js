const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log('Connected to EsthyCee Database Hub'))
    .catch(err => console.error('Database connection error:', err));


const UserSchema = new mongoose.Schema({
    contact: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    password: { type: String, required: true },
    name: String, country: String, address: String,
    shoppingBag: { type: Array, default: [] },
    resetToken: { type: String, default: null }
});
const User = mongoose.model('User', UserSchema);

const ProductSchema = new mongoose.Schema({
    title: { type: String, required: true },
    priceNGN: { type: Number, required: true },
    priceGHS: { type: Number, required: true },
    image: { type: String, default: 'https://placehold.co/300x400?text=Premium+Hair' },
    description: { type: String, default: 'Premium authentic selection.' },
    origin: { type: String, default: 'Vietnamese' },
    instock: { type: Boolean, default: true },
    allocatedStock: { type: Number, default: 5 },
    avgRating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 }
});
const Product = mongoose.model('Product', ProductSchema);

const OrderSchema = new mongoose.Schema({
    userContact: { type: String, required: true },
    customerName: String, customerPhone: String,
    deliveryAddress: String, country: String,
    currency: String, currencySymbol: String,
    items: { type: Array, default: [] },
    total: Number,
    paystackRef: { type: String, unique: true },
    createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', OrderSchema);

const ReviewSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    userContact: { type: String, required: true },
    userName: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
ReviewSchema.index({ productId: 1, userContact: 1 }, { unique: true });
const Review = mongoose.model('Review', ReviewSchema);


const JWT_SECRET = process.env.JWT_SECRET || 'ESTHYCEE_SUPER_SECRET_KEY';

const mailerPipeline = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findOne({ contact: decoded.contact });
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        req.user = user;
        next();
    } catch (err) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }
};

const dispatchSecurityEmail = async (to, subject, body) => {
    try {
        await mailerPipeline.sendMail({ from: `"EsthyCee Hair World" <${process.env.EMAIL_USER}>`, to, subject, text: body });
        return true;
    } catch (err) { console.error("Mail error:", err); return false; }
};

const recalcProductRating = async (productId) => {
    const reviews = await Review.find({ productId });
    const avg = reviews.length > 0
        ? parseFloat((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1))
        : 0;
    await Product.findByIdAndUpdate(productId, { avgRating: avg, reviewCount: reviews.length });
};


app.post('/api/auth/sync-profile', async (req, res) => {
    const { contact, phone, name, country, address, password } = req.body;
    try {
        let user = await User.findOne({ contact });
        let requiresOTP = false, simulatedCodeField = null;
        if (!user) {
            user = new User({ contact, phone, name, country, address, password });
            await user.save();
            requiresOTP = true;
            simulatedCodeField = Math.floor(100000 + Math.random() * 900000).toString();
            await dispatchSecurityEmail(contact, "🔒 Complete Your EsthyCee Profile Activation Passcode",
                `Hello ${name},\n\nWelcome to EsthyCee Hair World Boutique.\n\nYour Verification Passkey: ${simulatedCodeField}`);
        } else {
            if (user.password !== password)
                return res.status(401).json({ success: false, message: "Check your email and password and try again." });
        }
        const token = jwt.sign({ contact: user.contact }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ success: true, token, user, requiresOTP, simulatedCodeField });
    } catch (err) { console.error("Route error:", err); res.status(500).json({ success: false, error: 'Server error' }); }
});

app.get('/api/auth/me', authenticateToken, (req, res) => res.json({ success: true, user: req.user }));

app.put('/api/auth/update-profile', authenticateToken, async (req, res) => {
    const { contact, phone, country, address } = req.body;
    try {
        const emailChanged = contact && contact !== req.user.contact;
        const phoneChanged = phone && phone !== req.user.phone;
        let requiresOTP = false, simulatedCodeField = null;

        if (emailChanged || phoneChanged) {
            requiresOTP = true;
            simulatedCodeField = Math.floor(100000 + Math.random() * 900000).toString();


            const otpDestination = emailChanged ? contact : req.user.contact;
            const otpSubject = emailChanged
                ? "🔒 Confirm Your New EsthyCee Email Address"
                : "🔒 Security Parameter Update Pending Verification";
            const otpBody = emailChanged
                ? `Hello ${req.user.name},\n\nYou requested to change your EsthyCee account email to this address.\n\nYour Verification Code: ${simulatedCodeField}\n\nIf you did not request this, you can safely ignore this email.`
                : `Hello ${req.user.name},\n\nA phone number update was requested for your profile.\n\nYour Verification Code: ${simulatedCodeField}`;

            await dispatchSecurityEmail(otpDestination, otpSubject, otpBody);
        }

        const updatedUser = await User.findOneAndUpdate(
            { contact: req.user.contact },
            { contact, phone, country, address },
            { returnDocument: 'after' }
        );


        let refreshedToken = null;
        if (emailChanged) {
            refreshedToken = jwt.sign({ contact: updatedUser.contact }, JWT_SECRET, { expiresIn: '30d' });
        }

        res.json({ success: true, user: updatedUser, requiresOTP, simulatedCodeField, token: refreshedToken });
    } catch (err) {
        console.error("Update profile error:", err);

        if (err.code === 11000) {
            return res.status(409).json({ success: false, message: 'That email is already linked to another account. Please use a different email.' });
        }
        res.status(500).json({ success: false, error: 'Update failed.' });
    }
});

app.post('/api/auth/forgot-password', async (req, res) => {
    const { contact } = req.body;
    try {
        const user = await User.findOne({ contact });
        if (!user) return res.status(404).json({ success: false, message: 'No registered profile found.' });
        const token = Math.floor(100000 + Math.random() * 900000).toString();
        user.resetToken = token; await user.save();
        await dispatchSecurityEmail(contact, "🔒 EsthyCee Password Reset Token", `Your reset token is: ${token}`);
        res.json({ success: true, message: 'Reset token sent.' });
    } catch (err) { console.error("Route error:", err); res.status(500).json({ success: false, error: 'Reset failed.' }); }
});

app.post('/api/auth/reset-password', async (req, res) => {
    const { contact, token, newPassword } = req.body;
    try {
        const user = await User.findOne({ contact, resetToken: token });
        if (!user) return res.status(401).json({ success: false, message: 'Invalid token.' });
        user.password = newPassword; user.resetToken = null; await user.save();
        res.json({ success: true, message: 'Password reset successfully.' });
    } catch (err) { console.error("Route error:", err); res.status(500).json({ success: false, error: 'Reset error.' }); }
});

app.post('/api/auth/request-delete-account', authenticateToken, async (req, res) => {
    try {
        const deleteToken = Math.floor(100000 + Math.random() * 900000).toString();
        req.user.resetToken = deleteToken; await req.user.save();
        await dispatchSecurityEmail(req.user.contact, "⚠️ EsthyCee Account Deletion Confirmation",
            `Hello ${req.user.name},\n\nThis is no trial and error. If you delete your account it is permanently gone.\n\nYour deletion code: ${deleteToken}\n\nIf you did not request this, ignore this email.\n\n— EsthyCee Hair World`);
        res.json({ success: true, message: "Deletion code sent to your email." });
    } catch (err) { console.error("Route error:", err); res.status(500).json({ success: false, message: "Failed to send deletion code." }); }
});

app.delete('/api/auth/delete-account', authenticateToken, async (req, res) => {
    const { otp } = req.body;
    try {
        const user = await User.findOne({ _id: req.user._id, resetToken: otp });
        if (!user) return res.status(401).json({ success: false, message: 'Invalid or expired code.' });
        await User.findByIdAndDelete(user._id);
        res.json({ success: true, message: 'Account permanently deleted.' });
    } catch (err) { console.error("Route error:", err); res.status(500).json({ success: false, error: 'Deletion error.' }); }
});


app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find({});
        res.json({ success: true, products });
    } catch (err) { console.error("Route error:", err); res.status(500).json({ success: false, error: 'Failed to retrieve products.' }); }
});

app.patch('/api/products/:id/stock/decrease', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
        if (product.allocatedStock <= 0) return res.status(400).json({ success: false, message: 'Out of stock.' });
        product.allocatedStock = Math.max(0, product.allocatedStock - 1);
        product.instock = product.allocatedStock > 0;
        await product.save();
        res.json({ success: true, product });
    } catch (err) { console.error("Route error:", err); res.status(500).json({ success: false, error: 'Stock update failed.' }); }
});

app.post('/api/admin/products/add', async (req, res) => {
    const { title, priceNGN, priceGHS, image, description, origin, instock, allocatedStock } = req.body;
    try {
        const p = new Product({ title, priceNGN, priceGHS, image, description, origin, instock, allocatedStock });
        await p.save();
        res.json({ success: true, product: p });
    } catch (err) { console.error("Route error:", err); res.status(500).json({ success: false, error: 'Failed to add product.' }); }
});

app.put('/api/admin/products/update/:id', async (req, res) => {
    const { title, priceNGN, priceGHS, instock, allocatedStock } = req.body;
    try {
        const update = { title, priceNGN, priceGHS };
        if (typeof allocatedStock !== 'undefined') { update.allocatedStock = allocatedStock; update.instock = allocatedStock > 0; }
        else if (typeof instock !== 'undefined') update.instock = instock;
        const updated = await Product.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after' });
        if (!updated) return res.status(404).json({ success: false, message: 'Product not found.' });
        res.json({ success: true, product: updated });
    } catch (err) { console.error("Route error:", err); res.status(500).json({ success: false, error: 'Update failed.' }); }
});

app.delete('/api/admin/products/delete/:id', async (req, res) => {
    try {
        const deleted = await Product.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ success: false, message: 'Product not found.' });
        await Review.deleteMany({ productId: req.params.id });
        res.json({ success: true, message: 'Product and its reviews deleted.' });
    } catch (err) { console.error("Route error:", err); res.status(500).json({ success: false, error: 'Deletion failed.' }); }
});


app.post('/api/orders/save', authenticateToken, async (req, res) => {
    const { items, total, currency, currencySymbol, paystackRef, customerName, customerPhone, deliveryAddress, country } = req.body;
    try {
        const order = new Order({
            userContact: req.user.contact, customerName: customerName || req.user.name,
            customerPhone: customerPhone || req.user.phone, deliveryAddress: deliveryAddress || req.user.address,
            country: country || req.user.country, currency, currencySymbol, items, total, paystackRef
        });
        await order.save();
        const sym = currencySymbol || '₦';
        const itemLines = items.map(i => `  • ${i.title} ×${i.quantity} — ${sym}${(i.price * i.quantity).toLocaleString()}`).join('\n');
        await dispatchSecurityEmail(req.user.contact,
            `🧾 Your EsthyCee Hair World Receipt — ${paystackRef}`,
            `Hello ${req.user.name},\n\nThank you for your purchase!\n\n━━━━━━━━━━━━━━━━━━━━━━━━━\nEsthyCee Hair World Receipt\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\nItems:\n${itemLines}\n\nTotal: ${sym}${total.toLocaleString()}\nRef: ${paystackRef}\nDelivery: ${deliveryAddress}\nMarket: ${country}\n\nThank you for shopping with us 🖤\nEsthyCee Hair World\n+2348090887714`
        );
        res.json({ success: true, order });
    } catch (err) {
        console.error("Order save error:", err);
        if (err.code === 11000) return res.json({ success: true, message: 'Order already recorded.' });
        res.status(500).json({ success: false, error: 'Failed to save order.' });
    }
});

app.get('/api/orders/my-orders', authenticateToken, async (req, res) => {
    try {
        const orders = await Order.find({ userContact: req.user.contact }).sort({ createdAt: -1 });
        res.json({ success: true, orders });
    } catch (err) { console.error("Route error:", err); res.status(500).json({ success: false, error: 'Failed to fetch orders.' }); }
});


app.post('/api/reviews/add', authenticateToken, async (req, res) => {
    const { productId, rating, comment } = req.body;
    if (!productId || !rating || !comment)
        return res.status(400).json({ success: false, message: 'Product, rating, and comment are required.' });
    try {
        await Review.findOneAndUpdate(
            { productId, userContact: req.user.contact },
            { userName: req.user.name, rating, comment, createdAt: new Date() },
            { upsert: true, returnDocument: 'after' }
        );
        await recalcProductRating(productId);
        res.json({ success: true, message: 'Review saved.' });
    } catch (err) { console.error("Route error:", err); res.status(500).json({ success: false, error: 'Failed to save review.' }); }
});


app.get('/api/reviews/product/:id', async (req, res) => {
    try {
        const reviews = await Review.find({ productId: req.params.id }).sort({ createdAt: -1 });
        res.json({ success: true, reviews });
    } catch (err) { console.error("Route error:", err); res.status(500).json({ success: false, error: 'Failed to fetch reviews.' }); }
});

app.put('/api/reviews/edit/:id', authenticateToken, async (req, res) => {
    const { comment } = req.body;
    if (!comment || !comment.trim())
        return res.status(400).json({ success: false, message: 'Comment cannot be empty.' });
    try {
        const review = await Review.findOne({ _id: req.params.id, userContact: req.user.contact });
        if (!review) return res.status(404).json({ success: false, message: 'Review not found or not yours.' });
        review.comment = comment.trim();
        await review.save();
        res.json({ success: true, review });
    } catch (err) { console.error("Route error:", err); res.status(500).json({ success: false, error: 'Failed to update review.' }); }
});

app.delete('/api/reviews/delete/:id', authenticateToken, async (req, res) => {
    try {
        const review = await Review.findOne({ _id: req.params.id, userContact: req.user.contact });
        if (!review) return res.status(404).json({ success: false, message: 'Review not found or not yours.' });
        const productId = review.productId;
        await Review.findByIdAndDelete(req.params.id);
        await recalcProductRating(productId);
        res.json({ success: true });
    } catch (err) { console.error("Route error:", err); res.status(500).json({ success: false, error: 'Failed to delete review.' }); }
});


app.post('/api/cart/sync', authenticateToken, async (req, res) => {
    try {
        await User.findOneAndUpdate({ contact: req.user.contact }, { shoppingBag: req.body.shoppingBag });
        res.json({ success: true });
    } catch (err) { console.error("Route error:", err); res.status(500).json({ success: false, error: 'Cart sync failed.' }); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`EsthyCee Engine Online on Port ${PORT}`));
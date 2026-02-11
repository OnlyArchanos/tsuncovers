require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(cors()); // Allows your frontend to talk to this server

// 1. DATABASE CONNECTION
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB (TsundereBot)'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

const gridSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    name: String,
    manga: Array,
    createdAt: { type: Date, default: Date.now }
});
const Grid = mongoose.model('Grid', gridSchema);

// 2. GOOGLE SECURITY CHECK
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const verifyUser = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });
    const token = authHeader.split(' ')[1];
    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        req.userId = ticket.getPayload().sub; // The real Google User ID
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// 3. API ROUTES

// Save a Grid
app.post('/api/grids', verifyUser, async (req, res) => {
    try {
        const newGrid = new Grid({
            userId: req.userId,
            name: req.body.grid.name,
            manga: req.body.grid.manga
        });
        await newGrid.save();
        res.json({ ok: true, id: newGrid._id });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save' });
    }
});

// Get User's Grids
app.get('/api/grids', verifyUser, async (req, res) => {
    try {
        const grids = await Grid.find({ userId: req.userId }).sort({ createdAt: -1 });
        res.json({ grids });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch' });
    }
});

// IMAGE PROXY (Fixes the "Tainted Canvas" / Download Bug)
app.get('/api/proxy', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('No URL');
    try {
        const response = await axios.get(url, { responseType: 'stream' });
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Content-Type', response.headers['content-type']);
        response.data.pipe(res);
    } catch (e) {
        res.status(500).send('Proxy error');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
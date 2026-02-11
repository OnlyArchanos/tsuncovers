require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');

const app = express();
app.use(express.json());

// Allow Vercel frontend to talk to this backend
app.use(cors({
    origin: '*', // We will tighten this later, but for now allow all to prevent errors
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS']
}));

// 1. DATABASE CONNECTION
// This connects to your "TsundereBot" database
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB (TsundereBot)'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// This creates the "covers" collection automatically
const gridSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    name: String,
    manga: Array,
    createdAt: { type: Date, default: Date.now }
});
// The third argument 'covers' forces the collection name
const Grid = mongoose.model('Grid', gridSchema, 'covers');

// 2. GOOGLE SECURITY
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
        req.userId = ticket.getPayload().sub;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// 3. API ROUTES
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
        console.error(err);
        res.status(500).json({ error: 'Failed to save' });
    }
});

app.get('/api/grids', verifyUser, async (req, res) => {
    try {
        const grids = await Grid.find({ userId: req.userId }).sort({ createdAt: -1 });
        res.json({ grids });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch' });
    }
});
app.delete('/api/grids/:id', verifyUser, async (req, res) => {
    try {
        const result = await Grid.findOneAndDelete({ _id: req.params.id, userId: req.userId });
        if (!result) return res.status(404).json({ error: 'Grid not found' });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete' });
    }
});

// PROXY (Fixes the image download bug)
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
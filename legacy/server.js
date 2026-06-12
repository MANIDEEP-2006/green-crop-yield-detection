const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));  // Serve static files

// Setup Multer for uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir);
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Database setup
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        console.log('Connected to the SQLite database.');
        
        // Create Users table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )`);

        // Create Crops table
        db.run(`CREATE TABLE IF NOT EXISTS crops (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT,
            plant_date TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // Create Photos table
        db.run(`CREATE TABLE IF NOT EXISTS photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            crop_id INTEGER,
            photo_url TEXT,
            FOREIGN KEY(crop_id) REFERENCES crops(id) ON DELETE CASCADE
        )`);
    }
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Serve index.html at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- AUTHENTICATION API ---
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, password], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) {
                return res.status(400).json({ error: 'Username already exists' });
            }
            return res.status(500).json({ error: 'Database error' });
        }
        res.status(201).json({ message: 'User created successfully', userId: this.lastID });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!row) return res.status(401).json({ error: 'Invalid username or password' });
        
        res.json({ message: 'Login successful', userId: row.id, username: row.username });
    });
});

// --- CROPS API ---
app.get('/api/crops', (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    db.all('SELECT * FROM crops WHERE user_id = ? ORDER BY id DESC', [userId], (err, crops) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        
        // Fetch photos for these crops
        const cropIds = crops.map(c => c.id);
        if (cropIds.length === 0) return res.json({ crops: [] });

        const placeholders = cropIds.map(() => '?').join(',');
        db.all(`SELECT * FROM photos WHERE crop_id IN (${placeholders})`, cropIds, (err, photos) => {
            if (err) return res.status(500).json({ error: 'Database error while fetching photos' });

            const cropsWithPhotos = crops.map(crop => {
                return {
                    ...crop,
                    photos: photos.filter(p => p.crop_id === crop.id).map(p => p.photo_url)
                };
            });
            res.json({ crops: cropsWithPhotos });
        });
    });
});

app.post('/api/crops', (req, res) => {
    const { userId, name, date } = req.body;
    if (!userId || !name || !date) return res.status(400).json({ error: 'Missing fields' });

    db.run('INSERT INTO crops (user_id, name, plant_date) VALUES (?, ?, ?)', [userId, name, date], function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.status(201).json({ message: 'Crop added', cropId: this.lastID });
    });
});

app.delete('/api/crops/:id', (req, res) => {
    const cropId = req.params.id;
    db.run('DELETE FROM crops WHERE id = ?', [cropId], function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ message: 'Crop deleted successfully' });
    });
});

app.post('/api/crops/:id/photo', upload.single('photo'), (req, res) => {
    const cropId = req.params.id;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const photoUrl = `/uploads/${req.file.filename}`;

    db.run('INSERT INTO photos (crop_id, photo_url) VALUES (?, ?)', [cropId, photoUrl], function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ message: 'Photo uploaded', photoUrl });
    });
});

// --- DISEASE DETECTION (Mock) ---
app.post('/api/disease-detect', upload.single('image'), (req, res) => {
    const { problemText } = req.body;
    
    // Simulate AI Processing delay
    setTimeout(() => {
        res.json({
            disease: 'Leaf Spot',
            note: 'Leaf spot is a descriptive term applied to foliage diseases caused primarily by pathogenic fungi and bacteria. Symptoms typically include brownish, blackish, or yellow spots on the leaves. If ignored, the spots can merge, leading to premature leaf drop, severely stunted growth, and weakened overall plant health.',
            cure: '• Prune and destroy heavily infected leaves immediately to prevent further spread.\n• Ensure proper spacing between plants to improve air circulation and sunlight exposure.\n• Avoid overhead watering; water at the base of the plant to keep the foliage dry.\n• Apply organic fungicidal treatments like Neem oil or Copper-based sprays during the early stages of infection.'
        });
    }, 2000);
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

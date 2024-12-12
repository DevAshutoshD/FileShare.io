const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const multer = require('multer');
const path = require('path');
const qrcode = require('qrcode');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Store active connections
const clients = new Set();

// Serve static files
app.use(express.static('public'));

// Get local IP address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const interface of interfaces[name]) {
            if (interface.family === 'IPv4' && !interface.internal) {
                return interface.address;
            }
        }
    }
    return 'localhost';
}

// Generate QR code for easy mobile access
const serverIP = getLocalIP();
const port = 3000;
const serverUrl = `http://${serverIP}:${port}`;

app.get('/qr', async (req, res) => {
    try {
        const qrImage = await qrcode.toDataURL(serverUrl);
        res.json({ qr: qrImage, url: serverUrl });
    } catch (err) {
        res.status(500).json({ error: 'QR generation failed' });
    }
});

// Handle file uploads
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    // Broadcast the file to all connected clients
    const fileData = {
        type: 'file',
        name: req.file.originalname,
        data: req.file.buffer.toString('base64'),
        mimeType: req.file.mimetype
    };

    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(fileData));
        }
    });

    res.json({ message: 'File uploaded and shared successfully' });
});

// WebSocket connection handling
wss.on('connection', (ws) => {
    clients.add(ws);

    ws.on('message', (message) => {
        // Broadcast text messages to all clients
        const data = JSON.parse(message);
        clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'text',
                    content: data.content
                }));
            }
        });
    });

    ws.on('close', () => {
        clients.delete(ws);
    });
});

server.listen(port, () => {
    console.log(`Server running at ${serverUrl}`);
    console.log('Scan QR code on the homepage to connect from mobile devices');
});
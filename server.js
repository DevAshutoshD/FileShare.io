const express = require('express');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static assets from root directory
app.use(express.static(__dirname));

// Utility to get local IPv4 address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

app.listen(PORT, () => {
    const localIP = getLocalIP();
    console.log(`\n======================================================`);
    console.log(` FileShare.io Local Development Server Running!`);
    console.log(`======================================================`);
    console.log(` Local:            http://localhost:${PORT}`);
    console.log(` On your network:  http://${localIP}:${PORT}`);
    console.log(`\n Note: This project is 100% static & serverless!`);
    console.log(` You can host it directly on GitHub Pages for free.`);
    console.log(`======================================================\n`);
});
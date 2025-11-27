const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

// Dummy telemetry data generator
setInterval(() => {
    const data = {
        timestamp: new Date().toISOString(),
        cpu_usage: Math.random() * 100,
        ram_usage: Math.random() * 100,
        power_usage: Math.random() * 500, // Watts, maybe? 0-500
        temperature: 30 + Math.random() * 50 // Celsius, 30-80
    };

    const message = JSON.stringify(data);

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });

    console.log('Sent data:', data);
}, 5000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

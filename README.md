# Telemetry App - Implementation Notes

This project is a real-time telemetry dashboard I built to learn and demonstrate WebSockets. It uses a Node.js backend to stream dummy data (CPU, RAM, Power, Temp) to a vanilla JS frontend, visualizing it with D3.js.

## 1. My Tech Stack

I chose a simple, robust stack to focus on the core concepts:

*   **Node.js**: For the runtime environment.
*   **Express**: To serve the static frontend files (`index.html`, `style.css`, `app.js`).
*   **`ws`**: A lightweight WebSocket library for Node.js. I preferred this over Socket.io to understand the raw WebSocket protocol better.

## 2. How I Built the Backend

### Server Setup (`server.js`)

I set up the server to handle both HTTP requests (for the site) and WebSocket connections on the same port (3000).

```javascript
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
```

### Communication Flow

**1. The Handshake**
When the frontend connects (`new WebSocket(...)`), it sends an HTTP upgrade request. My server accepts this via the `ws` library, establishing a persistent bi-directional connection.

**2. Streaming Data**
I used a `setInterval` loop to generate random metrics every 5 seconds. I broadcast this data to all connected clients:

```javascript
setInterval(() => {
    const data = { ... }; // Random metrics
    const message = JSON.stringify(data);

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}, 5000);
```

**3. Handling Data on Frontend**
On the client side, I listen for the `message` event, parse the JSON, and update my D3 charts.

## 3. Design Choices & Best Practices

### WebSockets vs. HTTP
I went with WebSockets because I needed **low latency** and **server-push** capabilities. Polling with HTTP would have been inefficient and slower for this kind of real-time data stream.

### JSON for Data
I used JSON for sending data because it's native to JS and easy to debug.

### Connection Safety
I added checks (`client.readyState === WebSocket.OPEN`) to ensure I only send data to active connections, preventing server crashes from disconnected clients.

### Modular Frontend
I refactored the D3 chart logic into a `TelemetryChart` class. This allowed me to easily instantiate three separate charts (Percentage, Power, Temp) without duplicating code, keeping `app.js` clean.

### D3.js Implementation
I used D3.js v7 for the visualizations. Here's how I structured it:

*   **Scales & Axes**: I used `d3.scaleTime` for the x-axis (dynamic timestamp) and `d3.scaleLinear` for the y-axis (fixed domains like 0-100% or 0-500W).
*   **Real-time Updates**: Instead of redrawing the entire chart, I append new data to a buffer (`telemetryData`) and update the line paths efficiently using `d3.line()`.
*   **Interactivity**:
    *   **Zoom/Pan**: Implemented `d3.zoom` on an overlay rectangle to allow x-axis exploration.
    *   **Tooltips**: Used `d3.bisector` to find the nearest data point on mouse hover, displaying a synchronized tooltip and focus dots across all active metrics.
    *   **Drag & Drop**: Added native HTML5 Drag and Drop API support to reorder the chart containers by dragging their control groups.

## 4. Future Experiments

Things I want to try next to deepen my understanding:
1.  **Bi-directional**: Add controls on the frontend to change the server's data generation interval.
2.  **Reconnection**: Implement logic to automatically reconnect if the server goes down.
3.  **Rooms**: Allow filtering streams server-side so I only receive the metrics I'm looking at.

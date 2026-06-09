import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Port to listen on (default to 8080 for Google Cloud Run)
const PORT = process.env.PORT || 8080;
const HOST_PASSCODE = process.env.HOST_PASSCODE || "";

// Serve static assets from 'public' directory
app.use(express.static(join(__dirname, 'public')));

// In-memory room storage
// Room schema:
// {
//   host: WebSocket,
//   participants: Map<id, { ws: WebSocket, color: string, name: string, lastTilt: number }>,
//   labels: { left: string, right: string }
// }
const rooms = new Map();

// Helper to generate a unique random participant ID
function generateParticipantId(room) {
  let id;
  do {
    id = 'P-' + Math.floor(100 + Math.random() * 900);
  } while (room.participants.has(id));
  return id;
}

// Helper to generate a random pastel color
function generatePastelColor() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 85%, 80%)`;
}

// Helper to parse cookie value
function getCookieValue(cookieString, name) {
  if (!cookieString) return null;
  const match = cookieString.match(new RegExp('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

// Upgrade HTTP connection to WebSocket
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const role = url.searchParams.get('role');
  const roomId = (url.searchParams.get('room') || 'default').toUpperCase();
  const cookieHeader = req.headers.cookie || '';
  const passcode = getCookieValue(cookieHeader, 'sway_host_passcode');

  if (!role || (role !== 'host' && role !== 'participant')) {
    ws.close(1008, 'Invalid role');
    return;
  }

  // Set up heartbeat property and error listener
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', (err) => {
    console.error(`WebSocket error for ${role} in room ${roomId}:`, err.message);
  });

  // Get or create room
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      host: null,
      participants: new Map(),
      labels: { left: 'Option A', right: 'Option B', title: 'Sway Question' },
      chosenParticipantId: null
    });
  }
  const room = rooms.get(roomId);

  if (role === 'host') {
    ws.isAuthorized = (!HOST_PASSCODE || passcode === HOST_PASSCODE);

    // Host connection close cleanup
    ws.on('close', () => {
      console.log(`Host disconnected from room: ${roomId}`);
      if (room.host === ws) {
        room.host = null;
      }
      cleanRoomIfEmpty(roomId);
    });

    if (!ws.isAuthorized) {
      try { ws.close(1008, 'Invalid host passcode'); } catch (e) { }
      return;
    }

    registerHost(ws, room, roomId);

    // Handle messages from Host
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);

        // Authorized message routing
        if (data.type === 'labels') {
          room.labels = {
            left: data.left || '',
            right: data.right || '',
            title: data.title || ''
          };
          // Broadcast to all participants in this room
          const broadcastMsg = JSON.stringify({
            type: 'labels_update',
            labels: room.labels
          });
          room.participants.forEach((p) => {
            if (p.ws.readyState === ws.OPEN) {
              p.ws.send(broadcastMsg);
            }
          });
        } else if (data.type === 'choose_participant') {
          const targetId = data.id; // string or null
          const prevChosenId = room.chosenParticipantId;
          room.chosenParticipantId = targetId;

          // Notify the old chosen participant that they are no longer chosen
          if (prevChosenId && prevChosenId !== targetId) {
            const prevP = room.participants.get(prevChosenId);
            if (prevP && prevP.ws.readyState === ws.OPEN) {
              prevP.ws.send(JSON.stringify({
                type: 'chosen',
                state: false
              }));
            }
          }

          // Notify the new chosen participant
          if (targetId) {
            const targetP = room.participants.get(targetId);
            if (targetP && targetP.ws.readyState === ws.OPEN) {
              targetP.ws.send(JSON.stringify({
                type: 'chosen',
                state: true
              }));
            }
          }
        }
      } catch (err) {
        console.error('Error handling host message:', err);
      }
    });

  } else {
    // Participant
    const participantId = generateParticipantId(room);
    const color = generatePastelColor();
    const name = participantId; // For simplicity, name is the ID

    const participantData = {
      ws,
      color,
      name,
      lastTilt: 0 // starting center
    };

    room.participants.set(participantId, participantData);
    console.log(`Participant ${participantId} connected to room: ${roomId}`);

    // Welcome participant with their assigned ID, color, current room labels, and chosen status
    ws.send(JSON.stringify({
      type: 'init_participant',
      id: participantId,
      color,
      labels: room.labels,
      chosen: (room.chosenParticipantId === participantId)
    }));

    // Notify Host of new participant
    if (room.host && room.host.readyState === ws.OPEN) {
      room.host.send(JSON.stringify({
        type: 'join',
        id: participantId,
        color,
        name
      }));
    }

    // Handle tilt events from Participant
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        if (data.type === 'tilt') {
          // Throttle angle range if necessary (expecting number between -90 and 90 or -1 and 1)
          const angle = parseFloat(data.angle) || 0;
          participantData.lastTilt = angle;

          // Forward tilt event to host
          if (room.host && room.host.readyState === ws.OPEN) {
            room.host.send(JSON.stringify({
              type: 'tilt',
              id: participantId,
              angle
            }));
          }
        }
      } catch (err) {
        console.error(`Error handling participant ${participantId} message:`, err);
      }
    });

    ws.on('close', () => {
      console.log(`Participant ${participantId} disconnected from room: ${roomId}`);
      room.participants.delete(participantId);

      // If the chosen participant leaves, clear room state and notify host
      if (room.chosenParticipantId === participantId) {
        room.chosenParticipantId = null;
        if (room.host && room.host.readyState === ws.OPEN) {
          room.host.send(JSON.stringify({
            type: 'choose_participant',
            id: null
          }));
        }
      }

      // Notify Host
      if (room.host && room.host.readyState === ws.OPEN) {
        room.host.send(JSON.stringify({
          type: 'leave',
          id: participantId
        }));
      }

      cleanRoomIfEmpty(roomId);
    });
  }
});

// Helper to register the host and send init data
function registerHost(ws, room, roomId) {
  if (room.host && room.host !== ws) {
    try { room.host.close(1000, 'New host took over'); } catch (e) { }
  }
  room.host = ws;
  console.log(`Host connected to room: ${roomId}`);

  const participantList = [];
  room.participants.forEach((data, id) => {
    participantList.push({
      id,
      color: data.color,
      name: data.name,
      lastTilt: data.lastTilt
    });
  });

  ws.send(JSON.stringify({
    type: 'init_host',
    labels: room.labels,
    participants: participantList,
    chosenParticipantId: room.chosenParticipantId
  }));
}

// Helper to remove rooms from memory if they are unused
function cleanRoomIfEmpty(roomId) {
  const room = rooms.get(roomId);
  if (room && !room.host && room.participants.size === 0) {
    rooms.delete(roomId);
    console.log(`Room ${roomId} cleaned up from memory.`);
  }
}

// 30-second heartbeat check (Ping-Pong) to keep connections active and clean up dead sockets
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('Terminating unresponsive WebSocket connection');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// Start HTTP Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sway server is running on http://0.0.0.0:${PORT}`);
});

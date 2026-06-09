import WebSocket from 'ws';

const CONCURRENT_CLIENTS = 200;
const TEST_ROOM = 'LOADTEST';
const SERVER_URL = process.env.SERVER_URL || 'ws://localhost:8080';
const TEST_DURATION_MS = 15000; // Run for 15 seconds

console.log(`Starting load test against ${SERVER_URL} with ${CONCURRENT_CLIENTS} simulated clients...`);

let connectedCount = 0;
let messageCount = 0;
let errorCount = 0;
const sockets = [];

// Start a local timer to stop the test
const testTimeout = setTimeout(stopTest, TEST_DURATION_MS);

// Launch clients with a small stagger to avoid a single massive connection burst
for (let i = 0; i < CONCURRENT_CLIENTS; i++) {
  setTimeout(() => {
    createClient(i);
  }, i * 15); // Stagger connections by 15ms
}

function createClient(index) {
  const wsUrl = `${SERVER_URL}/ws?role=participant&room=${TEST_ROOM}`;
  const ws = new WebSocket(wsUrl);
  sockets.push(ws);

  let sendInterval = null;
  let participantId = null;

  ws.on('open', () => {
    connectedCount++;
    if (connectedCount % 20 === 0 || connectedCount === CONCURRENT_CLIENTS) {
      console.log(`  [Status] ${connectedCount}/${CONCURRENT_CLIENTS} clients connected...`);
    }

    // Simulate tilt using a sine wave based on time and client index
    let time = 0;
    sendInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        // Generate a smooth oscillating tilt angle between -1.0 and 1.0
        // Stagger phases using the client index
        const angle = Math.sin(time + index * 0.1);
        ws.send(JSON.stringify({
          type: 'tilt',
          angle: Math.round(angle * 100) / 100
        }));
        messageCount++;
        time += 0.05;
      }
    }, 60); // 60ms matches the frontend throttle rate
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'init_participant') {
        participantId = msg.id;
      }
    } catch (e) {}
  });

  ws.on('error', (err) => {
    errorCount++;
  });

  ws.on('close', () => {
    if (sendInterval) {
      clearInterval(sendInterval);
    }
  });
}

function stopTest() {
  console.log('\n--- Load Test Complete ---');
  console.log(`Total attempted clients: ${CONCURRENT_CLIENTS}`);
  console.log(`Successfully connected:  ${connectedCount}`);
  console.log(`Total messages sent:    ${messageCount}`);
  console.log(`Errors encountered:     ${errorCount}`);
  
  console.log('Disconnecting all clients...');
  sockets.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  });

  console.log('Done.');
  process.exit(0);
}

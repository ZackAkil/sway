# Sway

A hyper-minimalist, utilitarian, lite-pastel real-time web application for interactive group tilt voting/swarming.

A host opens the host dashboard on a projector or screen, which displays a central horizontal line and editable text labels on each side. Participants scan a QR code or visit the URL on their mobile phones, where they get assigned a random ID and color. When they tilt their phone left or right, their colored dot slides along the host screen in real-time.

Designed to handle hundreds of concurrent participants smoothly via lightweight WebSocket communication and CSS/Canvas linear interpolation.

---

## Technical Stack
- **Backend**: Node.js + Express (serving static assets) + ws (lightweight, high-performance WebSocket server).
- **Frontend**: Vanilla HTML5, Canvas API, device orientation sensors, and plain CSS.
- **Styling**: Neo-Brutalist minimalist, utilitarian, pastel theme with thick borders and clean monospace readouts.
- **Deployment**: Google Cloud Run (Dockerized, optimized for single-instance WebSockets).

---

## Key Features

### Dynamic Dot Swarming (Host)
Instead of overlapping dots, the host canvas hashes each participant's ID to compute a deterministic vertical offset and unique radius, creating a clean, legible pastel dot swarm.

### Swarm Freeze
The host can toggle a Freeze button in the header. This instantly ignores incoming tilt updates and locks all dots in place with a visible SWARM FREEZE ACTIVE overlay on the host canvas.

### Interactive Dot Selection (You Have Been Chosen)
The host can click/tap any dot on the canvas. The chosen dot scales up with a golden halo while all other dots fade into the background. The chosen participant's phone vibrates and displays a fullscreen "You are Chosen!" overlay card, prompting them to speak.

### Cookie-Based Passcode Security
Protect hosting permissions by setting the `HOST_PASSCODE` environment variable in your local `.env` file or deployment environment.
* If active, the host dashboard prompts for a passcode and validates it on connection.
* Authorized passcodes are cached securely in a cookie (`sway_host_passcode`) for 30 days to bypass repeated prompts.

### Zero-Friction Mobile View
Device orientation tilt tracks automatically without calibration buttons. Smooth exponential moving average (EMA) interpolation ensures dot movements look fluid even on high-latency networks.

---

## Local Setup & Run

1. **Install Dependencies**:
   ```bash
   npm install --registry=https://registry.npmjs.org
   ```

2. **Configure Environment (Optional)**:
   Copy the example environment file to configure your host passcode and deployment settings:
   ```bash
   cp .env.example .env
   ```

3. **Start the Server**:
   ```bash
   npm start
   ```
   The application will be running at http://localhost:8080.

4. **Open the Interfaces**:
   - **Host Screen**: Open http://localhost:8080/host.html in a desktop browser.
   - **Participant Screen**: Open http://localhost:8080 on a mobile device.

---

## Load Testing

To simulate hundreds of concurrent participants tilting their phones simultaneously and verify WebSocket server throughput:

1. Run the local server: npm start
2. Run the load test client script:
   ```bash
   node load_test.js
   ```
   This will simulate 200 concurrent clients connecting and transmitting device orientation updates at 60ms intervals for 15 seconds.

---

## Deployment to Google Cloud Run

We have included a deployment automation script that reads `PROJECT_ID`, `SERVICE_NAME`, `REGION`, and `HOST_PASSCODE` from your local `.env` file:

```bash
bash deploy.sh
```

### Manual Deployment
If you prefer to deploy manually via the gcloud CLI:

1. **Build and Push the Container to Artifact Registry**:
   ```bash
   gcloud builds submit --tag us-central1-docker.pkg.dev/YOUR_PROJECT_ID/sway-repo/sway:latest .
   ```

2. **Deploy with Single-Instance WebSocket Lock**:
   ```bash
   gcloud run deploy sway \
       --image=us-central1-docker.pkg.dev/YOUR_PROJECT_ID/sway-repo/sway:latest \
       --platform=managed \
       --region=us-central1 \
       --allow-unauthenticated \
       --max-instances=1 \
       --cpu=1 \
       --memory=1Gi
   ```

> [!NOTE]
> Setting --max-instances=1 guarantees all mobile participants and the host route to the same container instance, enabling real-time WebSockets without needing external Pub/Sub or Redis infrastructure. A single instance with 1 vCPU and 1Gi RAM can comfortably support over 1,000 active concurrent WebSocket connections.

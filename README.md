# FileShare.io - P2P Local Network File Sharing

A fast, serverless, peer-to-peer file sharing and messaging web application designed to be hosted for free on **GitHub Pages**.

Anyone who opens the link can create a room, and anyone on the same network (or across the web) can join via a **6-digit room code**, **direct invite link**, or by **scanning a QR code** with their phone camera to instantly transfer files directly between devices at local Wi-Fi speeds.

---

## ✨ Features

- **100% Serverless & GitHub Pages Ready**: No backend server to deploy or pay for. Runs entirely in modern browsers using WebRTC.
- **Local Network Speed (P2P)**: Files and messages transfer directly between devices (device-to-device). On the same Wi-Fi / LAN, WebRTC routes data over the local network at maximum router bandwidth.
- **Large File Support (Chunked Transfers)**: Files are streamed in 64 KB chunks with built-in flow control and backpressure, ensuring smooth transfers with zero memory exhaustion.
- **Real-time Transfer Progress**: Shows percentage progress bars for both sending and receiving files.
- **Scan to Join (QR Code)**: Automatically generates a QR code so mobile devices (iOS / Android) can join the room in seconds without typing codes.
- **1-Click Share Link**: Copy a direct invite URL (`https://yourname.github.io/repo/?room=123456`) that auto-fills the room code.
- **Drag & Drop**: Drag and drop files anywhere onto the chat window to share them.
- **End-to-End Encrypted & Private**: Data is transmitted directly between peers using WebRTC's native DTLS/SRTP encryption. No files are stored in the cloud.

---

## 🚀 How to Host on GitHub Pages (Step-by-Step)

You can host this project on GitHub Pages in under 1 minute for free:

### Method 1: GitHub Pages (Default Branch - Recommended)

1. **Push this repository** to your GitHub account:
   ```bash
   git add .
   git commit -m "Configure for GitHub Pages and P2P WebRTC"
   git push origin main
   ```
2. On GitHub, navigate to your repository.
3. Click on **Settings** (tab at the top).
4. On the left sidebar, click **Pages** (under "Code and automation").
5. Under **Build and deployment**:
   - **Source**: Select `Deploy from a branch`.
   - **Branch**: Select `main` (or `master`) and folder `/(root)`.
   - Click **Save**.
6. Wait 30–60 seconds. GitHub will display your live URL:
   ```
   https://<your-username>.github.io/<your-repo-name>/
   ```
7. Open the URL on your computer, phone, or tablet!

---

### Method 2: GitHub Actions (Automated CI/CD)

This repository includes a pre-configured GitHub Actions workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

1. Go to **Settings** > **Pages**.
2. Under **Build and deployment** > **Source**, choose **GitHub Actions**.
3. Every push to `main` will automatically build and deploy your site.

---

## 📱 How to Use

1. **Create a Room**:
   - Open your GitHub Pages link on Device A (e.g., your laptop).
   - Enter your name and click **Create Room**.
   - A unique 6-digit room code, direct invite link, and QR code are displayed.

2. **Join the Room**:
   - On Device B (e.g., your phone on the same Wi-Fi):
     - **Option A (Fastest)**: Scan the QR code shown on Device A's screen using your phone's camera.
     - **Option B**: Open the link and enter the 6-digit room code, then click **Join Room**.

3. **Share Files & Chat**:
   - Click the `+` button or drag & drop files into the window.
   - Watch the transfer progress bar reach 100%.
   - Click the green **Download** button on the receiving device to save the file!

---

## 💻 Local Development (Testing on your Machine)

If you want to run the project locally on your machine before pushing to GitHub Pages:

1. Clone or open the directory:
   ```bash
   cd FileShare.io
   ```
2. Install dependencies (only Express is used as a simple static file server):
   ```bash
   npm install
   ```
3. Start the local server:
   ```bash
   npm start
   ```
4. Open `http://localhost:3000` in your browser.
5. To test between two devices locally, open `http://<your-local-ip>:3000` on your phone (both devices on the same Wi-Fi network).

---

## 🛠️ How It Works Under the Hood

```
[Device A: Host] <==== WebRTC DataChannel (Direct LAN / P2P) ====> [Device B: Peer]
       \                                                                   /
        \--- WebRTC Signaling (PeerJS Cloud: 0.peerjs.com) ---------------/
             (Only used for initial 2-second connection handshake)
```

1. **Signaling**: When you create or join a room, browsers exchange connection details (SDP / ICE candidates) through the public PeerJS cloud signaling service (`0.peerjs.com`).
2. **Local Network Peer Connection**: During WebRTC ICE candidate gathering, devices discover their local IP addresses on your Wi-Fi network (`192.168.x.x`). Once the connection is established, all communication switches to a direct local socket.
3. **Chunked Streaming**: Files are sliced into 64 KB binary chunks using the HTML5 `FileReader` API and transmitted through the WebRTC `RTCDataChannel`. The receiving device reassembles the chunks into a `Blob` and creates a local object URL for instant download.

---

## 📄 License

MIT

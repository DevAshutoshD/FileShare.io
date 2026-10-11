/**
 * FileShare.io - Serverless P2P Local Network & WebRTC File Sharing
 * Designed for 100% static hosting on GitHub Pages
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    const PEER_PREFIX = 'fshare-v3-';
    const CHUNK_SIZE = 64 * 1024; // 64 KB optimal chunk size for WebRTC SCTP DataChannels
    const ICE_SERVERS = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
    ];

    // --- State Variables ---
    let peer = null;
    let myUserName = '';
    let currentRoomCode = '';
    let isHost = false;
    let qrCodeInstance = null;

    // Connected peers: Map<peerId, { name: string, conn: DataConnection, isHost: boolean }>
    const peersMap = new Map();

    // File transfers tracking
    const incomingTransfers = new Map();
    const outgoingTransfers = new Map();

    // --- DOM Elements ---
    const loginView = document.getElementById('loginView');
    const appView = document.getElementById('appView');
    const userNameInput = document.getElementById('userNameInput');
    const roomCodeInput = document.getElementById('roomCodeInput');
    const createRoomBtn = document.getElementById('createRoomBtn');
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    const loginError = document.getElementById('loginError');

    const roomCodeDisplay = document.getElementById('roomCodeDisplay');
    const copyCodeBtn = document.getElementById('copyCodeBtn');
    const copyLinkBtn = document.getElementById('copyLinkBtn');
    const roomQrCodeWrapper = document.getElementById('roomQrCodeWrapper');
    const userList = document.getElementById('userList');
    const userCount = document.getElementById('userCount');
    const leaveRoomBtn = document.getElementById('leaveRoomBtn');

    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    const messagesDiv = document.getElementById('messages');
    const messageInput = document.getElementById('messageInput');
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    const fileInput = document.getElementById('fileInput');
    const addFileBtn = document.getElementById('addFileBtn');
    const dropZoneOverlay = document.getElementById('dropZoneOverlay');
    const toast = document.getElementById('toast');

    // --- Initialize From URL Query Parameters ---
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room') || urlParams.get('joinRoom');
    if (roomFromUrl) {
        roomCodeInput.value = roomFromUrl.trim();
        userNameInput.focus();
    }

    // Default friendly username if stored or blank
    const savedName = localStorage.getItem('fshare_username');
    if (savedName) {
        userNameInput.value = savedName;
    }

    // --- Event Listeners ---
    createRoomBtn.addEventListener('click', () => {
        myUserName = sanitizeName(userNameInput.value.trim());
        if (!myUserName) {
            showError('Please enter your name.');
            return;
        }
        localStorage.setItem('fshare_username', myUserName);

        // Generate 6-digit room code
        currentRoomCode = Math.floor(100000 + Math.random() * 900000).toString();
        initHost(currentRoomCode);
    });

    joinRoomBtn.addEventListener('click', () => {
        myUserName = sanitizeName(userNameInput.value.trim());
        const code = roomCodeInput.value.trim();
        if (!myUserName) {
            showError('Please enter your name.');
            return;
        }
        if (!code) {
            showError('Please enter a room code.');
            return;
        }
        localStorage.setItem('fshare_username', myUserName);
        currentRoomCode = code;
        initGuest(currentRoomCode);
    });

    // Copy Room Code
    copyCodeBtn.addEventListener('click', () => {
        if (!currentRoomCode) return;
        navigator.clipboard.writeText(currentRoomCode).then(() => {
            showToast(`Room code ${currentRoomCode} copied!`);
        }).catch(() => {
            showToast(`Room code: ${currentRoomCode}`);
        });
    });

    // Copy Invite Link
    copyLinkBtn.addEventListener('click', () => {
        const link = getInviteUrl();
        navigator.clipboard.writeText(link).then(() => {
            showToast('Invite link copied to clipboard!');
        }).catch(() => {
            showToast('Copy failed. Share room code instead.');
        });
    });

    leaveRoomBtn.addEventListener('click', leaveRoom);

    // Sidebar Mobile Toggle
    menuToggle.addEventListener('click', toggleSidebar);
    sidebarOverlay.addEventListener('click', toggleSidebar);

    // Messaging
    sendMessageBtn.addEventListener('click', sendTextMessage);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendTextMessage();
        }
    });

    // Auto-expand textarea
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
    });

    // File Input
    addFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleSelectedFiles(Array.from(e.target.files));
            fileInput.value = '';
        }
    });

    // Drag & Drop
    let dragCounter = 0;
    window.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        if (appView.classList.contains('active-view')) {
            dropZoneOverlay.classList.add('active');
        }
    });

    window.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            dropZoneOverlay.classList.remove('active');
        }
    });

    window.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    window.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        dropZoneOverlay.classList.remove('active');
        if (appView.classList.contains('active-view') && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleSelectedFiles(Array.from(e.dataTransfer.files));
        }
    });

    // Clipboard paste file support
    window.addEventListener('paste', (e) => {
        if (!appView.classList.contains('active-view')) return;
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        const files = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') {
                const file = items[i].getAsFile();
                if (file) files.push(file);
            }
        }
        if (files.length > 0) {
            handleSelectedFiles(files);
        }
    });

    // --- PeerJS Host Setup ---
    function initHost(code) {
        showError('Creating room and connecting to network...');
        isHost = true;
        const hostPeerId = `${PEER_PREFIX}${code}-host`;

        cleanupPeer();

        peer = new Peer(hostPeerId, {
            debug: 1,
            config: { iceServers: ICE_SERVERS }
        });

        peer.on('open', (id) => {
            console.log('Host peer registered:', id);
            roomCodeDisplay.textContent = code;
            switchView(true);
            generateQrCode(getInviteUrl());
            updateUsersDisplay();
            addSystemMessage(`Room ${code} created. Share the code or QR code to join!`);
            showToast('Room ready for connections.');
        });

        peer.on('connection', (conn) => {
            setupConnection(conn, false);
        });

        peer.on('error', (err) => {
            console.error('Peer error:', err);
            if (err.type === 'unavailable-id') {
                // Collision, generate another code and retry
                currentRoomCode = Math.floor(100000 + Math.random() * 900000).toString();
                initHost(currentRoomCode);
            } else {
                showError('Network error: ' + (err.message || 'Could not create room'));
                switchView(false);
            }
        });
    }

    // --- PeerJS Guest Setup ---
    function initGuest(code) {
        showError('Joining room...');
        isHost = false;
        const guestPeerId = `${PEER_PREFIX}${code}-p-${Math.random().toString(36).substring(2, 9)}`;

        cleanupPeer();

        peer = new Peer(guestPeerId, {
            debug: 1,
            config: { iceServers: ICE_SERVERS }
        });

        peer.on('open', (id) => {
            console.log('Guest peer registered:', id);
            const hostPeerId = `${PEER_PREFIX}${code}-host`;
            const conn = peer.connect(hostPeerId, { reliable: true });

            conn.on('open', () => {
                console.log('Connected to host!');
                peersMap.set(conn.peer, { name: 'Host', conn, isHost: true });
                roomCodeDisplay.textContent = code;
                switchView(true);
                generateQrCode(getInviteUrl());
                
                // Send join handshake
                conn.send({
                    type: 'join-request',
                    name: myUserName,
                    peerId: peer.id
                });

                setupConnection(conn, true);
                addSystemMessage(`Connected to room ${code}!`);
            });

            conn.on('error', (err) => {
                console.error('Connection error to host:', err);
                showError('Could not reach room host. Check room code.');
                switchView(false);
            });
        });

        peer.on('connection', (conn) => {
            // Incoming connection from another peer in mesh
            setupConnection(conn, false);
        });

        peer.on('error', (err) => {
            console.error('Peer error:', err);
            showError('Network error: ' + (err.message || 'Could not connect'));
            switchView(false);
        });
    }

    // --- Connection Handling (Host & Guest) ---
    function setupConnection(conn, isHostConn) {
        conn.on('data', (data) => {
            handleIncomingData(data, conn);
        });

        conn.on('close', () => {
            const peerData = peersMap.get(conn.peer);
            const name = peerData ? peerData.name : 'A peer';
            peersMap.delete(conn.peer);
            updateUsersDisplay();
            addSystemMessage(`${name} left the room.`);

            if (isHost) {
                // Broadcast updated user list
                broadcastToAll({
                    type: 'user-list-update',
                    users: getConnectedUsersList()
                });
            }
        });

        conn.on('error', (err) => {
            console.warn('Data connection error with peer:', conn.peer, err);
        });
    }

    // --- Message & Data Router ---
    function handleIncomingData(data, conn) {
        if (!data || !data.type) return;

        switch (data.type) {
            case 'join-request': {
                // Host receives join request from guest
                const guestName = sanitizeName(data.name || 'Anonymous');
                peersMap.set(conn.peer, { name: guestName, conn, isHost: false });
                updateUsersDisplay();
                addSystemMessage(`${guestName} joined the room.`);

                // Send welcome packet with current user list and existing peer IDs for mesh connection
                const otherPeers = Array.from(peersMap.keys()).filter(id => id !== conn.peer);
                conn.send({
                    type: 'welcome',
                    roomCode: currentRoomCode,
                    users: getConnectedUsersList(),
                    existingPeers: otherPeers
                });

                // Inform existing peers of new member
                broadcastToAll({
                    type: 'user-list-update',
                    users: getConnectedUsersList()
                }, conn.peer);

                broadcastToAll({
                    type: 'system',
                    content: `${guestName} joined the room.`
                }, conn.peer);
                break;
            }

            case 'welcome': {
                // Guest receives welcome from host
                if (data.users) {
                    renderUsersList(data.users);
                }
                // Connect to existing peers in mesh network
                if (data.existingPeers && Array.isArray(data.existingPeers)) {
                    data.existingPeers.forEach(otherPeerId => {
                        if (!peersMap.has(otherPeerId)) {
                            const meshConn = peer.connect(otherPeerId, { reliable: true });
                            meshConn.on('open', () => {
                                peersMap.set(otherPeerId, { name: 'Peer', conn: meshConn, isHost: false });
                                setupConnection(meshConn, false);
                                meshConn.send({
                                    type: 'mesh-handshake',
                                    name: myUserName
                                });
                            });
                        }
                    });
                }
                break;
            }

            case 'mesh-handshake': {
                const peerName = sanitizeName(data.name || 'Anonymous');
                peersMap.set(conn.peer, { name: peerName, conn, isHost: false });
                updateUsersDisplay();
                break;
            }

            case 'user-list-update': {
                if (data.users) {
                    renderUsersList(data.users);
                }
                break;
            }

            case 'system': {
                addSystemMessage(data.content);
                break;
            }

            case 'text-message': {
                addMessage(data.sender, data.content, 'user-message', false, data.time);
                break;
            }

            case 'file-meta': {
                handleIncomingFileMeta(data);
                break;
            }

            case 'file-chunk': {
                handleIncomingFileChunk(data);
                break;
            }
        }
    }

    // --- Text Messaging ---
    function sendTextMessage() {
        const text = messageInput.value.trim();
        if (!text) return;

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const packet = {
            type: 'text-message',
            sender: myUserName,
            content: text,
            time: time
        };

        broadcastToAll(packet);
        addMessage('You', text, 'my-message', false, time);

        messageInput.value = '';
        messageInput.style.height = '42px';
    }

    // --- File Transfer (Chunked WebRTC) ---
    function handleSelectedFiles(files) {
        if (!files.length) return;
        if (peersMap.size === 0) {
            showToast('No peers connected to send files to.');
            return;
        }

        files.forEach(file => {
            sendFile(file);
        });
    }

    function sendFile(file) {
        const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Create outgoing file card in chat
        const cardObj = createFileCard({
            fileId: fileId,
            name: file.name,
            size: file.size,
            sender: 'You',
            isMine: true,
            time: time
        });

        outgoingTransfers.set(fileId, {
            file: file,
            cardObj: cardObj,
            offset: 0,
            chunkIndex: 0,
            totalChunks: totalChunks
        });

        // 1. Send file metadata to peers
        broadcastToAll({
            type: 'file-meta',
            fileId: fileId,
            name: file.name,
            size: file.size,
            mimeType: file.type || 'application/octet-stream',
            totalChunks: totalChunks,
            sender: myUserName,
            time: time
        });

        // 2. Stream file chunks sequentially with backpressure flow control
        streamFileChunks(fileId);
    }

    function streamFileChunks(fileId) {
        const transfer = outgoingTransfers.get(fileId);
        if (!transfer) return;

        const { file, totalChunks, cardObj } = transfer;

        function sendNextChunk() {
            if (transfer.offset >= file.size) {
                // Done sending!
                updateFileCardProgress(cardObj, 100);
                setTimeout(() => {
                    const blob = file;
                    const url = URL.createObjectURL(blob);
                    markFileCardComplete(cardObj, url, file.name, true);
                    outgoingTransfers.delete(fileId);
                }, 300);
                return;
            }

            // Flow control: Check WebRTC bufferedAmount to avoid congesting the DataChannel
            let isCongested = false;
            peersMap.forEach(peerData => {
                const dc = peerData.conn && peerData.conn.dataChannel;
                if (dc && dc.bufferedAmount > 2 * 1024 * 1024) { // 2MB buffer threshold
                    isCongested = true;
                }
            });

            if (isCongested) {
                setTimeout(sendNextChunk, 40);
                return;
            }

            const slice = file.slice(transfer.offset, transfer.offset + CHUNK_SIZE);
            const reader = new FileReader();

            reader.onload = (e) => {
                const buffer = e.target.result;
                broadcastToAll({
                    type: 'file-chunk',
                    fileId: fileId,
                    chunkIndex: transfer.chunkIndex,
                    data: buffer
                });

                transfer.offset += CHUNK_SIZE;
                transfer.chunkIndex++;

                const progress = Math.min(99, Math.round((transfer.offset / file.size) * 100));
                updateFileCardProgress(cardObj, progress);

                // Send next chunk immediately or schedule
                if (window.requestIdleCallback) {
                    window.requestIdleCallback(sendNextChunk);
                } else {
                    setTimeout(sendNextChunk, 0);
                }
            };

            reader.onerror = (err) => {
                console.error('File read error:', err);
                showToast(`Failed reading ${file.name}`);
            };

            reader.readAsArrayBuffer(slice);
        }

        sendNextChunk();
    }

    function handleIncomingFileMeta(meta) {
        const cardObj = createFileCard({
            fileId: meta.fileId,
            name: meta.name,
            size: meta.size,
            sender: meta.sender,
            isMine: false,
            time: meta.time
        });

        incomingTransfers.set(meta.fileId, {
            meta: meta,
            cardObj: cardObj,
            chunks: new Array(meta.totalChunks),
            receivedCount: 0
        });
    }

    function handleIncomingFileChunk(chunkData) {
        const transfer = incomingTransfers.get(chunkData.fileId);
        if (!transfer) return;

        transfer.chunks[chunkData.chunkIndex] = chunkData.data;
        transfer.receivedCount++;

        const percent = Math.min(99, Math.round((transfer.receivedCount / transfer.meta.totalChunks) * 100));
        updateFileCardProgress(transfer.cardObj, percent);

        if (transfer.receivedCount >= transfer.meta.totalChunks) {
            // All chunks received! Assemble Blob
            const blob = new Blob(transfer.chunks, { type: transfer.meta.mimeType });
            const url = URL.createObjectURL(blob);

            updateFileCardProgress(transfer.cardObj, 100);
            markFileCardComplete(transfer.cardObj, url, transfer.meta.name, false);
            incomingTransfers.delete(chunkData.fileId);
            showToast(`Received ${transfer.meta.name}!`);
        }
    }

    // --- UI Card Helpers ---
    function createFileCard({ fileId, name, size, sender, isMine, time }) {
        const msgWrapper = document.createElement('div');
        msgWrapper.className = `message-wrapper ${isMine ? 'my-message' : 'user-message'}`;

        if (!isMine) {
            const senderDiv = document.createElement('div');
            senderDiv.className = 'sender-name';
            senderDiv.textContent = sender;
            msgWrapper.appendChild(senderDiv);
        }

        const msgContent = document.createElement('div');
        msgContent.className = 'message-content';

        const card = document.createElement('div');
        card.className = 'file-card';
        card.id = `card_${fileId}`;

        const headerRow = document.createElement('div');
        headerRow.className = 'file-header-row';

        const fileIcon = document.createElement('div');
        fileIcon.className = 'file-icon';
        fileIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;

        const fileDetails = document.createElement('div');
        fileDetails.className = 'file-details';

        const fileNameEl = document.createElement('div');
        fileNameEl.className = 'file-name';
        fileNameEl.textContent = name;
        fileNameEl.title = name;

        const fileSizeEl = document.createElement('div');
        fileSizeEl.className = 'file-size';
        fileSizeEl.textContent = formatBytes(size);

        fileDetails.appendChild(fileNameEl);
        fileDetails.appendChild(fileSizeEl);

        headerRow.appendChild(fileIcon);
        headerRow.appendChild(fileDetails);

        // Progress container
        const progressBox = document.createElement('div');
        progressBox.className = 'transfer-progress-box';

        const progressBarBg = document.createElement('div');
        progressBarBg.className = 'progress-bar-bg';

        const progressBarFill = document.createElement('div');
        progressBarFill.className = 'progress-bar-fill';
        progressBarBg.appendChild(progressBarFill);

        const progressLabel = document.createElement('div');
        progressLabel.className = 'progress-label';
        progressLabel.innerHTML = `<span>${isMine ? 'Sending...' : 'Receiving...'}</span><span class="pct">0%</span>`;

        progressBox.appendChild(progressBarBg);
        progressBox.appendChild(progressLabel);

        // Action area (download button will be placed here)
        const actionArea = document.createElement('div');
        actionArea.className = 'file-action-area';

        card.appendChild(headerRow);
        card.appendChild(progressBox);
        card.appendChild(actionArea);

        msgContent.appendChild(card);
        msgWrapper.appendChild(msgContent);

        messagesDiv.appendChild(msgWrapper);
        scrollMessagesToBottom();

        return {
            wrapper: msgWrapper,
            card: card,
            progressBox: progressBox,
            fill: progressBarFill,
            pctText: progressLabel.querySelector('.pct'),
            actionArea: actionArea,
            isMine: isMine
        };
    }

    function updateFileCardProgress(cardObj, percent) {
        if (!cardObj || !cardObj.fill) return;
        cardObj.fill.style.width = percent + '%';
        cardObj.pctText.textContent = percent + '%';
    }

    function markFileCardComplete(cardObj, blobUrl, fileName, isMine) {
        if (!cardObj) return;

        // Hide progress bar
        if (cardObj.progressBox) {
            cardObj.progressBox.style.display = 'none';
        }

        if (blobUrl) {
            const dlBtn = document.createElement('a');
            dlBtn.className = 'download-btn';
            dlBtn.href = blobUrl;
            dlBtn.download = fileName;
            dlBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Download (${formatBytes(dlBtn.dataset.size || '') || 'File'})`;
            dlBtn.innerText = `Download (${fileName.length > 15 ? fileName.substring(0, 12) + '...' : fileName})`;
            cardObj.actionArea.innerHTML = '';
            cardObj.actionArea.appendChild(dlBtn);
        } else if (isMine) {
            cardObj.actionArea.innerHTML = `<span style="font-size:0.75rem; opacity:0.85;">Sent successfully ✓</span>`;
        }
        scrollMessagesToBottom();
    }

    // --- General Message Display ---
    function addMessage(sender, content, className, isHTML = false, time = '') {
        const msgWrapper = document.createElement('div');
        msgWrapper.className = `message-wrapper ${className}`;

        if (sender && className === 'user-message') {
            const senderDiv = document.createElement('div');
            senderDiv.className = 'sender-name';
            senderDiv.textContent = sender;
            msgWrapper.appendChild(senderDiv);
        }

        const msgContent = document.createElement('div');
        msgContent.className = 'message-content';

        if (isHTML) {
            msgContent.innerHTML = content;
        } else {
            msgContent.textContent = content;
        }

        msgWrapper.appendChild(msgContent);
        messagesDiv.appendChild(msgWrapper);
        scrollMessagesToBottom();
    }

    function addSystemMessage(text) {
        const msgWrapper = document.createElement('div');
        msgWrapper.className = 'message-wrapper system';

        const msgContent = document.createElement('div');
        msgContent.className = 'message-content';
        msgContent.textContent = text;

        msgWrapper.appendChild(msgContent);
        messagesDiv.appendChild(msgWrapper);
        scrollMessagesToBottom();
    }

    function scrollMessagesToBottom() {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    // --- User List Updates ---
    function updateUsersDisplay() {
        const users = getConnectedUsersList();
        renderUsersList(users);
    }

    function getConnectedUsersList() {
        const list = [{ name: myUserName, isYou: true, isHost: isHost }];
        peersMap.forEach((peerData) => {
            list.push({
                name: peerData.name,
                isYou: false,
                isHost: peerData.isHost
            });
        });
        return list;
    }

    function renderUsersList(users) {
        userList.innerHTML = '';
        userCount.textContent = users.length;

        users.forEach(user => {
            const li = document.createElement('li');

            const avatar = document.createElement('div');
            avatar.className = 'user-avatar';
            avatar.textContent = (user.name || '?')[0].toUpperCase();

            const nameSpan = document.createElement('span');
            let label = user.name;
            if (user.isYou || user.name === myUserName) {
                label += ' (You)';
                li.style.fontWeight = '600';
            }
            if (user.isHost) {
                label += ' ★';
            }
            nameSpan.textContent = label;

            li.appendChild(avatar);
            li.appendChild(nameSpan);
            userList.appendChild(li);
        });
    }

    // --- Broadcast Helper ---
    function broadcastToAll(packet, excludePeerId = null) {
        peersMap.forEach((peerData, peerId) => {
            if (peerId !== excludePeerId && peerData.conn && peerData.conn.open) {
                peerData.conn.send(packet);
            }
        });
    }

    // --- QR Code Generator (Client-side) ---
    function generateQrCode(url) {
        if (!roomQrCodeWrapper) return;
        roomQrCodeWrapper.innerHTML = '';
        try {
            if (typeof QRCode !== 'undefined') {
                qrCodeInstance = new QRCode(roomQrCodeWrapper, {
                    text: url,
                    width: 140,
                    height: 140,
                    colorDark: '#0f172a',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.M
                });
            } else {
                roomQrCodeWrapper.textContent = 'QR Code unavailable';
            }
        } catch (e) {
            console.error('QR code generation failed:', e);
        }
    }

    function getInviteUrl() {
        const origin = window.location.origin;
        const pathname = window.location.pathname;
        return `${origin}${pathname}?room=${currentRoomCode}`;
    }

    // --- View & Navigation Management ---
    function switchView(showApp) {
        if (showApp) {
            loginView.classList.remove('active-view');
            appView.classList.add('active-view');
        } else {
            appView.classList.remove('active-view');
            loginView.classList.add('active-view');
        }
    }

    function toggleSidebar() {
        sidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('active');
    }

    function leaveRoom() {
        if (confirm('Are you sure you want to leave the room?')) {
            cleanupPeer();
            peersMap.clear();
            incomingTransfers.clear();
            outgoingTransfers.clear();
            messagesDiv.innerHTML = '';
            currentRoomCode = '';
            switchView(false);
            if (sidebar.classList.contains('open')) {
                toggleSidebar();
            }
            showToast('You left the room.');
        }
    }

    function cleanupPeer() {
        if (peer) {
            try {
                peer.destroy();
            } catch (e) {
                console.warn('Error destroying peer:', e);
            }
            peer = null;
        }
    }

    // --- Utilities ---
    function showError(msg) {
        loginError.textContent = msg;
        setTimeout(() => {
            if (loginError.textContent === msg) {
                loginError.textContent = '';
            }
        }, 4000);
    }

    function showToast(text) {
        toast.textContent = text;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 2600);
    }

    function sanitizeName(str) {
        return str.replace(/[^\w\s\-\.\u00C0-\u017F]/gi, '').trim().substring(0, 20);
    }

    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
});


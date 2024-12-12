        let ws;
        
        // Connect to WebSocket server
        function connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(`${protocol}//${window.location.host}`);
            
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                
                if (data.type === 'file') {
                    // Create download link for received file
                    const blob = new Blob([base64ToArrayBuffer(data.data)], { type: data.mimeType });
                    const url = URL.createObjectURL(blob);
                    
                    const fileItem = document.createElement('div');
                    fileItem.className = 'file-item';
                    fileItem.innerHTML = `
                        <span>${data.name}</span>
                        <a href="${url}" download="${data.name}">
                            <button>Download</button>
                        </a>
                    `;
                    document.getElementById('fileList').appendChild(fileItem);
                } else if (data.type === 'text') {
                    const messageDiv = document.createElement('div');
                    messageDiv.textContent = data.content;
                    document.getElementById('messages').appendChild(messageDiv);
                }
            };
        }

        // Load QR code on page load
        async function loadQRCode() {
            const response = await fetch('/qr');
            const data = await response.json();
            document.getElementById('qrCode').src = data.qr;
            document.getElementById('serverUrl').textContent = data.url;
        }

        // Upload and share file
        async function uploadFile() {
            const fileInput = document.getElementById('fileInput');
            const file = fileInput.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('file', file);

            try {
                await fetch('/upload', {
                    method: 'POST',
                    body: formData
                });
                fileInput.value = '';
            } catch (error) {
                console.error('Upload failed:', error);
            }
        }

        // Send text message
        function sendMessage() {
            const messageInput = document.getElementById('messageInput');
            const message = messageInput.value.trim();
            if (!message) return;

            ws.send(JSON.stringify({
                type: 'text',
                content: message
            }));
            messageInput.value = '';
        }

        // Utility function to convert base64 to ArrayBuffer
        function base64ToArrayBuffer(base64) {
            const binaryString = window.atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes.buffer;
        }

        // Initialize
        window.onload = () => {
            loadQRCode();
            connectWebSocket();
        };
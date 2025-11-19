// DOM Elements
const myPeerIdEl = document.getElementById('my-peer-id');
const peerIdInput = document.getElementById('peer-id-input');
const connectBtn = document.getElementById('connect-btn');
const chatBox = document.getElementById('chat-box');
const connectionBox = document.getElementById('connection-box');
const messagesEl = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const statusEl = document.getElementById('status');

// PeerJS variables
let peer;
let conn;
let myName = 'Guest'; // Default name
let opponentName = '상대'; // Default opponent name

/**
 * Initializes the PeerJS connection.
 * @param {string} [requestedId] - An optional ID to request from the PeerJS server.
 */
function initializePeer(requestedId) {
    if (peer) {
        peer.destroy();
    }
    
    const options = {
        config: {
            'iceServers': [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        }
    };
    peer = requestedId ? new Peer(requestedId, options) : new Peer(options);

    peer.on('open', (id) => {
        myPeerIdEl.textContent = id;
        statusEl.textContent = '온라인. 연결을 기다리는 중...';
    });

    peer.on('connection', (newConn) => {
        // Receiver sets up the connection here.
        setupConnection(newConn);
        // The opponent's name is received via the initial handshake message.
    });

    peer.on('error', (err) => {
        console.error('PeerJS 오류:', err);
        if (err.type === 'unavailable-id') {
            statusEl.textContent = `'${requestedId}'는 사용할 수 없는 ID입니다. 랜덤 ID로 다시 시도합니다.`;
            initializePeer(); // Retry without a specific ID
        } else if (err.type === 'invalid-id') {
            statusEl.textContent = `'${requestedId}'는 유효하지 않은 ID입니다. ID는 영문, 숫자, 하이픈, 밑줄만 포함해야 합니다.`;
        } else {
            alert('오류가 발생했습니다: ' + err.message);
        }
    });
}

/**
 * Sets up the data connection events.
 * @param {import('peerjs').DataConnection} newConn - The new connection object.
 */
function setupConnection(newConn) {
    conn = newConn;
    connectionBox.style.display = 'none';
    chatBox.style.display = 'block';

    // When the connection is established, the initiator sends a handshake.
    conn.on('open', () => {
        conn.send({ type: 'HANDSHAKE', payload: { name: myName } });
    });

    conn.on('data', (data) => {
        switch (data.type) {
            case 'HANDSHAKE':
                // If this is a handshake, set the opponent's name
                opponentName = data.payload.name || 'Guest';
                statusEl.textContent = `${opponentName}와(과) 연결되었습니다.`;
                // The receiver sends their name back
                if (!conn.sentHandshake) {
                    conn.send({ type: 'HANDSHAKE', payload: { name: myName } });
                    conn.sentHandshake = true; // Mark that we've sent it
                }
                break;
            case 'CHAT':
                // If this is a chat message, display it
                addMessage(opponentName, data.payload.message);
                break;
        }
    });

    conn.on('close', () => {
        statusEl.textContent = '연결이 끊겼습니다.';
        connectionBox.style.display = 'block';
        chatBox.style.display = 'none';
    });
}

/**
 * Adds a message to the chat window.
 * @param {string} sender - The name of the sender.
 * @param {string} text - The message text.
 */
function addMessage(sender, text) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    
    const senderSpan = document.createElement('span');
    senderSpan.classList.add('sender');
    senderSpan.textContent = sender + ': ';

    messageDiv.appendChild(senderSpan);
    messageDiv.append(document.createTextNode(text));
    
    messagesEl.appendChild(messageDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Event Listeners
connectBtn.addEventListener('click', () => {
    const peerId = peerIdInput.value.trim();
    if (!peerId) {
        alert('상대방 ID를 입력해주세요.');
        return;
    }
    
    statusEl.textContent = `${peerId}에 연결 시도 중...`;
    // Initiator sets up the connection here.
    const newConn = peer.connect(peerId);
    setupConnection(newConn);
});

sendBtn.addEventListener('click', () => {
    const message = messageInput.value;
    if (!message || !conn) return;

    // Send data in the new object format
    conn.send({ type: 'CHAT', payload: { message: message } });
    addMessage(myName, message);
    messageInput.value = '';
});

messageInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
        sendBtn.click();
    }
});

// --- Communication with parent window ---

window.addEventListener('load', () => {
    parent.postMessage({ type: 'REQUEST_USER_INFO' }, '*');
});

window.addEventListener('message', (event) => {
    if (event.data.type === 'USER_INFO') {
        const user = event.data.user;
        if (user && user.uid && user.displayName) {
            // Logged in: Use UID for PeerJS ID, but display name for chat
            myName = user.displayName;
            initializePeer(user.uid);
        } else {
            // Not logged in: Generate a random 6-digit ID
            const randomId = Math.floor(100000 + Math.random() * 900000).toString();
            initializePeer(randomId);
        }
    }
});

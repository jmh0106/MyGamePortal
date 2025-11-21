// network.js

import { showModal, hideJoinModal } from './ui.js';

const MAX_PLAYERS = 4;

const ICE_SERVERS = {
    iceServers: [
        { urls: "stun:stun.relay.metered.ca:80" },
        { urls: "turn:global.relay.metered.ca:80", username: "d2b8da2ad5c3fe794e1b93d6", credential: "MblaMu8koKGXRww3" },
        { urls: "turn:global.relay.metered.ca:80?transport=tcp", username: "d2b8da2ad5c3fe794e1b93d6", credential: "MblaMu8koKGXRww3" },
        { urls: "turn:global.relay.metered.ca:443", username: "d2b8da2ad5c3fe794e1b93d6", credential: "MblaMu8koKGXRww3" },
        { urls: "turns:global.relay.metered.ca:443?transport=tcp", username: "d2b8da2ad5c3fe794e1b93d6", credential: "MblaMu8koKGXRww3" },
        { urls: "stun:stun.l.google.com:19302" },
    ],
};

export function setupHost(nickname, players, connections, updatePlayerList, onData, onClose, leaveRoom, onLobbyChange) {
    const shortId = Math.floor(100000 + Math.random() * 900000).toString();
    const peer = new Peer(shortId, { config: ICE_SERVERS });

    peer.on('open', (id) => {
        document.getElementById('room-id').textContent = id;
        document.getElementById('room-id-container').classList.remove('hidden');
        
        players.length = 0;
        const myPlayer = { id: id, name: nickname || `Player 1` };
        players.push(myPlayer);
        updatePlayerList(players, 'lobby-player-list');
        onLobbyChange();
        showModal(`방이 생성되었습니다. 다른 플레이어에게 ID [${id}]를 알려주세요.`);
    });

    peer.on('connection', (conn) => {
        if (players.length >= MAX_PLAYERS) {
            conn.send({ type: 'error', message: '방이 꽉 찼습니다.' });
            setTimeout(() => conn.close(), 500);
            return;
        }
        
        conn.on('open', () => {
            const guestNickname = conn.metadata.nickname;
            const newPlayer = { id: conn.peer, name: guestNickname || `Player ${players.length + 1}` };
            connections.push(conn);
            players.push(newPlayer);
            
            conn.send({ type: 'welcome', data: { players, hostId: peer.id } });
            broadcast(connections, { type: 'player_joined', data: { player: newPlayer } }, conn.peer);
            
            updatePlayerList(players, 'lobby-player-list');
            onLobbyChange();
        });

        conn.on('data', (message) => onData(conn.peer, message));
        conn.on('close', () => {
            onClose(conn.peer);
            onLobbyChange();
        });
    });

    peer.on('error', (err) => {
        console.error("PeerJS Error:", err);
        if (err.type === 'unavailable-id') {
            showModal(`ID [${shortId}]를 사용할 수 없습니다. 새 ID로 다시 시도합니다...`);
            peer.destroy();
            setTimeout(() => setupHost(nickname, players, connections, updatePlayerList, onData, onClose, leaveRoom, onLobbyChange), 100);
        } else {
            showModal(`오류가 발생했습니다: ${err.message}`);
            leaveRoom();
        }
    });

    return peer;
}

export function joinRoom(hostId, nickname, connections, onData, onClose, leaveRoom, onPeerOpen) {
    showModal('연결 중...', false);
    const peer = new Peer({ config: ICE_SERVERS });

    peer.on('open', (id) => {
        onPeerOpen(id);
        const conn = peer.connect(hostId, { metadata: { nickname: nickname } });
        
        conn.on('open', () => {
            connections.push(conn);
            showModal('연결되었습니다! 게임이 시작되기를 기다려주세요.');
        });

        conn.on('data', (message) => onData(id, message));
        conn.on('close', () => {
            showModal('호스트와의 연결이 끊어졌습니다.');
            leaveRoom();
        });
    });

    peer.on('error', (err) => {
        console.error("PeerJS Error:", err);
        showModal(`연결 오류: ${err.message}`);
        hideJoinModal();
    });

    return peer;
}

export function broadcast(connections, message, excludePeerId = null) {
    connections.forEach(conn => {
        if (conn.open && conn.peer !== excludePeerId) {
            conn.send(message);
        }
    });
}

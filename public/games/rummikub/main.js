import { showModal, hideModal, showJoinModal, hideJoinModal, displayBoard, displayHand, updateTurnUI, updatePlayerList } from './ui.js';
import { createTiles, shuffle, isBoardValid } from './game.js';
import { setupHost, joinRoom, broadcast } from './network.js';

// --- DOM Elements ---
const lobby = document.getElementById('lobby');
const gameRoom = document.getElementById('game-room');
const gameView = document.getElementById('game-view');
const roomIdContainer = document.getElementById('room-id-container');
const roomIdInput = document.getElementById('room-id-input');
const playerHandDiv = document.getElementById('player-hand');
const gameBoard = document.getElementById('game-board');
const timerDiv = document.getElementById('timer');

// --- Game State ---
const MAX_PLAYERS = 4;
const TILES_PER_PLAYER = 14;
let players = [];
let peer;
let connections = [];
let isHost = false;
let myPeerId = null;
let tileDeck = [];
let myHand = [];
let boardGrid = new Map();
let draggedTileInfo = {};
let currentTurnIndex = 0;
let turnOrder = [];
let movesMadeThisTurn = false;
let handBeforeTurn = [];
let boardBeforeTurn = new Map();
let playerStates = {};
let timerIntervalId = null;
let turnTimerValue = 60;
let sortMode = 'color';
let isGameOver = false;
let playAgainVotes = new Set();
let totalPlayersAtGameOver = 0;

// --- Initialization ---
function startMyTurn() {
    movesMadeThisTurn = false;
    handBeforeTurn = JSON.parse(JSON.stringify(myHand));
    boardBeforeTurn = new Map(boardGrid);
    startTurnTimer();
    // Refresh hand and board to ensure draggable state is correct
    displayHand(myHand, sortMode, isMyTurn(), draggedTileInfo);
    displayBoard(boardGrid, isMyTurn(), draggedTileInfo);
}

function initializeGame() {
    isGameOver = false;
    playAgainVotes.clear();
    totalPlayersAtGameOver = 0;
    document.getElementById('game-over-modal').classList.add('hidden');

    // Hide lobby, show game
    gameRoom.classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');

    if (isHost) {
        tileDeck = createTiles();
        shuffle(tileDeck);
        turnOrder = players.map(p => p.id);
        shuffle(turnOrder);
        currentTurnIndex = 0;

        const initialHands = {};
        players.forEach(p => {
            initialHands[p.id] = tileDeck.splice(0, TILES_PER_PLAYER);
            playerStates[p.id] = { hasMadeInitialMeld: false, handSize: TILES_PER_PLAYER };
        });

        myHand = initialHands[myPeerId];

        broadcast(connections, { 
            type: 'game_start', 
            data: { 
                turnOrder, 
                initialHands,
                playerStates,
                tileDeckCount: tileDeck.length 
            } 
        });
        
        updateTurnUI(turnOrder, currentTurnIndex, myPeerId, players, stopTurnTimer, isMyTurn());
        if (isMyTurn()) {
            startMyTurn();
        }
    }
    
    displayHand(myHand, sortMode, isMyTurn(), draggedTileInfo);
    displayBoard(boardGrid, isMyTurn(), draggedTileInfo);
    updatePlayerList(players, 'game-player-list');
}

function isMyTurn() {
    return turnOrder.length > 0 && turnOrder[currentTurnIndex] === myPeerId;
}

// --- Game Flow ---
function leaveRoom() {
    if (peer) {
        peer.destroy();
    }
    // Reset all state
    players = [];
    connections = [];
    isHost = false;
    myPeerId = null;
    tileDeck = [];
    myHand = [];
    boardGrid = new Map();
    turnOrder = [];
    playerStates = {};
    isGameOver = false;
    playAgainVotes.clear();
    totalPlayersAtGameOver = 0;

    // Reset UI
    gameRoom.classList.add('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    lobby.classList.remove('hidden');
    roomIdContainer.classList.add('hidden');
    document.getElementById('game-over-modal').classList.add('hidden');
    updatePlayerList([], 'lobby-player-list');
}

function updateLobbyState() {
    if (isHost) {
        const startGameBtn = document.getElementById('start-game');
        if (players.length >= 2) {
            startGameBtn.disabled = false;
        } else {
            startGameBtn.disabled = true;
        }
    }
}

export function handlePeerMessage(senderId, message) {
    switch (message.type) {
        case 'welcome':
            ({ players } = message.data); // Do not overwrite myPeerId
            lobby.classList.add('hidden');
            gameRoom.classList.remove('hidden');
            updatePlayerList(players, 'lobby-player-list');
            break;
        case 'player_joined':
            players.push(message.data.player);
            updatePlayerList(players, 'lobby-player-list');
            updateLobbyState();
            break;
        case 'player_left':
            players = players.filter(p => p.id !== message.data.playerId);
            if (isHost) {
                connections = connections.filter(c => c.peer !== message.data.playerId);
            }
            updatePlayerList(players, 'lobby-player-list');
            updateLobbyState();
            showModal(`${message.data.playerName}님이 나갔습니다.`);
            break;
        case 'game_start':
            // Correctly handle the incoming data
            turnOrder = message.data.turnOrder;
            playerStates = message.data.playerStates;
            tileDeck.length = message.data.tileDeckCount;
            myHand = message.data.initialHands[myPeerId];
            initializeGame();
            break;
        case 'board_update':
            boardGrid = new Map(message.data);
            displayBoard(boardGrid, isMyTurn(), draggedTileInfo);
            break;
        case 'turn_change':
            currentTurnIndex = message.data.nextTurnIndex;
            boardGrid = new Map(message.data.board);
            playerStates = message.data.playerStates;
            tileDeck.length = message.data.tileDeckCount;
            updateTurnUI(turnOrder, currentTurnIndex, myPeerId, players, stopTurnTimer, isMyTurn());
            updatePlayerList(players, 'game-player-list');
            if (isMyTurn()) {
                startMyTurn();
            }
            break;
        case 'draw_tile_response':
            myHand.push(message.data.tile);
            displayHand(myHand, sortMode, isMyTurn(), draggedTileInfo);
            break;
        case 'game_over':
            isGameOver = true;
            totalPlayersAtGameOver = players.length;
            document.getElementById('winner-message').textContent = message.data.winnerName + '님이 승리했습니다!';
            document.getElementById('game-over-modal').classList.remove('hidden');
            break;
        case 'play_again_vote':
            playAgainVotes.add(message.data.playerId);
            document.getElementById('play-again-status').textContent = `${playAgainVotes.size} / ${totalPlayersAtGameOver} 명이 다시하기에 투표했습니다.`;
            if (isHost && playAgainVotes.size === totalPlayersAtGameOver) {
                initializeGame();
            }
            break;
        case 'error':
            showModal(message.message);
            break;
    }
}

export function handlePlayerLeave(peerId) {
    const player = players.find(p => p.id === peerId);
    if (!player) return;

    players = players.filter(p => p.id !== peerId);
    connections = connections.filter(c => c.peer !== peerId);
    
    if (isHost) {
        broadcast(connections, { type: 'player_left', data: { playerId: peerId, playerName: player.name } });
    }
    
    updatePlayerList(players, 'lobby-player-list');
    updateLobbyState();
    showModal(`${player.name}님이 연결을 종료했습니다.`);
}


function updateAndBroadcast() {
    displayHand(myHand, sortMode, isMyTurn(), draggedTileInfo);
    displayBoard(boardGrid, isMyTurn(), draggedTileInfo);
    
    const updateMsg = { type: 'board_update', data: Array.from(boardGrid.entries()) };
    if (isHost) {
        broadcast(connections, updateMsg);
    } else {
        const hostConn = connections.find(c => c.metadata.isHost);
        if (hostConn) {
            hostConn.send(updateMsg);
        }
    }
}

// --- Drag and Drop ---
function handleDropOnBoard(e) {
    e.preventDefault();
    if (!draggedTileInfo.from || !isMyTurn()) return;

    const gameView = document.getElementById('game-view');
    const boardRect = gameBoard.getBoundingClientRect();
    const x = e.clientX - boardRect.left + gameView.scrollLeft;
    const y = e.clientY - boardRect.top + gameView.scrollTop;

    const cellWidth = 55 + 4;
    const cellHeight = 75 + 4;

    const gridX = Math.floor(x / cellWidth);
    const gridY = Math.floor(y / cellHeight);
    
    const key = `${gridX},${gridY}`;
    if (boardGrid.has(key)) return;

    if (draggedTileInfo.from === 'hand') {
        myHand.splice(draggedTileInfo.key, 1);
    } else { 
        boardGrid.delete(draggedTileInfo.key);
    }

    movesMadeThisTurn = true;
    boardGrid.set(key, draggedTileInfo.tile);
    draggedTileInfo = {};
    updateAndBroadcast();
}

function handleDropOnHand(e) {
    e.preventDefault();
    if (draggedTileInfo.from !== 'board') return;

    if (boardBeforeTurn.has(draggedTileInfo.key)) {
        showModal('이번 턴에 새로 놓은 타일만 손으로 가져올 수 있습니다.');
        return;
    }

    boardGrid.delete(draggedTileInfo.key);
    myHand.push(draggedTileInfo.tile);
    draggedTileInfo = {};
    updateAndBroadcast();
}

// --- Timer ---
function stopTurnTimer() {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
    timerDiv.textContent = '-';
}

function handleTimeUp() {
    stopTurnTimer();
    showModal('시간 초과! 턴이 자동으로 종료되고 타일을 한 장 받습니다.');
    document.getElementById('undo-btn').click();
    document.getElementById('end-turn-btn').click();
}

function startTurnTimer() {
    stopTurnTimer();
    turnTimerValue = 60;
    timerDiv.textContent = `1:00`;
    timerIntervalId = setInterval(() => {
        turnTimerValue--;
        const seconds = turnTimerValue % 60;
        timerDiv.textContent = `0:${seconds < 10 ? '0' : ''}${seconds}`;
        if (turnTimerValue <= 0) {
            handleTimeUp();
        }
    }, 1000);
}

// --- Event Listeners ---
document.getElementById('create-room').addEventListener('click', () => {
    lobby.classList.add('hidden');
    gameRoom.classList.remove('hidden');
    isHost = true;
    // Pass updateLobbyState as the onLobbyChange callback
    peer = setupHost(players, connections, updatePlayerList, handlePeerMessage, handlePlayerLeave, leaveRoom, updateLobbyState);
    myPeerId = peer.id;
});

document.getElementById('join-room').addEventListener('click', showJoinModal);
document.getElementById('modal-close-btn').addEventListener('click', hideModal);

document.getElementById('join-modal-cancel-btn').addEventListener('click', hideJoinModal);
document.getElementById('join-modal-join-btn').addEventListener('click', () => {
    const hostId = roomIdInput.value;
    if (hostId) {
        hideJoinModal();
        isHost = false;
        peer = joinRoom(hostId.trim(), handlePeerMessage, handlePlayerLeave, leaveRoom, (id) => {
            myPeerId = id; // Set myPeerId only when the peer is open
        });
    }
});

document.getElementById('leave-room').addEventListener('click', leaveRoom);

document.getElementById('start-game').addEventListener('click', () => {
    if (isHost) {
        initializeGame();
    }
});

document.getElementById('sort-hand-btn').addEventListener('click', () => {
    sortMode = sortMode === 'color' ? 'number' : 'color';
    displayHand(myHand, sortMode, isMyTurn(), draggedTileInfo);
});

gameView.addEventListener('dragover', (e) => e.preventDefault());
gameView.addEventListener('drop', handleDropOnBoard);
playerHandDiv.addEventListener('dragover', (e) => e.preventDefault());
playerHandDiv.addEventListener('drop', handleDropOnHand);

document.getElementById('end-turn-btn').addEventListener('click', () => {
    if (!isMyTurn()) return;

    const endTurn = (drewTile = false) => {
        const nextTurnIndex = (currentTurnIndex + 1) % players.length;
        const turnChangeMsg = {
            type: 'turn_change',
            data: {
                nextTurnIndex,
                board: Array.from(boardGrid.entries()),
                playerStates,
                tileDeckCount: tileDeck.length
            }
        };
        if (isHost) {
            broadcast(connections, turnChangeMsg);
            currentTurnIndex = nextTurnIndex;
            updateTurnUI(turnOrder, currentTurnIndex, myPeerId, players, stopTurnTimer, startTurnTimer, () => displayHand(myHand, sortMode, isMyTurn(), draggedTileInfo), () => displayBoard(boardGrid, isMyTurn(), draggedTileInfo), () => updatePlayerList(players));
        } else {
            const hostConn = connections.find(c => c.metadata.isHost);
            if (hostConn) hostConn.send(turnChangeMsg);
        }
    };

    if (!movesMadeThisTurn) {
        if (isHost) {
            const tile = tileDeck.pop();
            if (tile) {
                myHand.push(tile);
                displayHand(myHand, sortMode, isMyTurn(), draggedTileInfo);
                playerStates[myPeerId].handSize++;
            }
            endTurn(true);
        } else {
            const hostConn = connections.find(c => c.metadata.isHost);
            if (hostConn) hostConn.send({ type: 'draw_tile_request' });
            endTurn(true);
        }
        return;
    }

    if (!isBoardValid(boardGrid, playerStates[myPeerId])) {
        showModal('보드가 유효하지 않습니다. 그룹은 3개 이상이어야 하며, 같은 색깔의 숫자 그룹이거나 연속된 숫자의 같은 색깔 그룹이어야 합니다.');
        return;
    }

    if (myHand.length === 0) {
        const winnerName = players.find(p => p.id === myPeerId).name;
        const gameOverMsg = { type: 'game_over', data: { winnerName } };
        if (isHost) {
            broadcast(connections, gameOverMsg);
            handlePeerMessage(null, gameOverMsg);
        } else {
            const hostConn = connections.find(c => c.metadata.isHost);
            if (hostConn) hostConn.send(gameOverMsg);
        }
    } else {
        endTurn();
    }
});

document.getElementById('undo-btn').addEventListener('click', () => {
    if (!isMyTurn()) return;
    myHand = JSON.parse(JSON.stringify(handBeforeTurn));
    boardGrid = new Map(boardBeforeTurn);
    movesMadeThisTurn = false;
    updateAndBroadcast();
});

document.getElementById('play-again-btn').addEventListener('click', () => {
    const voteMsg = { type: 'play_again_vote', data: { playerId: myPeerId } };
    if (isHost) {
        broadcast(connections, voteMsg);
        handlePeerMessage(null, voteMsg);
    } else {
        const hostConn = connections.find(c => c.metadata.isHost);
        if (hostConn) hostConn.send(voteMsg);
    }
    document.getElementById('play-again-btn').disabled = true;
});

document.getElementById('leave-game-btn').addEventListener('click', leaveRoom);
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
let myNickname = null;
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

// --- Nickname Integration ---
window.addEventListener('message', (event) => {
    if (event.data.type === 'USER_INFO' && event.data.user) {
        myNickname = event.data.user.displayName;
        console.log('Nickname received:', myNickname);
    }
});
window.parent.postMessage({ type: 'REQUEST_USER_INFO' }, '*');


// --- Core Game Logic ---

function startMyTurn() {
    console.log('startMyTurn: Initializing my turn.');
    movesMadeThisTurn = false;
    handBeforeTurn = JSON.parse(JSON.stringify(myHand));
    boardBeforeTurn = new Map(boardGrid);
    startTurnTimer();
    displayHand(myHand, sortMode, true, draggedTileInfo);
    displayBoard(boardGrid, true, draggedTileInfo);
}

function updateGameState(state) {
    console.log('updateGameState: Updating local state from host broadcast.', state);
    currentTurnIndex = state.currentTurnIndex;
    boardGrid = new Map(state.boardGrid);
    playerStates = state.playerStates;
    tileDeck.length = state.tileDeckCount;

    if (state.handUpdate && state.handUpdate.playerId === myPeerId) {
        myHand = state.handUpdate.hand;
    }

    stopTurnTimer();
    updateTurnUI(turnOrder, currentTurnIndex, myPeerId, players);
    updatePlayerList(players, 'game-player-list', playerStates);
    
    const amICurrentPlayer = isMyTurn();
    console.log(`updateGameState: It is ${amICurrentPlayer ? 'my' : 'not my'} turn.`);

    if (amICurrentPlayer) {
        startMyTurn();
    } else {
        displayHand(myHand, sortMode, false, draggedTileInfo);
        displayBoard(boardGrid, false, draggedTileInfo);
    }
}


function initializeGame() {
    console.log('initializeGame: Starting game setup.');
    isGameOver = false;
    playAgainVotes.clear();
    totalPlayersAtGameOver = 0;
    boardGrid.clear();
    document.getElementById('game-over-modal').classList.add('hidden');
    gameRoom.classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');

    if (isHost) {
        console.log('initializeGame: Running as Host.');
        tileDeck = createTiles();
        shuffle(tileDeck);
        turnOrder = players.map(p => p.id);
        shuffle(turnOrder);
        currentTurnIndex = 0;
        playerStates = {};

        const initialHands = {};
        players.forEach(p => {
            const hand = tileDeck.splice(0, TILES_PER_PLAYER);
            initialHands[p.id] = hand;
            playerStates[p.id] = { hasMadeInitialMeld: false, handSize: hand.length };
        });

        myHand = initialHands[myPeerId];

        console.log('initializeGame: Broadcasting initial state to all players.');
        players.forEach(p => {
            const conn = connections.find(c => c.peer === p.id);
            if (conn) {
                const initialState = {
                    currentTurnIndex,
                    boardGrid: [],
                    playerStates,
                    tileDeckCount: tileDeck.length,
                    handUpdate: { playerId: p.id, hand: initialHands[p.id] },
                    turnOrder: turnOrder,
                };
                conn.send({ type: 'initial_state', data: initialState });
            }
        });
        
        updateGameState({
            currentTurnIndex,
            boardGrid: [],
            playerStates,
            tileDeckCount: tileDeck.length,
            handUpdate: { playerId: myPeerId, hand: myHand },
            turnOrder: turnOrder,
        });
    }
}

function isMyTurn() {
    return turnOrder.length > 0 && turnOrder[currentTurnIndex] === myPeerId;
}

function leaveRoom() {
    if (peer) peer.destroy();
    // Reset all state...
    window.location.reload(); // Simple way to reset everything
}

function updateLobbyState() {
    if (isHost) {
        const startGameBtn = document.getElementById('start-game');
        startGameBtn.disabled = players.length < 2;
    }
}

// --- Network Message Handling ---

export function handlePeerMessage(senderId, message) {
    console.log(`[MESSAGE RECEIVED] Type: ${message.type}, From: ${senderId || 'N/A'}`, message.data);
    switch (message.type) {
        case 'welcome':
            ({ players } = message.data);
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
        case 'initial_state':
            console.log('[CLIENT] Received initial_state. Switching to game screen.');
            gameRoom.classList.add('hidden');
            document.getElementById('game-screen').classList.remove('hidden');
            turnOrder = message.data.turnOrder;
            updateGameState(message.data);
            break;
        case 'state_update':
            console.log('[CLIENT] Received state_update from host.');
            updateGameState(message.data);
            break;
        case 'board_move_request':
            if (isHost) {
                boardGrid = new Map(message.data);
                broadcast(connections, { type: 'board_update', data: message.data });
            }
            break;
        case 'board_update':
            if (!isMyTurn()) {
                boardGrid = new Map(message.data);
                displayBoard(boardGrid, false, draggedTileInfo);
            }
            break;
        case 'end_turn_request':
            if (isHost) {
                console.log('[HOST] Processing end_turn_request from', senderId);
                if (turnOrder[currentTurnIndex] !== senderId) {
                    console.error('[HOST] REJECTED: Not sender\'s turn.');
                    return;
                }

                const newBoard = new Map(message.data.board);
                if (!isBoardValid(newBoard, playerStates[senderId])) {
                    console.error('[HOST] REJECTED: Invalid board state from', senderId);
                    const conn = connections.find(c => c.peer === senderId);
                    if (conn) {
                        console.log('[HOST] Sending error message to', senderId);
                        conn.send({ type: 'error', message: '보드에 올린 타일 조합이 유효하지 않습니다.' });
                    }
                    return;
                }

                console.log('[HOST] Request approved. Updating state and broadcasting.');
                boardGrid = newBoard;
                const nextTurnIndex = (currentTurnIndex + 1) % players.length;

                const stateUpdate = {
                    currentTurnIndex: nextTurnIndex,
                    boardGrid: Array.from(boardGrid.entries()),
                    playerStates: playerStates,
                    tileDeckCount: tileDeck.length,
                };
                broadcast(connections, { type: 'state_update', data: stateUpdate });
                updateGameState(stateUpdate);
            }
            break;
        case 'draw_tile_request':
            if (isHost) {
                console.log('[HOST] Processing draw_tile_request from', senderId);
                if (turnOrder[currentTurnIndex] !== senderId) return;

                const tile = tileDeck.pop();
                if (tile) {
                    const conn = connections.find(c => c.peer === senderId);
                    if (conn) {
                        console.log('[HOST] Sending drawn tile to', senderId);
                        conn.send({ type: 'tile_drawn', data: { tile } });
                    }
                    playerStates[senderId].handSize++;
                }

                const nextTurnIndex = (currentTurnIndex + 1) % players.length;
                const stateUpdate = {
                    currentTurnIndex: nextTurnIndex,
                    boardGrid: Array.from(boardGrid.entries()),
                    playerStates: playerStates,
                    tileDeckCount: tileDeck.length,
                };
                console.log('[HOST] Broadcasting state_update after tile draw.');
                broadcast(connections, { type: 'state_update', data: stateUpdate });
                updateGameState(stateUpdate);
            }
            break;
        case 'tile_drawn':
            console.log('[CLIENT] Received my drawn tile.');
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
            console.error('[CLIENT] Received error message:', message.message);
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

// --- UI Interaction ---

function updateAndBroadcast() {
    // Real-time sync of the board during a turn.
    displayHand(myHand, sortMode, isMyTurn(), draggedTileInfo);
    displayBoard(boardGrid, isMyTurn(), draggedTileInfo);

    const boardData = Array.from(boardGrid.entries());

    if (isHost) {
        // Host is authority, broadcasts the change directly.
        broadcast(connections, { type: 'board_update', data: boardData });
    } else {
        // Guest sends a request to the host to make the change.
        if (connections.length > 0) {
            connections[0].send({ type: 'board_move_request', data: boardData });
        }
    }
}

function handleDropOnBoard(e) {
    e.preventDefault();
    if (!isMyTurn()) return;
    const targetKey = getDropGridKey(e);
    if (boardGrid.has(targetKey)) return;
    if (draggedTileInfo.from === 'hand') {
        myHand.splice(draggedTileInfo.key, 1);
    } else { 
        boardGrid.delete(draggedTileInfo.key);
    }
    movesMadeThisTurn = true;
    boardGrid.set(targetKey, draggedTileInfo.tile);
    draggedTileInfo = {};
    updateAndBroadcast();
}

function handleDropOnHand(e) {
    e.preventDefault();
    if (draggedTileInfo.from !== 'board' || !isMyTurn()) return;
    if (boardBeforeTurn.has(draggedTileInfo.key)) {
        showModal('이번 턴에 새로 놓은 타일만 손으로 가져올 수 있습니다.');
        displayBoard(boardGrid, true, draggedTileInfo);
        return;
    }
    boardGrid.delete(draggedTileInfo.key);
    myHand.push(draggedTileInfo.tile);
    draggedTileInfo = {};
    updateAndBroadcast();
}

function getDropGridKey(e) {
    const boardRect = gameBoard.getBoundingClientRect();
    const x = e.clientX - boardRect.left + gameBoard.scrollLeft;
    const y = e.clientY - boardRect.top + gameBoard.scrollTop;
    const cellWidth = 55 + 4;
    const cellHeight = 75 + 4;
    const gridX = Math.floor(x / cellWidth);
    const gridY = Math.floor(y / cellHeight);
    return `${gridX},${gridY}`;
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
    if(isMyTurn()){
        document.getElementById('undo-btn').click();
        document.getElementById('end-turn-btn').click();
    }
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
    peer = setupHost(myNickname, players, connections, updatePlayerList, handlePeerMessage, handlePlayerLeave, leaveRoom, updateLobbyState);
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
        peer = joinRoom(hostId.trim(), myNickname, connections, handlePeerMessage, handlePlayerLeave, leaveRoom, (id) => { myPeerId = id; });
    }
});

document.getElementById('leave-room').addEventListener('click', leaveRoom);
document.getElementById('start-game').addEventListener('click', () => { if (isHost) initializeGame(); });
document.getElementById('sort-hand-btn').addEventListener('click', () => {
    sortMode = sortMode === 'color' ? 'number' : 'color';
    displayHand(myHand, sortMode, isMyTurn(), draggedTileInfo);
});

gameView.addEventListener('dragover', (e) => e.preventDefault());
gameView.addEventListener('drop', handleDropOnBoard);
playerHandDiv.addEventListener('dragover', (e) => e.preventDefault());
playerHandDiv.addEventListener('drop', handleDropOnHand);

document.getElementById('undo-btn').addEventListener('click', () => {
    if (!isMyTurn()) return;
    console.log('Undo button clicked.');
    myHand = JSON.parse(JSON.stringify(handBeforeTurn));
    boardGrid = new Map(boardBeforeTurn);
    movesMadeThisTurn = false;
    updateAndBroadcast();
});

document.getElementById('end-turn-btn').addEventListener('click', () => {
    console.log('[END TURN CLICKED] My turn:', isMyTurn());
    if (!isMyTurn()) return;

    const hostConn = isHost ? null : connections[0];

    // Case 1: Player made no moves, must draw a tile.
    if (!movesMadeThisTurn) {
        console.log('No moves made, handling tile draw.');
        if (isHost) {
            const tile = tileDeck.pop();
            if (tile) {
                myHand.push(tile);
                playerStates[myPeerId].handSize++;
            }
            const nextTurnIndex = (currentTurnIndex + 1) % players.length;
            const stateUpdate = {
                currentTurnIndex: nextTurnIndex,
                boardGrid: Array.from(boardGrid.entries()),
                playerStates: playerStates,
                tileDeckCount: tileDeck.length,
                handUpdate: { playerId: myPeerId, hand: myHand }
            };
            broadcast(connections, { type: 'state_update', data: stateUpdate });
            updateGameState(stateUpdate);
        } else {
            if (hostConn) {
                console.log('Guest: Sending draw_tile_request.');
                hostConn.send({ type: 'draw_tile_request' });
            } else {
                console.error('Guest: No connection to host found!');
            }
        }
        return;
    }

    // Case 2: Player made moves. Board must be valid.
    console.log('Moves were made. Validating board...');
    if (!isBoardValid(boardGrid, playerStates[myPeerId])) {
        console.log('Board is invalid, showing modal.');
        showModal('보드가 유효하지 않습니다. 그룹은 3개 이상이어야 합니다.');
        return;
    }
    console.log('Board is valid.');

    // Check for win condition
    if (myHand.length === 0) {
        console.log('Player has no tiles left. Ending game.');
        const winnerName = players.find(p => p.id === myPeerId).name;
        const gameOverMsg = { type: 'game_over', data: { winnerName } };
        if (isHost) {
            broadcast(connections, gameOverMsg);
            handlePeerMessage(null, gameOverMsg);
        } else {
            if (hostConn) {
                hostConn.send(gameOverMsg);
            }
        } // The original replace string had an else here, but it was empty. Removed for brevity and consistency with the instruction's intent.
        return;
    }

    // End turn normally after making moves.
    console.log('Ending turn normally.');
    if (isHost) {
        const nextTurnIndex = (currentTurnIndex + 1) % players.length;
        const stateUpdate = {
            currentTurnIndex: nextTurnIndex,
            boardGrid: Array.from(boardGrid.entries()),
            playerStates: playerStates,
            tileDeckCount: tileDeck.length,
        };
        broadcast(connections, { type: 'state_update', data: stateUpdate });
        updateGameState(stateUpdate);
    } else {
        if (hostConn) {
            const requestData = { board: Array.from(boardGrid.entries()) };
            console.log('Guest: Sending end_turn_request.');
            hostConn.send({ type: 'end_turn_request', data: requestData });
        } else {
            console.error('Guest: No connection to host for ending turn!');
        }
    }
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
const lobby = document.getElementById('lobby');
const gameRoom = document.getElementById('game-room');
const roomIdContainer = document.getElementById('room-id-container');
const roomIdSpan = document.getElementById('room-id');
const gameView = document.getElementById('game-view');
const playerHandDiv = document.getElementById('player-hand');
const gameBoard = document.getElementById('game-board');

const playerList = document.getElementById('player-list');
const timerDiv = document.getElementById('timer');
const joinModal = document.getElementById('join-modal');
const roomIdInput = document.getElementById('room-id-input');

const MAX_PLAYERS = 4;
const TILES_PER_PLAYER = 14;
let players = [];
let peer;
let connections = [];
let isHost = false;
let myPeerId = null;
let tileDeck = [];
let myHand = [];
let boardGrid = new Map(); // "x,y" => tile
let draggedTileInfo = null; // { from: 'hand' | 'board', key: string | index, tile: object }
let currentTurnIndex = 0;
let turnOrder = [];
let movesMadeThisTurn = false;
let handBeforeTurn = [];
let boardBeforeTurn = new Map();
let playerStates = {};
let timerIntervalId = null;
let turnTimerValue = 60;

// --- Modal Logic ---
function showModal(message, showCloseButton = true) {
    const modal = document.getElementById('custom-modal');
    const modalMessage = document.getElementById('modal-message');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    modalMessage.textContent = message;
    modalCloseBtn.style.display = showCloseButton ? 'inline-block' : 'none';
    modal.classList.remove('hidden');
}
function hideModal() {
    document.getElementById('custom-modal').classList.add('hidden');
}
document.getElementById('modal-close-btn').addEventListener('click', hideModal);

function showJoinModal() {
    joinModal.classList.remove('hidden');
}
function hideJoinModal() {
    joinModal.classList.add('hidden');
}

document.getElementById('join-modal-cancel-btn').addEventListener('click', hideJoinModal);
document.getElementById('join-modal-join-btn').addEventListener('click', () => {
    const hostId = roomIdInput.value;
    if (hostId) {
        hideJoinModal();
        showModal('연결 중...', false);
        joinRoom(hostId.trim());
    }
});

// --- Timer Logic ---
function stopTurnTimer() {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
    timerDiv.textContent = '-';
}

function handleTimeUp() {
    stopTurnTimer();
    showModal('시간 초과!');
    if (!isBoardValid(boardGrid)) {
        // Invalid board, undo and draw a tile
        document.getElementById('undo-btn').click();
        const endTurnMsg = { type: 'end_turn', data: { movesMade: false, board: Array.from(boardGrid.entries()) } };
        if (isHost) {
            // Process locally
            const drawnTile = tileDeck.splice(0, 1)[0];
            if (drawnTile) {
                myHand.push(drawnTile);
                displayHand();
            }
            currentTurnIndex = (currentTurnIndex + 1) % players.length;
            const turnMsg = { type: 'turn_start', data: { turnOrder, turnIndex: currentTurnIndex, playerStates } };
            connections.forEach(c => c.send(turnMsg));
            updateTurnUI();
        } else {
            // Tell host to process
            const hostConn = connections.find(c => c.metadata.isHost);
            if (hostConn) {
                hostConn.send(endTurnMsg);
            }
        }
    } else {
        // Valid board, just end the turn
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


// --- Rummikub Game Logic ---
const COLORS = ['red', 'blue', 'orange', 'black'];
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const GRID_COLS = 50;
const GRID_ROWS = 20;

function isValidMeld(meld, isInitialMeld = false) {
    if (meld.length < 3) return false;

    const tiles = meld.filter(t => t.color !== 'joker');
    const jokers = meld.length - tiles.length;

    if (tiles.length <= 1) {
        // Not enough info to determine meld type, but can be valid if jokers fill it
        // e.g., [J, 5, J] could be 4,5,6 or a group of 5s. For now, we'll be strict.
        // A more advanced implementation could check surrounding melds.
        // For now, at least 2 non-joker tiles are needed to determine the pattern.
        return jokers > 0 && tiles.length > 0; // Simplistic: allow if at least one tile and one joker
    }
    
    tiles.sort((a, b) => a.number - b.number);

    const isGroup = () => {
        const needed = new Set(COLORS);
        const number = tiles[0].number;
        for (const tile of tiles) {
            if (tile.number !== number) return false;
            if (!needed.has(tile.color)) return false; // Duplicate color
            needed.delete(tile.color);
        }
        return jokers <= needed.size;
    };

    const isRun = () => {
        const color = tiles[0].color;
        let jokersUsed = jokers;
        for (let i = 1; i < tiles.length; i++) {
            if (tiles[i].color !== color) return false;
            const diff = tiles[i].number - tiles[i-1].number;
            if (diff > 0) {
                 jokersUsed -= (diff - 1);
            }
        }
        return jokersUsed >= 0;
    };

    return isGroup() || isRun();
}

function getMeldValue(meld) {
    // This is complex with jokers. A simple sum for now.
    // A proper implementation would determine joker's value from context.
    let sum = 0;
    meld.forEach(tile => {
        if (tile.color === 'joker') {
            // Simplistic joker value - this is the hardest part.
            // For now, let's just add a placeholder value, e.g., the average.
            // This part needs to be smarter.
            sum += 0; // Let's make jokers have 0 value for initial meld for simplicity.
        } else {
            sum += tile.number;
        }
    });
    return sum;
}

function findConnectedComponents(grid) {
    const components = [];
    const visited = new Set();

    for (const key of grid.keys()) {
        if (visited.has(key)) continue;

        const component = [];
        const queue = [key];
        visited.add(key);

        while (queue.length > 0) {
            const currentKey = queue.shift();
            const [x, y] = currentKey.split(',').map(Number);
            component.push(grid.get(currentKey));

            const rightKey = `${x + 1},${y}`;
            if (grid.has(rightKey) && !visited.has(rightKey)) {
                visited.add(rightKey);
                queue.push(rightKey);
            }
             const leftKey = `${x - 1},${y}`;
            if (grid.has(leftKey) && !visited.has(leftKey)) {
                visited.add(leftKey);
                queue.push(leftKey);
            }
        }
        components.push(component);
    }
    return components;
}


function isBoardValid(grid, playerState) {
    if (grid.size === 0) return true;
    const components = findConnectedComponents(grid);
    
    // If it's the initial meld, all components must be valid
    if (!playerState.hasMadeInitialMeld) {
        return components.every(component => isValidMeld(component, true));
    }

    // After initial meld, we need to check if the whole board is valid
    return components.every(component => isValidMeld(component));
}


function createTiles() {
    const deck = [];
    for (let i = 0; i < 2; i++) {
        for (const color of COLORS) {
            for (const number of NUMBERS) {
                deck.push({ color, number });
            }
        }
    }
    deck.push({ color: 'joker', number: 0 });
    deck.push({ color: 'joker', number: 0 });
    return deck;
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function createTileElement(tile, isHandTile = false) {
    const tileEl = document.createElement('div');
    tileEl.className = `tile ${tile.color}`;
    if (isHandTile) {
        tileEl.classList.add('tile-in-hand');
    }
    tileEl.textContent = tile.number === 0 ? 'J' : tile.number;
    return tileEl;
}

function handleDropOnBoard(e) {
    e.preventDefault();
    if (draggedTileInfo === null) return;
    const isMyTurn = turnOrder[currentTurnIndex] === myPeerId;
    if (!isMyTurn) return;

    const boardRect = gameBoard.getBoundingClientRect();
    const x = e.clientX - boardRect.left + gameBoard.scrollLeft;
    const y = e.clientY - boardRect.top + gameBoard.scrollTop;

    const cellWidth = 55 + 4;
    const cellHeight = 75 + 4;

    const gridX = Math.floor(x / cellWidth);
    const gridY = Math.floor(y / cellHeight);
    
    const key = `${gridX},${gridY}`;
    if (boardGrid.has(key)) {
        return; // Cell is occupied
    }

    if (draggedTileInfo.from === 'hand') {
        myHand.splice(draggedTileInfo.key, 1);
    } else { 
        boardGrid.delete(draggedTileInfo.key);
    }

    movesMadeThisTurn = true;
    boardGrid.set(key, draggedTileInfo.tile);

    draggedTileInfo = null;
    updateAndBroadcast();
}

function handleDropOnHand(e) {
    e.preventDefault();
    if (draggedTileInfo === null || draggedTileInfo.from !== 'board') {
        return;
    }

    if (boardBeforeTurn.has(draggedTileInfo.key)) {
        showModal('이번 턴에 새로 놓은 타일만 손으로 가져올 수 있습니다.');
        return;
    }

    boardGrid.delete(draggedTileInfo.key);
    myHand.push(draggedTileInfo.tile);

    draggedTileInfo = null;
    updateAndBroadcast();
}

function updateAndBroadcast() {
    displayHand();
    displayBoard();
    
    const updateMsg = { type: 'board_update', data: Array.from(boardGrid.entries()) };
    if (isHost) {
        connections.forEach(conn => conn.send(updateMsg));
    }
    else {
        const hostConn = connections.find(c => c.metadata.isHost);
        if (hostConn) {
            hostConn.send(updateMsg);
        }
    }
}

function displayBoard() {
    const gameBoard = document.getElementById('game-board');
    gameBoard.innerHTML = '';
    const isMyTurn = turnOrder[currentTurnIndex] === myPeerId;

    for (const [key, tile] of boardGrid.entries()) {
        const [x, y] = key.split(',');
        const tileEl = createTileElement(tile);
        tileEl.style.gridColumnStart = parseInt(x) + 1;
        tileEl.style.gridRowStart = parseInt(y) + 1;

        if (isMyTurn) {
            tileEl.draggable = true;
            tileEl.style.cursor = 'grab';
            tileEl.addEventListener('dragstart', (e) => {
                draggedTileInfo = { from: 'board', key: key, tile: tile };
            });
        }
        gameBoard.appendChild(tileEl);
    }
}

function displayHand() {
    playerHandDiv.innerHTML = '';
    myHand.sort((a, b) => a.color.localeCompare(b.color) || a.number - b.number);

    myHand.forEach((tile, index) => {
        const tileEl = createTileElement(tile, true);
        const isMyTurn = turnOrder[currentTurnIndex] === myPeerId;
        tileEl.draggable = isMyTurn;
        if(isMyTurn) {
            tileEl.addEventListener('dragstart', (e) => {
                draggedTileInfo = { from: 'hand', key: index, tile: tile };
            });
        }
        playerHandDiv.appendChild(tileEl);
    });
}

function updateTurnUI() {
    const currentTurnPlayerId = turnOrder[currentTurnIndex];
    const player = players.find(p => p.id === currentTurnPlayerId);
    const isMyTurn = currentTurnPlayerId === myPeerId;
    
    console.log(`Updating turn UI. Is my turn? ${isMyTurn}. My ID: ${myPeerId}, Current Turn ID: ${currentTurnPlayerId}`);

    document.getElementById('current-turn').textContent = player ? `${player.name}'s Turn` : '...';
    document.getElementById('end-turn-btn').disabled = !isMyTurn;
    document.getElementById('undo-btn').disabled = !isMyTurn;
    
    stopTurnTimer();
    if (isMyTurn) {
        movesMadeThisTurn = false;
        handBeforeTurn = JSON.parse(JSON.stringify(myHand));
        boardBeforeTurn = new Map(boardGrid);
        startTurnTimer();
    }
    
    displayHand();
    displayBoard();
}

function initializeGame() {
    console.log('Initializing game...');
    gameRoom.classList.add('hidden');
    gameView.classList.remove('hidden');

    if (isHost) {
        tileDeck = createTiles();
        shuffle(tileDeck);
        turnOrder = players.map(p => p.id);
        shuffle(turnOrder);
        
        players.forEach(player => {
            playerStates[player.id] = { hasMadeInitialMeld: false };
            const hand = tileDeck.splice(0, TILES_PER_PLAYER);
            if (player.id === myPeerId) {
                myHand = hand;
            } else {
                const conn = connections.find(c => c.peer === player.id);
                if (conn) {
                    conn.send({ type: 'deal_tiles', data: hand });
                }
            }
        });
        
        currentTurnIndex = 0;
        const turnMsg = { type: 'turn_start', data: { turnOrder, turnIndex: currentTurnIndex, playerStates } };
        connections.forEach(c => c.send(turnMsg));
        
        turnOrder = turnMsg.data.turnOrder;
        currentTurnIndex = turnMsg.data.turnIndex;
        playerStates = turnMsg.data.playerStates;
        updateTurnUI();
    }
}


// --- P2P Networking & Event Listeners ---

gameBoard.addEventListener('dragover', (e) => e.preventDefault());
gameBoard.addEventListener('drop', handleDropOnBoard);

playerHandDiv.addEventListener('dragover', (e) => e.preventDefault());
playerHandDiv.addEventListener('drop', handleDropOnHand);


document.getElementById('undo-btn').addEventListener('click', () => {
    myHand = JSON.parse(JSON.stringify(handBeforeTurn));
    boardGrid = new Map(boardBeforeTurn);
    movesMadeThisTurn = false;
    updateAndBroadcast();
});

document.getElementById('end-turn-btn').addEventListener('click', () => {
    const playerState = playerStates[myPeerId];
    if (!isBoardValid(boardGrid, playerState)) {
        showModal('유효하지 않은 조합입니다. 보드를 확인해주세요.');
        return;
    }

    const endTurnMsg = { type: 'end_turn', data: { movesMade: movesMadeThisTurn, board: Array.from(boardGrid.entries()) } };
     if (isHost) {
        // Host validates their own move
        const newBoardGrid = new Map(endTurnMsg.data.board);
        if (!playerState.hasMadeInitialMeld && endTurnMsg.data.movesMade) {
            const newTiles = Array.from(newBoardGrid.keys()).filter(key => !boardBeforeTurn.has(key));
            const newMelds = findConnectedComponents(new Map(newTiles.map(key => [key, newBoardGrid.get(key)])));
            const sum = newMelds.reduce((acc, meld) => acc + getMeldValue(meld), 0);
            if (sum < 30) {
                showModal(`첫 등록은 합이 30 이상이어야 합니다. 현재 합: ${sum}`);
                return;
            }
            playerState.hasMadeInitialMeld = true;
        }

        if (!endTurnMsg.data.movesMade) {
            const drawnTile = tileDeck.splice(0, 1)[0];
            if (drawnTile) {
                myHand.push(drawnTile);
                displayHand();
            }
        }
        currentTurnIndex = (currentTurnIndex + 1) % players.length;
        const turnMsg = { type: 'turn_start', data: { turnOrder, turnIndex: currentTurnIndex, playerStates } };
        connections.forEach(c => c.send(turnMsg));
        updateTurnUI();
    } else {
        const hostConn = connections.find(c => c.metadata.isHost);
        if (hostConn) {
            hostConn.send(endTurnMsg);
        }
    }
});

function updatePlayerList() {
    const playerList = document.getElementById('player-list');
    playerList.innerHTML = '';
    for (let i = 0; i < MAX_PLAYERS; i++) {
        const playerSlot = document.createElement('li');
        playerSlot.className = 'player-slot';
        if (players[i]) {
            let name = players[i].name;
            if(players[i].id === myPeerId) {
                name += ' (You)';
            }
            playerSlot.textContent = name;
        }
        playerList.appendChild(playerSlot);
    }
    const startGameBtn = document.getElementById('start-game');
    if (isHost) {
        startGameBtn.disabled = players.length < 2 || players.length > MAX_PLAYERS;
    }
    else {
        startGameBtn.disabled = true;
        startGameBtn.textContent = '호스트가 게임을 시작합니다';
    }
}

function setupHost() {
    isHost = true;
    peer = new Peer();

    peer.on('open', (id) => {
        myPeerId = id;
        console.log('My peer ID is: ' + id);
        roomIdSpan.textContent = id;
        roomIdContainer.classList.remove('hidden');
        players = [{ id, name: 'Player 1' }];
        updatePlayerList();
    });

    peer.on('connection', (conn) => {
        console.log('Incoming connection from', conn.peer);
        if (players.length >= MAX_PLAYERS) {
            conn.on('open', () => conn.send({ type: 'error', message: 'Room is full' }));
            setTimeout(() => conn.close(), 500);
            return;
        }
        
        conn.metadata = { isHost: false };
        connections.push(conn);
        
        conn.on('open', () => {
            const newPlayer = { id: conn.peer, name: `Player ${players.length + 1}` };
            conn.send({ type: 'player_list', data: [...players, newPlayer] });
            connections.forEach(c => {
                if (c.peer !== conn.peer && c.open) {
                    c.send({ type: 'player_joined', data: newPlayer });
                }
            });
            players.push(newPlayer);
            updatePlayerList();
        });
        
        conn.on('data', (data) => {
            if (data.type === 'board_update') {
                boardGrid = new Map(data.data);
                connections.forEach(c => {
                    if (c.peer !== conn.peer && c.open) {
                        c.send(data);
                    }
                });
                displayBoard();
            }
            else if (data.type === 'end_turn') {
                const newBoardGrid = new Map(data.data.board);
                const playerState = playerStates[conn.peer];

                if (!isBoardValid(newBoardGrid, playerState)) {
                    conn.send({ type: 'invalid_move' });
                    return;
                }
                
                if (!playerState.hasMadeInitialMeld && data.data.movesMade) {
                    const oldPlayerBoard = findConnectedComponents(boardBeforeTurn).flat();
                    const newTiles = Array.from(newBoardGrid.keys()).filter(key => !boardBeforeTurn.has(key));

                    if (newTiles.length > 0) {
                        const newMelds = findConnectedComponents(new Map(newTiles.map(key => [key, newBoardGrid.get(key)])));
                        const sum = newMelds.reduce((acc, meld) => acc + getMeldValue(meld), 0);

                        if (sum < 30) {
                            conn.send({ type: 'invalid_move', message: `첫 등록은 합이 30 이상이어야 합니다. 현재 합: ${sum}` });
                            return;
                        }
                        playerState.hasMadeInitialMeld = true;
                    }
                }

                boardGrid = newBoardGrid;

                if (!data.data.movesMade) {
                    const drawnTile = tileDeck.splice(0, 1)[0];
                    if (drawnTile) {
                        conn.send({ type: 'draw_tile', data: drawnTile });
                    }
                }
                currentTurnIndex = (currentTurnIndex + 1) % players.length;
                const turnMsg = { type: 'turn_start', data: { turnOrder, turnIndex: currentTurnIndex, playerStates } };
                conn.send(turnMsg);
                connections.forEach(c => {
                    if (c.peer !== conn.peer && c.open) {
                        c.send(turnMsg);
                    }
                });
                updateTurnUI();
            }
        });

        conn.on('close', () => {
            console.log('Player disconnected:', conn.peer);
            players = players.filter(p => p.id !== conn.peer);
            connections = connections.filter(c => c.peer !== conn.peer);
            const leftMsg = { type: 'player_left', data: { id: conn.peer } };
            connections.forEach(c => c.send(leftMsg));
            updatePlayerList();
        });
    });

    peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        showModal('P2P 연결에 실패했습니다. 페이지를 새로고침 해주세요.');
    });
}

function joinRoom(hostId) {
    isHost = false;
    peer = new Peer();

    peer.on('open', (id) => {
        myPeerId = id;
        console.log('Connecting to host:', hostId);
        const conn = peer.connect(hostId, { metadata: { isHost: true } });

        conn.on('open', () => {
            hideModal();
            console.log('Connected to host!');
            connections.push(conn);
            lobby.classList.add('hidden');
            gameRoom.classList.remove('hidden');
        });

        conn.on('error', () => {
            showModal('연결에 실패했습니다. 방 ID를 확인해주세요.');
        });

        conn.on('data', (data) => {
            switch(data.type) {
                case 'error':
                    showModal(`서버 연결 실패: ${data.message}`);
                    leaveRoom();
                    break;
                case 'player_list':
                    players = data.data;
                    updatePlayerList();
                    break;
                case 'player_joined':
                    players.push(data.data);
                    updatePlayerList();
                    break;
                case 'player_left':
                    players = players.filter(p => p.id !== data.data.id);
                    updatePlayerList();
                    break;
                case 'game_start':
                    initializeGame();
                    break;
                case 'deal_tiles':
                    myHand = data.data;
                    displayHand();
                    break;
                case 'board_update':
                    boardGrid = new Map(data.data);
                    displayBoard();
                    break;
                case 'turn_start':
                    turnOrder = data.data.turnOrder;
                    currentTurnIndex = data.data.turnIndex;
                    playerStates = data.data.playerStates;
                    updateTurnUI();
                    break;
                case 'draw_tile':
                    myHand.push(data.data);
                    displayHand();
                    break;
                case 'invalid_move':
                    showModal(data.message || '유효하지 않은 조합입니다. 턴이 원상 복구됩니다.');
                    document.getElementById('undo-btn').click();
                    break;
            }
        });
        
        conn.on('close', () => {
            showModal('호스트와의 연결이 끊어졌습니다.');
            leaveRoom();
        });
    });
     peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        showModal('P2P 연결에 실패했습니다. ID를 확인하고 다시 시도해주세요.');
    });
}

function leaveRoom() {
    if (peer) {
        peer.destroy();
    }
    players = [];
    connections = [];
    isHost = false;
    myPeerId = null;
    gameRoom.classList.add('hidden');
    document.getElementById('room-id-container').classList.add('hidden');
    lobby.classList.remove('hidden');
    updatePlayerList();
}

document.getElementById('create-room').addEventListener('click', () => {
    lobby.classList.add('hidden');
    gameRoom.classList.remove('hidden');
    setupHost();
});

document.getElementById('join-room').addEventListener('click', showJoinModal);

document.getElementById('leave-room').addEventListener('click', leaveRoom);

document.getElementById('start-game').addEventListener('click', () => {
    if (isHost) {
        // Notify clients to start first
        connections.forEach(c => c.send({ type: 'game_start' }));
        // Then initialize for the host
        initializeGame();
    }
});
// ui.js

export function showModal(message, showCloseButton = true) {
    const modal = document.getElementById('custom-modal');
    const modalMessage = document.getElementById('modal-message');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    modalMessage.textContent = message;
    modalCloseBtn.style.display = showCloseButton ? 'inline-block' : 'none';
    modal.classList.remove('hidden');
}

export function hideModal() {
    document.getElementById('custom-modal').classList.add('hidden');
}

export function showJoinModal() {
    document.getElementById('join-modal').classList.remove('hidden');
}

export function hideJoinModal() {
    document.getElementById('join-modal').classList.add('hidden');
}

export function createTileElement(tile, isHandTile = false) {
    const tileEl = document.createElement('div');
    tileEl.className = `tile ${tile.color}`;
    if (isHandTile) {
        tileEl.classList.add('tile-in-hand');
    }
    tileEl.textContent = tile.number === 0 ? 'J' : tile.number;
    return tileEl;
}

export function displayBoard(boardGrid, isMyTurn, draggedTileInfo) {
    const gameBoard = document.getElementById('game-board');
    gameBoard.innerHTML = '';

    for (const [key, tile] of boardGrid.entries()) {
        const [x, y] = key.split(',');
        const tileEl = createTileElement(tile);
        tileEl.style.gridColumnStart = parseInt(x) + 1;
        tileEl.style.gridRowStart = parseInt(y) + 1;

        if (isMyTurn) {
            tileEl.draggable = true;
            tileEl.style.cursor = 'grab';
            tileEl.addEventListener('dragstart', (e) => {
                draggedTileInfo.from = 'board';
                draggedTileInfo.key = key;
                draggedTileInfo.tile = tile;
            });
        }
        gameBoard.appendChild(tileEl);
    }
}

export function displayHand(myHand, sortMode, isMyTurn, draggedTileInfo) {
    const playerHandDiv = document.getElementById('player-hand');
    playerHandDiv.innerHTML = '';
    if (sortMode === 'color') {
        myHand.sort((a, b) => a.color.localeCompare(b.color) || a.number - b.number);
    } else { // sort by number
        myHand.sort((a, b) => a.number - b.number || a.color.localeCompare(b.color));
    }

    myHand.forEach((tile, index) => {
        const tileEl = createTileElement(tile, true);
        tileEl.draggable = isMyTurn;
        if(isMyTurn) {
            tileEl.addEventListener('dragstart', (e) => {
                draggedTileInfo.from = 'hand';
                draggedTileInfo.key = index;
                draggedTileInfo.tile = tile;
            });
        }
        playerHandDiv.appendChild(tileEl);
    });
}

export function updateTurnUI(turnOrder, currentTurnIndex, myPeerId, players) {
    if (turnOrder.length === 0) return;
    const currentTurnPlayerId = turnOrder[currentTurnIndex];
    const player = players.find(p => p.id === currentTurnPlayerId);
    const isMyTurn = currentTurnPlayerId === myPeerId;
    
    document.getElementById('current-turn').textContent = player ? `${player.name}'s Turn` : '...';
    document.getElementById('end-turn-btn').disabled = !isMyTurn;
    document.getElementById('undo-btn').disabled = !isMyTurn;
}

export function updatePlayerList(players, listId, playerStates = {}) {
    const playerList = document.getElementById(listId);
    if (!playerList) return;
    playerList.innerHTML = '';
    players.forEach(player => {
        const li = document.createElement('li');
        const handSize = playerStates[player.id]?.handSize;
        let text = player.name;
        if (listId === 'game-player-list' && handSize !== undefined) {
            text += ` (${handSize} tiles)`;
        }
        li.textContent = text;
        li.className = 'player-slot';
        playerList.appendChild(li);
    });
}

// game.js

const COLORS = ['red', 'blue', 'orange', 'black'];
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export function createTiles() {
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

export function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

export function isValidMeld(meld) {
    if (meld.length < 3) return false;

    const tiles = meld.filter(t => t.color !== 'joker');
    const jokers = meld.length - tiles.length;

    if (tiles.length === 0) return true; 
    if (tiles.length === 1) return true; 
    
    tiles.sort((a, b) => a.number - b.number);

    const isGroup = () => {
        const needed = new Set(COLORS);
        const number = tiles[0].number;
        for (const tile of tiles) {
            if (tile.number !== number) return false;
            if (!needed.has(tile.color)) return false;
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

export function getMeldValue(meld) {
    let sum = 0;
    meld.forEach(tile => {
        if (tile.color === 'joker') {
            sum += 0;
        } else {
            sum += tile.number;
        }
    });
    return sum;
}

export function findConnectedComponents(grid) {
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

export function isBoardValid(grid, playerState) {
    if (grid.size === 0) return true;
    const components = findConnectedComponents(grid);
    
    if (!playerState.hasMadeInitialMeld) {
        return components.every(component => isValidMeld(component));
    }

    return components.every(component => isValidMeld(component));
}

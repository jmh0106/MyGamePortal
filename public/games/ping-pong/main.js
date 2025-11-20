const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const myIdSpan = document.getElementById('my-id');
const peerIdInput = document.getElementById('peer-id-input');
const connectBtn = document.getElementById('connect-btn');
const connectionStatus = document.getElementById('connection-status');

let peer;
let conn;
let isHost = false;

function initPeer() {
    peer = new Peer();

    peer.on('open', (id) => {
        myIdSpan.textContent = id;
    });

    peer.on('connection', (newConn) => {
        if (conn && conn.open) {
            newConn.close();
            return;
        }
        conn = newConn;
        connectionStatus.textContent = `Connected to ${conn.peer}`;
        isHost = true;
        setupConnectionEvents();
    });

    peer.on('error', (err) => {
        console.error(err);
        connectionStatus.textContent = 'An error occurred.';
    });
}

function connectToPeer() {
    const peerId = peerIdInput.value.trim();
    if (!peerId) {
        alert('Please enter a peer ID.');
        return;
    }

    if (conn && conn.open) {
        conn.close();
    }

    conn = peer.connect(peerId);
    setupConnectionEvents();
}

function setupConnectionEvents() {
    conn.on('open', () => {
        connectionStatus.textContent = `Connected to ${conn.peer}`;
        if (!isHost) {
            // Guest sends initial position to host
            sendData({ type: 'paddle', y: paddle2.y });
        }
    });

    conn.on('data', (data) => {
        handleData(data);
    });

    conn.on('close', () => {
        connectionStatus.textContent = 'Connection closed.';
        conn = null;
    });
}

connectBtn.addEventListener('click', connectToPeer);

// Game state
const paddleWidth = 10;
const paddleHeight = 100;

const paddle1 = {
    x: 10,
    y: canvas.height / 2 - paddleHeight / 2,
    width: paddleWidth,
    height: paddleHeight,
    dy: 0
};

const paddle2 = {
    x: canvas.width - 10 - paddleWidth,
    y: canvas.height / 2 - paddleHeight / 2,
    width: paddleWidth,
    height: paddleHeight,
    dy: 0
};

const ball = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: 7,
    dx: 5,
    dy: 5
};

function drawPaddle(paddle) {
    ctx.fillStyle = 'black';
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
}

function drawBall() {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'red';
    ctx.fill();
    ctx.closePath();
}

function movePaddle(paddle, up, down) {
    if (up) {
        paddle.y -= 5;
    }
    if (down) {
        paddle.y += 5;
    }

    // Wall collision
    if (paddle.y < 0) {
        paddle.y = 0;
    } else if (paddle.y + paddle.height > canvas.height) {
        paddle.y = canvas.height - paddle.height;
    }
}

function moveBall() {
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Wall collision (top/bottom)
    if (ball.y + ball.radius > canvas.height || ball.y - ball.radius < 0) {
        ball.dy *= -1;
    }

    // Paddle collision
    if (
        ball.x - ball.radius < paddle1.x + paddle1.width &&
        ball.y > paddle1.y &&
        ball.y < paddle1.y + paddle1.height
    ) {
        ball.dx *= -1;
    }

    if (
        ball.x + ball.radius > paddle2.x &&
        ball.y > paddle2.y &&
        ball.y < paddle2.y + paddle2.height
    ) {
        ball.dx *= -1;
    }

    // Wall collision (left/right) - reset ball
    if (ball.x + ball.radius > canvas.width || ball.x - ball.radius < 0) {
        ball.x = canvas.width / 2;
        ball.y = canvas.height / 2;
        ball.dx *= -1;
    }
}

function sendData(data) {
    if (conn && conn.open) {
        conn.send(data);
    }
}

function handleData(data) {
    if (isHost) {
        if (data.type === 'paddle') {
            paddle2.y = data.y;
        }
    } else {
        if (data.type === 'ball') {
            ball.x = data.x;
            ball.y = data.y;
            ball.dx = data.dx;
            ball.dy = data.dy;
        }
        if (data.type === 'paddle') {
            paddle1.y = data.y;
        }
    }
}


let upPressed = false;
let downPressed = false;

document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
        upPressed = true;
    } else if (e.key === 'ArrowDown') {
        downPressed = true;
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp') {
        upPressed = false;
    } else if (e.key === 'ArrowDown') {
        downPressed = false;
    }
});

function update() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawPaddle(paddle1);
    drawPaddle(paddle2);
    drawBall();

    if (isHost) {
        movePaddle(paddle1, upPressed, downPressed);
        moveBall();
        sendData({ type: 'ball', x: ball.x, y: ball.y, dx: ball.dx, dy: ball.dy });
        sendData({ type: 'paddle', y: paddle1.y });
    } else {
        movePaddle(paddle2, upPressed, downPressed);
        sendData({ type: 'paddle', y: paddle2.y });
    }


    requestAnimationFrame(update);
}

initPeer();
update();

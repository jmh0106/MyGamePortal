import * as THREE from 'three';

// --- UI 요소 가져오기 (여기가 수정되었습니다) ---
const startMenu = document.getElementById('start-menu');
const settingsMenu = document.getElementById('settings-menu'); // [추가됨]
const leaderboardMenu = document.getElementById('leaderboard-menu'); // [추가됨: 에러 원인 해결]

const startButton = document.getElementById('start-button');
const settingsButton = document.getElementById('settings-button');
const leaderboardButton = document.getElementById('leaderboard-button');
const backButtons = document.querySelectorAll('.back-button');

const scoreHud = document.getElementById('score-hud');
const finalScoreEl = document.getElementById('final-score');

// --- 게임 변수 ---
let scene, camera, renderer;
let player, gridHelper;
let laneHighlighterV, laneHighlighterH;
let stars;
let obstacles = [];
let explosionParts = [];
let gameRunning = false;
let isExploding = false;
let score = 0;
let gameSpeed = 0;
const MENU_SPEED = 0.1;
const GAME_START_SPEED = 0.5;

// 이동 및 점프
let playerLane = 0; 
let targetPlayerX = 0; 
const LANE_WIDTH = 5; 
const NUM_LANES = 3;

// 점프 물리
let playerVelocityY = 0;      
let isJumping = false;        
const JUMP_FORCE = 0.35;      
const GRAVITY = -0.02;        
const GROUND_Y = 0.5;         

const COLORS = {
    background: 0x000000,
    fog: 0x000000,
    grid: 0xff00ff,       
    gridCenter: 0xff00ff, 
    player: 0x00f3ff,     
    obstacle: 0xff0055,   
};

function initThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.background);
    scene.fog = new THREE.Fog(COLORS.fog, 40, 120); 

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 7, 14); 
    camera.lookAt(0, 0, -10);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.getElementById('game-container').appendChild(renderer.domElement);

    // 조명
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xff00ff, 1);
    dirLight.position.set(-10, 20, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);
    const blueLight = new THREE.PointLight(0x00f3ff, 1, 50);
    blueLight.position.set(5, 5, 5);
    scene.add(blueLight);

    // 플레이어
    player = createSpaceship();
    player.position.set(0, GROUND_Y, 0);
    scene.add(player);

    // 하이라이터
    const vGeo = new THREE.PlaneGeometry(0.15, 300); 
    const hMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    laneHighlighterV = new THREE.Mesh(vGeo, hMat);
    laneHighlighterV.rotation.x = -Math.PI / 2;
    laneHighlighterV.position.y = 0.05;
    scene.add(laneHighlighterV);

    const hGeo = new THREE.PlaneGeometry(100, 0.15); 
    laneHighlighterH = new THREE.Mesh(hGeo, hMat);
    laneHighlighterH.rotation.x = -Math.PI / 2;
    laneHighlighterH.position.y = 0.05;
    laneHighlighterH.position.z = 0; 
    scene.add(laneHighlighterH);

    // 그리드
    gridHelper = new THREE.GridHelper(300, 60, COLORS.gridCenter, COLORS.grid);
    gridHelper.scale.z = 6; 
    gridHelper.position.set(0, 0, 0);
    scene.add(gridHelper);
    
    const groundGeo = new THREE.PlaneGeometry(300, 300);
    const groundMat = new THREE.MeshBasicMaterial({ color: COLORS.background });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    scene.add(ground);

    createStarfield();

    window.addEventListener('resize', onWindowResize);
    animate();
}

function createSpaceship() {
    const group = new THREE.Group();
    const bodyGeo = new THREE.ConeGeometry(0.5, 2, 8);
    bodyGeo.rotateX(Math.PI / 2); 
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3, emissive: 0x111111 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    const wingGeo = new THREE.BoxGeometry(2.5, 0.1, 1);
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.3 });
    const wings = new THREE.Mesh(wingGeo, wingMat);
    wings.position.set(0, 0, 0.5);
    group.add(wings);

    const engineGeo = new THREE.CylinderGeometry(0.2, 0.1, 0.5, 8);
    engineGeo.rotateX(Math.PI / 2);
    const engineMat = new THREE.MeshStandardMaterial({ color: 0x00f3ff, emissive: 0x00f3ff, emissiveIntensity: 2 });
    const engineL = new THREE.Mesh(engineGeo, engineMat); engineL.position.set(-0.8, 0, 1); group.add(engineL);
    const engineR = new THREE.Mesh(engineGeo, engineMat); engineR.position.set(0.8, 0, 1); group.add(engineR);

    group.traverse(child => { if (child.isMesh) child.castShadow = true; });
    return group;
}

function createStarfield() {
    const starGeo = new THREE.BufferGeometry();
    const starCount = 600; 
    const posArray = new Float32Array(starCount * 3);
    for(let i=0; i<starCount * 3; i++) { posArray[i] = (Math.random() - 0.5) * 400; }
    starGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const starMat = new THREE.PointsMaterial({size: 0.3, color: 0xaaaaaa});
    stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- UI 패널 관리 ---
function showPanel(panel) {
    // 모든 패널 숨기기 (변수 존재 여부 확인)
    if (startMenu) startMenu.classList.add('hidden');
    if (settingsMenu) settingsMenu.classList.add('hidden');
    if (leaderboardMenu) leaderboardMenu.classList.add('hidden');
    
    // 선택된 패널 보이기
    if (panel) panel.classList.remove('hidden');
}

// --- 이벤트 리스너 ---
startButton.addEventListener('click', startGame);
settingsButton.addEventListener('click', () => showPanel(settingsMenu));

// [수정] 리더보드 버튼: 데이터 요청
leaderboardButton.addEventListener('click', () => {
    showPanel(leaderboardMenu);
    requestLeaderboardData();
});

backButtons.forEach(btn => btn.addEventListener('click', () => showPanel(startMenu)));


// --- 게임 로직 ---
function startGame() {
    showPanel(null);
    scoreHud.classList.remove('hidden');
    finalScoreEl.classList.add('hidden');
    
    gameRunning = true;
    isExploding = false;
    score = 0;
    gameSpeed = GAME_START_SPEED;

    player.visible = true;
    player.position.set(0, GROUND_Y, 0);
    player.rotation.set(0, 0, 0);
    targetPlayerX = 0;
    playerLane = 0;
    playerVelocityY = 0;
    isJumping = false;
    
    laneHighlighterV.position.x = 0;
    
    explosionParts.forEach(p => scene.remove(p));
    explosionParts = [];
    obstacles.forEach(o => scene.remove(o));
    obstacles = [];
}

const OBSTACLE_INTERVAL = 50;
let frameCount = 0;

function animate() {
    requestAnimationFrame(animate);

    const currentSpeed = gameRunning ? gameSpeed : (isExploding ? 0.05 : MENU_SPEED);

    gridHelper.position.z += currentSpeed;
    if (gridHelper.position.z > 30) gridHelper.position.z = 0; 
    stars.position.z += currentSpeed;
    if (stars.position.z > 100) stars.position.z = -100;

    const ground = scene.children.find(c => c.geometry && c.geometry.type === 'PlaneGeometry');
    if(ground) ground.position.z = gridHelper.position.z;

    if (isExploding) {
        explosionParts.forEach((part, index) => {
            const expansionSpeed = 1.06 + (index * 0.01); 
            part.scale.multiplyScalar(expansionSpeed); 
            if (part.scale.x > 1) part.material.opacity -= 0.02;
            if (part.material.opacity <= 0) part.visible = false; 
        });
    } 
    else if (gameRunning) {
        player.position.x += (targetPlayerX - player.position.x) * 0.15;
        laneHighlighterV.position.x = player.position.x;

        if (isJumping) {
            player.position.y += playerVelocityY; 
            playerVelocityY += GRAVITY; 
            if (player.position.y <= GROUND_Y) {
                player.position.y = GROUND_Y; 
                isJumping = false;
                playerVelocityY = 0;
                player.rotation.x = 0;
            } else { player.rotation.x = 0; }
        } else { player.rotation.x = 0; }

        player.rotation.z = (player.position.x - targetPlayerX) * -0.2;

        frameCount++;
        if (frameCount % OBSTACLE_INTERVAL === 0) generateObstacle();
        moveObstacles();
        checkCollision();

        score += 1;
        const displayScore = Math.floor(score / 10);
        scoreHud.innerText = `SCORE: ${String(displayScore).padStart(5, '0')}`;
        
        if(gameSpeed < 1.5) gameSpeed += 0.0001;
    } else {
        laneHighlighterV.position.x += (0 - laneHighlighterV.position.x) * 0.1;
    }

    renderer.render(scene, camera);
}

function generateObstacle() {
    const geometry = new THREE.ConeGeometry(0.8, 2, 16); 
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x000000, emissive: COLORS.obstacle, emissiveIntensity: 1.5, flatShading: true 
    });
    const obstacle = new THREE.Mesh(geometry, material);
    const lanes = [-LANE_WIDTH, 0, LANE_WIDTH];
    const lane = lanes[Math.floor(Math.random() * NUM_LANES)];
    obstacle.position.set(lane, 1, -100); 
    obstacle.userData = { rotateSpeedY: (Math.random() - 0.5) * 0.2 };
    scene.add(obstacle);
    obstacles.push(obstacle);
}

function moveObstacles() {
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        obs.position.z += gameSpeed; 
        obs.rotation.y += obs.userData.rotateSpeedY;
        obs.rotation.x = -0.2; 
        if (obs.position.z > 20) { scene.remove(obs); obstacles.splice(i, 1); }
    }
}

function checkCollision() {
    const playerBox = new THREE.Box3().setFromObject(player);
    playerBox.expandByScalar(-0.3);
    for (const obs of obstacles) {
        const obsBox = new THREE.Box3().setFromObject(obs);
        obsBox.expandByScalar(-0.2);
        if (playerBox.intersectsBox(obsBox)) { triggerExplosion(); break; }
    }
}

function triggerExplosion() {
    gameRunning = false;
    isExploding = true;
    player.visible = false;

    const displayScore = Math.floor(score / 10);
    // [통신] 게임 오버 메시지 전송 (점수 저장용)
    window.parent.postMessage({ type: 'GAME_OVER', gameId: 'neon-runner', score: displayScore }, '*');

    const colors = [0xffff00, 0xff7700, 0xff0000]; 
    colors.forEach((color) => {
        const geometry = new THREE.SphereGeometry(1, 32, 32);
        const material = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1.0 });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.copy(player.position);
        sphere.scale.set(0.1, 0.1, 0.1); 
        scene.add(sphere);
        explosionParts.push(sphere);
    });

    setTimeout(() => { endGame(displayScore); }, 1500);
}

function endGame(displayScore) {
    isExploding = false;
    scoreHud.classList.add('hidden');
    
    finalScoreEl.innerText = `FINAL SCORE: ${displayScore}`;
    finalScoreEl.classList.remove('hidden');
    startButton.innerText = "RESTART";

    showPanel(startMenu);
    explosionParts.forEach(p => scene.remove(p));
    explosionParts = [];
}

// --- [추가] 리더보드 통신 로직 ---
function requestLeaderboardData() {
    const listElement = document.querySelector('#leaderboard-menu ol');
    if(listElement) listElement.innerHTML = '<li style="text-align:center; color:#888;">LOADING DATA...</li>';

    window.parent.postMessage({ type: 'REQUEST_LEADERBOARD', gameId: 'neon-runner' }, '*');
}

window.addEventListener('message', (event) => {
    if (event.data.type === 'LEADERBOARD_DATA') {
        updateLeaderboardUI(event.data.data);
    }
});

function updateLeaderboardUI(data) {
    const listElement = document.querySelector('#leaderboard-menu ol');
    if(!listElement) return;
    listElement.innerHTML = ''; 

    if (data.length === 0) {
        listElement.innerHTML = '<li style="text-align:center;">NO RECORDS YET</li>';
        return;
    }

    data.forEach((user, index) => {
        const li = document.createElement('li');
        let rankIcon = `${index + 1}.`;
        let colorStyle = '';
        if (index === 0) { rankIcon = '🥇'; colorStyle = 'color: #ffd700;'; }
        else if (index === 1) { rankIcon = '🥈'; colorStyle = 'color: #c0c0c0;'; }
        else if (index === 2) { rankIcon = '🥉'; colorStyle = 'color: #cd7f32;'; }

        li.innerHTML = `
            <span style="font-weight:bold; margin-right:10px; ${colorStyle}">${rankIcon}</span>
            <span style="flex-grow:1; text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${user.name}</span>
            <span style="color:#00f3ff; font-weight:bold;">${user.score}</span>
        `;
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        listElement.appendChild(li);
    });
}

window.addEventListener('keydown', (e) => {
    if (!gameRunning) return;
    if (e.key === 'ArrowLeft' && playerLane > -1) { playerLane--; targetPlayerX = playerLane * LANE_WIDTH; }
    if (e.key === 'ArrowRight' && playerLane < 1) { playerLane++; targetPlayerX = playerLane * LANE_WIDTH; }
    if (e.code === 'Space' && !isJumping) { isJumping = true; playerVelocityY = JUMP_FORCE; }
});

initThreeJS();
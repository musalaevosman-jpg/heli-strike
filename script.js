const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('highScore');
const hpEl = document.getElementById('hp');
const overlay = document.getElementById('uiOverlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlaySub = document.getElementById('overlaySub');
const startBtn = document.getElementById('startBtn');

// Звуковой движок Web Audio (без внешних файлов)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  if (type === 'shoot') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.12);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
    osc.start(now);
    osc.stop(now + 0.12);
  } else if (type === 'hit') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.linearRampToValueAtTime(40, now + 0.15);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
    osc.start(now);
    osc.stop(now + 0.15);
  } else if (type === 'boom') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.4);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.4);
  }
}

// Управление
const keys = {
  w: false, s: false, a: false, d: false,
  ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
  Space: false
};

window.addEventListener('keydown', (e) => {
  if (keys.hasOwnProperty(e.key) || e.code === 'Space') {
    if (e.code === 'Space') keys.Space = true;
    else keys[e.key] = true;
  }
});

window.addEventListener('keyup', (e) => {
  if (keys.hasOwnProperty(e.key) || e.code === 'Space') {
    if (e.code === 'Space') keys.Space = false;
    else keys[e.key] = false;
  }
});

canvas.addEventListener('mousedown', () => { keys.Space = true; });
canvas.addEventListener('mouseup', () => { keys.Space = false; });

// Игровые объекты
let gameRunning = false;
let score = 0;
let highScore = localStorage.getItem('heli_highscore') || 0;
highScoreEl.innerText = highScore;

let player = {
  x: 80,
  y: 220,
  w: 48,
  h: 24,
  speed: 4,
  hp: 100,
  tilt: 0,
  rotorAngle: 0,
  lastShot: 0
};

let bullets = [];
let enemyBullets = [];
let enemies = [];
let particles = [];
let clouds = [];

// Создаем облака для фона
for (let i = 0; i < 6; i++) {
  clouds.push({
    x: Math.random() * canvas.width,
    y: Math.random() * (canvas.height - 100),
    w: 50 + Math.random() * 40,
    speed: 0.5 + Math.random() * 0.8
  });
}

function resetGame() {
  player.x = 80;
  player.y = 220;
  player.hp = 100;
  score = 0;
  bullets = [];
  enemyBullets = [];
  enemies = [];
  particles = [];
  scoreEl.innerText = score;
  hpEl.innerText = `${player.hp}%`;
}

function spawnEnemy() {
  if (!gameRunning) return;
  const isCopter = Math.random() > 0.3; // 70% вертолеты, 30% дроны-камикадзе
  enemies.push({
    x: canvas.width + 50,
    y: 50 + Math.random() * (canvas.height - 150),
    w: 44,
    h: 22,
    speed: 2 + Math.random() * 1.8,
    hp: isCopter ? 2 : 1,
    isCopter: isCopter,
    rotorAngle: 0,
    lastShot: Date.now() + Math.random() * 1000
  });
}

let enemyInterval;

// Рисование вертолёта игрока и врагов
function drawHelicopter(x, y, w, h, isPlayer, rotorAngle, tilt) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(tilt);

  // Кабина
  ctx.fillStyle = isPlayer ? '#27ae60' : '#c0392b';
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w * 0.65, h, 6);
  ctx.fill();

  // Стекло кабины
  ctx.fillStyle = isPlayer ? '#74b9ff' : '#ffeaa7';
  ctx.fillRect(-w / 2 + (isPlayer ? 18 : 2), -h / 2 + 3, 10, 8);

  // Хвост
  ctx.fillStyle = isPlayer ? '#1e8449' : '#962d22';
  const tailDir = isPlayer ? -1 : 1;
  ctx.fillRect(tailDir === -1 ? -w / 2 - 14 : w * 0.15, -4, 18, 6);

  // Хвостовой винт
  ctx.fillStyle = '#dfe6e9';
  const tailX = tailDir === -1 ? -w / 2 - 14 : w * 0.15 + 18;
  ctx.fillRect(tailX, -8 + Math.sin(rotorAngle * 2) * 6, 3, 12);

  // Стойка главного винта
  ctx.fillStyle = '#2c3e50';
  ctx.fillRect(-4, -h / 2 - 5, 6, 6);

  // Главный вращающийся винт
  ctx.strokeStyle = '#ecf0f1';
  ctx.lineWidth = 3;
  const rotorSpan = (w * 0.8) * Math.cos(rotorAngle);
  ctx.beginPath();
  ctx.moveTo(-rotorSpan, -h / 2 - 5);
  ctx.lineTo(rotorSpan, -h / 2 - 5);
  ctx.stroke();

  // Шасси (полозья)
  ctx.fillStyle = '#7f8c8d';
  ctx.fillRect(-w / 2 + 4, h / 2 + 3, w * 0.55, 3);
  ctx.fillRect(-w / 2 + 8, h / 2, 3, 4);
  ctx.fillRect(0, h / 2, 3, 4);

  ctx.restore();
}

// Создание взрыва/частиц
function createExplosion(x, y, color = '#e67e22', count = 12) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x: x,
      y: y,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 6,
      radius: Math.random() * 4 + 2,
      color: color,
      alpha: 1
    });
  }
}

// Главный цикл игры
function update() {
  if (!gameRunning) return;

  // Движение облаков
  clouds.forEach(c => {
    c.x -= c.speed;
    if (c.x + c.w < 0) c.x = canvas.width + 20;
  });

  // Управление игроком
  let moveX = 0;
  let moveY = 0;
  if (keys.w || keys.ArrowUp) moveY -= 1;
  if (keys.s || keys.ArrowDown) moveY += 1;
  if (keys.a || keys.ArrowLeft) moveX -= 1;
  if (keys.d || keys.ArrowRight) moveX += 1;

  player.x += moveX * player.speed;
  player.y += moveY * player.speed;

  // Ограничение по экрану
  player.x = Math.max(10, Math.min(canvas.width - player.w - 10, player.x));
  player.y = Math.max(15, Math.min(canvas.height - player.h - 20, player.y));

  // Наклон вертолета при движении
  player.tilt = moveX * 0.12;
  player.rotorAngle += 0.8;

  // Выстрелы игрока
  const now = Date.now();
  if (keys.Space && now - player.lastShot > 160) {
    bullets.push({ x: player.x + player.w, y: player.y + player.h / 2, vx: 9, vy: 0 });
    playSound('shoot');
    player.lastShot = now;
  }

  // Обновление пуль игрока
  for (let i = bullets.length - 1; i >= 0; i--) {
    bullets[i].x += bullets[i].vx;
    if (bullets[i].x > canvas.width) {
      bullets.splice(i, 1);
    }
  }

  // Обновление пуль врагов
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const eb = enemyBullets[i];
    eb.x -= 6;

    // Попадание во игрока
    if (
      eb.x > player.x && eb.x < player.x + player.w &&
      eb.y > player.y && eb.y < player.y + player.h
    ) {
      player.hp -= 10;
      createExplosion(eb.x, eb.y, '#e74c3c', 6);
      playSound('hit');
      enemyBullets.splice(i, 1);
      hpEl.innerText = `${Math.max(0, player.hp)}%`;

      if (player.hp <= 0) {
        gameOver();
        return;
      }
      continue;
    }

    if (eb.x < -10) {
      enemyBullets.splice(i, 1);
    }
  }

  // Обновление врагов
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.x -= e.speed;
    e.rotorAngle += 0.7;

    // Враги стреляют
    if (e.isCopter && now > e.lastShot) {
      enemyBullets.push({ x: e.x, y: e.y + e.h / 2 });
      e.lastShot = now + 1400 + Math.random() * 1000;
    }

    // Столкновение игрока с врагом
    if (
      player.x < e.x + e.w && player.x + player.w > e.x &&
      player.y < e.y + e.h && player.y + player.h > e.y
    ) {
      createExplosion(e.x, e.y, '#f39c12', 15);
      playSound('boom');
      player.hp -= 25;
      hpEl.innerText = `${Math.max(0, player.hp)}%`;
      enemies.splice(i, 1);

      if (player.hp <= 0) {
        gameOver();
        return;
      }
      continue;
    }

    // Проверка попаданий наших пуль во врага
    for (let j = bullets.length - 1; j >= 0; j--) {
      const b = bullets[j];
      if (
        b.x > e.x && b.x < e.x + e.w &&
        b.y > e.y && b.y < e.y + e.h
      ) {
        bullets.splice(j, 1);
        e.hp--;
        createExplosion(b.x, b.y, '#f1c40f', 5);
        playSound('hit');

        if (e.hp <= 0) {
          createExplosion(e.x + e.w / 2, e.y + e.h / 2, '#e67e22', 20);
          playSound('boom');
          enemies.splice(i, 1);
          score += e.isCopter ? 150 : 100;
          scoreEl.innerText = score;
        }
        break;
      }
    }

    // Удаление врагов за экраном
    if (e && e.x < -60) {
      enemies.splice(i, 1);
    }
  }

  // Обновление частиц
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= 0.03;
    if (p.alpha <= 0) {
      particles.splice(i, 1);
    }
  }
}

// Отрисовка кадра
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Облака
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  clouds.forEach(c => {
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.w / 2, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // Пули игрока
  ctx.fillStyle = '#f1c40f';
  bullets.forEach(b => {
    ctx.fillRect(b.x, b.y - 2, 8, 4);
  });

  // Пули врагов
  ctx.fillStyle = '#ff4757';
  enemyBullets.forEach(eb => {
    ctx.fillRect(eb.x, eb.y - 2, 8, 4);
  });

  // Враги
  enemies.forEach(e => {
    drawHelicopter(e.x, e.y, e.w, e.h, false, e.rotorAngle, -0.05);
  });

  // Игрок
  if (player.hp > 0) {
    drawHelicopter(player.x, player.y, player.w, player.h, true, player.rotorAngle, player.tilt);
  }

  // Частицы взрывов
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

function gameOver() {
  gameRunning = false;
  clearInterval(enemyInterval);
  playSound('boom');

  if (score > highScore) {
    highScore = score;
    localStorage.setItem('heli_highscore', highScore);
    highScoreEl.innerText = highScore;
  }

  overlayTitle.innerText = "МИССИЯ ПРОВАЛЕНА";
  overlayTitle.style.color = "#e74c3c";
  overlaySub.innerText = `ИТОГОВЫЙ СЧЁТ: ${score}`;
  startBtn.innerText = "ПОВТОРИТЬ МИССИЮ";
  overlay.style.display = 'flex';
}

startBtn.addEventListener('click', () => {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  resetGame();
  overlay.style.display = 'none';
  gameRunning = true;
  clearInterval(enemyInterval);
  enemyInterval = setInterval(spawnEnemy, 1200);
});

// Первый запуск цикла
requestAnimationFrame(gameLoop);
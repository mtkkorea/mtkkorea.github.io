(() => {
  const COLS = 10;
  const ROWS = 20;
  const MINI = 4;
  const SCORE_TABLE = [0, 100, 300, 500, 800];
  const ATTACK_TABLE = [0, 0, 1, 2, 4];
  const PIECES = {
    I: [[1, 1, 1, 1]],
    J: [
      [1, 0, 0],
      [1, 1, 1],
    ],
    L: [
      [0, 0, 1],
      [1, 1, 1],
    ],
    O: [
      [1, 1],
      [1, 1],
    ],
    S: [
      [0, 1, 1],
      [1, 1, 0],
    ],
    T: [
      [0, 1, 0],
      [1, 1, 1],
    ],
    Z: [
      [1, 1, 0],
      [0, 1, 1],
    ],
  };
  const PIECE_TYPES = Object.keys(PIECES);

  const getStoredBest = (key) => {
    try {
      return typeof localStorage === "undefined" ? 0 : Number(localStorage.getItem(key) || 0);
    } catch {
      return 0;
    }
  };

  const setStoredBest = (key, value) => {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, String(value));
      }
    } catch {
      // Storage can be unavailable in restricted browser contexts.
    }
  };

  const cloneMatrix = (matrix) => matrix.map((row) => [...row]);

  const rotateMatrix = (matrix) => {
    const width = matrix[0].length;
    const height = matrix.length;
    const rotated = Array.from({ length: width }, () => Array(height).fill(0));
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        rotated[x][height - 1 - y] = matrix[y][x];
      }
    }
    return rotated;
  };

  const createEmptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(""));

  const createPiece = (type) => ({
    type,
    shape: cloneMatrix(PIECES[type]),
    x: Math.floor((COLS - PIECES[type][0].length) / 2),
    y: 0,
  });

  class PlayerState {
    constructor(id) {
      this.id = id;
      this.bestKey = `battleTetrisBestP${id + 1}`;
      this.best = getStoredBest(this.bestKey);
      this.reset();
    }

    setBestKey(key) {
      this.bestKey = key;
      this.best = getStoredBest(this.bestKey);
    }

    reset() {
      this.board = createEmptyBoard();
      this.bag = [];
      this.current = this.nextPiece();
      this.next = this.nextPiece();
      this.score = 0;
      this.lines = 0;
      this.level = 1;
      this.garbageSent = 0;
      this.pendingGarbage = 0;
      this.lost = false;
      this.tickCount = 0;
      if (this.collides(this.current, 0, 0)) {
        this.lost = true;
      }
    }

    nextPiece() {
      if (this.bag.length === 0) {
        this.bag = [...PIECE_TYPES].sort(() => Math.random() - 0.5);
      }
      return createPiece(this.bag.pop());
    }

    collides(piece, offsetX = 0, offsetY = 0, shape = piece.shape) {
      for (let y = 0; y < shape.length; y += 1) {
        for (let x = 0; x < shape[y].length; x += 1) {
          if (!shape[y][x]) continue;
          const boardX = piece.x + x + offsetX;
          const boardY = piece.y + y + offsetY;
          if (boardX < 0 || boardX >= COLS || boardY >= ROWS) return true;
          if (boardY >= 0 && this.board[boardY][boardX]) return true;
        }
      }
      return false;
    }

    move(dx) {
      if (this.lost || this.collides(this.current, dx, 0)) return false;
      this.current.x += dx;
      return true;
    }

    rotate() {
      if (this.lost || this.current.type === "O") return true;
      const rotated = rotateMatrix(this.current.shape);
      const kicks = [0, -1, 1, -2, 2];
      const kick = kicks.find((x) => !this.collides(this.current, x, 0, rotated));
      if (kick === undefined) return false;
      this.current.x += kick;
      this.current.shape = rotated;
      return true;
    }

    softDrop() {
      if (this.lost) return false;
      if (!this.collides(this.current, 0, 1)) {
        this.current.y += 1;
        this.score += 1;
        return true;
      }
      this.lockPiece();
      return false;
    }

    hardDrop() {
      if (this.lost) return 0;
      let distance = 0;
      while (!this.collides(this.current, 0, 1)) {
        this.current.y += 1;
        distance += 1;
      }
      this.score += distance * 2;
      return this.lockPiece();
    }

    lockPiece() {
      const { shape, type } = this.current;
      for (let y = 0; y < shape.length; y += 1) {
        for (let x = 0; x < shape[y].length; x += 1) {
          if (!shape[y][x]) continue;
          const boardY = this.current.y + y;
          const boardX = this.current.x + x;
          if (boardY < 0) {
            this.lost = true;
            return { cleared: 0, attack: 0 };
          }
          this.board[boardY][boardX] = type;
        }
      }

      const cleared = this.clearLines();
      const attack = ATTACK_TABLE[cleared] || 0;
      this.lines += cleared;
      this.garbageSent += attack;
      this.score += SCORE_TABLE[cleared] * this.level;
      this.level = Math.floor(this.lines / 10) + 1;
      if (this.score > this.best) {
        this.best = this.score;
        setStoredBest(this.bestKey, this.best);
      }
      if (cleared === 0 && this.pendingGarbage > 0) {
        this.addGarbage(this.pendingGarbage);
        this.pendingGarbage = 0;
      }
      this.current = this.next;
      this.current.x = Math.floor((COLS - this.current.shape[0].length) / 2);
      this.current.y = 0;
      this.next = this.nextPiece();
      if (this.collides(this.current, 0, 0)) {
        this.lost = true;
      }
      return { cleared, attack };
    }

    clearLines() {
      const kept = this.board.filter((row) => row.some((cell) => !cell));
      const cleared = ROWS - kept.length;
      while (kept.length < ROWS) {
        kept.unshift(Array(COLS).fill(""));
      }
      this.board = kept;
      return cleared;
    }

    addGarbage(count) {
      for (let i = 0; i < count; i += 1) {
        this.board.shift();
        const hole = Math.floor(Math.random() * COLS);
        const row = Array.from({ length: COLS }, (_, index) => (index === hole ? "" : "G"));
        this.board.push(row);
      }
      if (this.board[0].some(Boolean)) {
        this.lost = true;
      }
    }

    receiveAttack(lines) {
      if (lines <= 0 || this.lost) return;
      this.addGarbage(lines);
      this.pendingGarbage = 0;
    }

    tick() {
      if (this.lost) return { cleared: 0, attack: 0 };
      this.tickCount += 1;
      const levelDelay = Math.max(1, 9 - this.level);
      if (this.tickCount % levelDelay !== 0) {
        return { cleared: 0, attack: 0 };
      }
      if (!this.collides(this.current, 0, 1)) {
        this.current.y += 1;
        return { cleared: 0, attack: 0 };
      }
      return this.lockPiece();
    }

    getCells() {
      const cells = this.board.map((row) => [...row]);
      if (!this.lost) {
        const { shape, type } = this.current;
        for (let y = 0; y < shape.length; y += 1) {
          for (let x = 0; x < shape[y].length; x += 1) {
            if (!shape[y][x]) continue;
            const boardY = this.current.y + y;
            const boardX = this.current.x + x;
            if (boardY >= 0 && boardY < ROWS && boardX >= 0 && boardX < COLS) {
              cells[boardY][boardX] = type;
            }
          }
        }
      }
      return cells;
    }
  }

  class BattleTetris {
    constructor(mode = "versus") {
      this.mode = mode;
      this.singleControlScheme = "left";
      this.players = [new PlayerState(0), new PlayerState(1)];
      this.running = false;
      this.paused = false;
      this.interval = null;
      this.winner = null;
      this.onChange = () => {};
      this.configureBestKeys();
    }

    setRenderer(callback) {
      this.onChange = callback;
      this.onChange(this);
    }

    configureBestKeys() {
      this.players[0].setBestKey(this.mode === "single" ? "battleTetrisBestSingle" : "battleTetrisBestP1");
      this.players[1].setBestKey("battleTetrisBestP2");
    }

    activePlayers() {
      return this.mode === "single" ? [this.players[0]] : this.players;
    }

    setMode(mode) {
      if (!["single", "versus"].includes(mode) || mode === this.mode) return;
      this.mode = mode;
      this.configureBestKeys();
      this.reset();
    }

    setSingleControlScheme(scheme) {
      if (!["left", "right"].includes(scheme) || scheme === this.singleControlScheme) return;
      this.singleControlScheme = scheme;
      this.onChange(this);
    }

    playerIndexForControl(controlSide) {
      if (this.mode === "single") {
        return controlSide === this.singleControlScheme ? 0 : null;
      }
      return controlSide === "left" ? 0 : 1;
    }

    start() {
      if (this.running && !this.winner) return;
      this.reset();
      this.running = true;
      this.paused = false;
      this.interval = setInterval(() => this.tick(), 80);
      this.onChange(this);
    }

    reset() {
      this.stopTimer();
      this.configureBestKeys();
      this.players.forEach((player) => player.reset());
      this.running = false;
      this.paused = false;
      this.winner = null;
      this.onChange(this);
    }

    restart() {
      this.reset();
      this.running = true;
      this.interval = setInterval(() => this.tick(), 80);
      this.onChange(this);
    }

    togglePause() {
      if (!this.running || this.winner) return;
      this.paused = !this.paused;
      this.onChange(this);
    }

    stopTimer() {
      if (this.interval) {
        clearInterval(this.interval);
        this.interval = null;
      }
    }

    tick() {
      if (!this.running || this.paused || this.winner) return;
      const results = this.activePlayers().map((player) => player.tick());
      results.forEach((result, index) => {
        if (this.mode === "versus" && result.attack > 0) {
          this.players[1 - index].receiveAttack(result.attack);
        }
      });
      this.checkWinner();
      this.onChange(this);
    }

    action(playerIndex, action) {
      const player = this.players[playerIndex];
      if (this.mode === "single" && playerIndex !== 0) return;
      if (!player || !this.running || this.paused || this.winner || player.lost) return;
      let result = null;
      if (action === "left") player.move(-1);
      if (action === "right") player.move(1);
      if (action === "rotate") player.rotate();
      if (action === "down") result = player.softDrop();
      if (action === "drop") result = player.hardDrop();
      if (this.mode === "versus" && result && result.attack > 0) {
        this.players[1 - playerIndex].receiveAttack(result.attack);
      }
      this.checkWinner();
      this.onChange(this);
    }

    actionFromControl(controlSide, action) {
      const playerIndex = this.playerIndexForControl(controlSide);
      if (playerIndex === null) return;
      this.action(playerIndex, action);
    }

    checkWinner() {
      const [p1, p2] = this.players;
      if (this.mode === "single") {
        if (p1.lost) {
          this.winner = "single-over";
          this.running = false;
          this.stopTimer();
        }
        return;
      }
      if (p1.lost || p2.lost) {
        this.winner = p1.lost && p2.lost ? "draw" : p1.lost ? 1 : 0;
        this.running = false;
        this.stopTimer();
      }
    }
  }

  class BrickBlast {
    constructor(canvas, elements = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.elements = elements;
      this.bestKey = "brickBlastBest";
      this.best = getStoredBest(this.bestKey);
      this.width = canvas.width;
      this.height = canvas.height;
      this.cols = 7;
      this.rows = 9;
      this.margin = 16;
      this.top = 78;
      this.gap = 6;
      this.ballRadius = 5;
      this.running = false;
      this.aiming = false;
      this.animation = null;
      this.reset();
      this.bind();
      this.render();
    }

    reset() {
      this.cancelAnimation();
      this.round = 1;
      this.score = 0;
      this.ballCount = 8;
      this.pendingBonus = 0;
      this.blocks = [];
      this.bonusBalls = [];
      this.balls = [];
      this.particles = [];
      this.moving = false;
      this.gameOver = false;
      this.launchPoint = { x: this.width / 2, y: this.height - 38 };
      this.aimPoint = { x: this.width / 2, y: this.height - 220 };
      this.addRow();
      this.updateHud("드래그해서 조준하고 손을 떼면 공 묶음이 발사됩니다.");
      this.render();
    }

    bind() {
      this.canvas.addEventListener("pointerdown", (event) => this.startAim(event));
      this.canvas.addEventListener("pointermove", (event) => this.moveAim(event));
      this.canvas.addEventListener("pointerup", (event) => this.releaseAim(event));
      this.canvas.addEventListener("pointercancel", () => {
        this.aiming = false;
      });
    }

    start() {
      if (this.gameOver) this.reset();
      this.running = true;
      this.updateHud("발사 각도를 잡아보세요. 위쪽으로 당길수록 더 시원하게 튕깁니다.");
      this.render();
    }

    cancelAnimation() {
      if (this.animation) {
        cancelAnimationFrame(this.animation);
        this.animation = null;
      }
    }

    cellSize() {
      return (this.width - this.margin * 2 - this.gap * (this.cols - 1)) / this.cols;
    }

    addRow() {
      this.blocks.forEach((block) => {
        block.row += 1;
      });
      this.bonusBalls.forEach((bonus) => {
        bonus.row += 1;
      });
      const occupied = new Set();
      const cells = Array.from({ length: this.cols }, (_, index) => index).sort(() => Math.random() - 0.5);
      const count = Math.min(this.cols - 1, 3 + Math.floor(this.round / 2));
      cells.slice(0, count).forEach((col) => {
        const hp = this.round + Math.floor(Math.random() * Math.max(2, this.round + 2));
        this.blocks.push({ row: 0, col, hp, maxHp: hp });
        occupied.add(col);
      });
      const bonusCol = cells.find((col) => !occupied.has(col));
      if (bonusCol !== undefined && (this.round === 1 || Math.random() < 0.82)) {
        this.bonusBalls.push({ row: 0, col: bonusCol, collected: false });
      }
      if (this.blocks.some((block) => block.row >= this.rows - 1)) {
        this.gameOver = true;
        this.running = false;
        this.updateHud("게임 오버! 블록이 위험선에 닿았습니다. 다시 시작으로 재도전하세요.");
      }
    }

    pointFromEvent(event) {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.width / rect.width;
      const scaleY = this.height / rect.height;
      return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY,
      };
    }

    startAim(event) {
      if (!this.running || this.moving || this.gameOver) return;
      event.preventDefault();
      this.aiming = true;
      this.canvas.setPointerCapture?.(event.pointerId);
      this.moveAim(event);
    }

    moveAim(event) {
      if (!this.aiming) return;
      event.preventDefault();
      const point = this.pointFromEvent(event);
      this.aimPoint = {
        x: Math.max(this.margin, Math.min(this.width - this.margin, point.x)),
        y: Math.max(this.top, Math.min(this.launchPoint.y - 48, point.y)),
      };
      this.render();
    }

    releaseAim(event) {
      if (!this.aiming) return;
      event.preventDefault();
      this.aiming = false;
      this.fire();
    }

    fire() {
      if (!this.running || this.moving || this.gameOver) return;
      const dx = this.aimPoint.x - this.launchPoint.x;
      const dy = this.aimPoint.y - this.launchPoint.y;
      const length = Math.hypot(dx, dy);
      if (length < 24 || dy > -12) {
        this.updateHud("위쪽으로 길게 조준한 뒤 손을 떼세요.");
        return;
      }
      const speed = 6.2;
      const vx = (dx / length) * speed;
      const vy = Math.min(-2.5, (dy / length) * speed);
      this.balls = Array.from({ length: this.ballCount }, (_, index) => ({
        x: this.launchPoint.x,
        y: this.launchPoint.y,
        vx,
        vy,
        delay: index * 5,
        done: false,
      }));
      this.moving = true;
      this.updateHud(`${this.ballCount}개의 공을 발사했습니다. 블록이 와르르 깨지는 순간을 기다려보세요.`);
      this.tick();
    }

    blockRect(block) {
      const size = this.cellSize();
      return {
        x: this.margin + block.col * (size + this.gap),
        y: this.top + block.row * (size + this.gap),
        width: size,
        height: size,
      };
    }

    bonusCenter(bonus) {
      const rect = this.blockRect(bonus);
      return {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
      };
    }

    tick() {
      if (!this.moving) return;
      this.balls.forEach((ball) => this.updateBall(ball));
      this.particles.forEach((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.life -= 1;
      });
      this.particles = this.particles.filter((particle) => particle.life > 0);
      if (this.balls.every((ball) => ball.done)) {
        this.finishRound();
        return;
      }
      this.render();
      this.animation = requestAnimationFrame(() => this.tick());
    }

    updateBall(ball) {
      if (ball.done) return;
      if (ball.delay > 0) {
        ball.delay -= 1;
        return;
      }
      ball.x += ball.vx;
      ball.y += ball.vy;
      if (ball.x <= this.margin || ball.x >= this.width - this.margin) {
        ball.vx *= -1;
        ball.x = Math.max(this.margin, Math.min(this.width - this.margin, ball.x));
      }
      if (ball.y <= this.top - 42) {
        ball.vy *= -1;
        ball.y = this.top - 42;
      }
      if (ball.y >= this.launchPoint.y) {
        ball.done = true;
        ball.y = this.launchPoint.y;
        return;
      }
      this.hitBonus(ball);
      this.hitBlocks(ball);
    }

    hitBonus(ball) {
      this.bonusBalls.forEach((bonus) => {
        if (bonus.collected) return;
        const center = this.bonusCenter(bonus);
        if (Math.hypot(ball.x - center.x, ball.y - center.y) < this.cellSize() * 0.32) {
          bonus.collected = true;
          this.pendingBonus += 1;
          this.spawnParticles(center.x, center.y, "#22c55e", 8);
        }
      });
    }

    hitBlocks(ball) {
      const index = this.blocks.findIndex((block) => {
        const rect = this.blockRect(block);
        return (
          ball.x + this.ballRadius >= rect.x &&
          ball.x - this.ballRadius <= rect.x + rect.width &&
          ball.y + this.ballRadius >= rect.y &&
          ball.y - this.ballRadius <= rect.y + rect.height
        );
      });
      if (index === -1) return;
      const block = this.blocks[index];
      const rect = this.blockRect(block);
      const overlapLeft = Math.abs(ball.x - rect.x);
      const overlapRight = Math.abs(ball.x - (rect.x + rect.width));
      const overlapTop = Math.abs(ball.y - rect.y);
      const overlapBottom = Math.abs(ball.y - (rect.y + rect.height));
      const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
      if (minOverlap === overlapLeft || minOverlap === overlapRight) {
        ball.vx *= -1;
      } else {
        ball.vy *= -1;
      }
      block.hp -= 1;
      this.score += 1;
      this.spawnParticles(ball.x, ball.y, "#fbbf24", 3);
      if (block.hp <= 0) {
        this.blocks.splice(index, 1);
        this.score += 10 + this.round;
        this.spawnParticles(rect.x + rect.width / 2, rect.y + rect.height / 2, "#fb7185", 14);
      }
      if (this.score > this.best) {
        this.best = this.score;
        setStoredBest(this.bestKey, this.best);
      }
    }

    finishRound() {
      this.moving = false;
      this.round += 1;
      this.ballCount += this.pendingBonus;
      const bonusText = this.pendingBonus > 0 ? ` 보너스 공 ${this.pendingBonus}개를 획득했습니다.` : "";
      this.pendingBonus = 0;
      this.bonusBalls = this.bonusBalls.filter((bonus) => !bonus.collected);
      this.addRow();
      if (!this.gameOver) {
        this.updateHud(`라운드 ${this.round}입니다.${bonusText} 다시 조준해서 더 크게 터트려보세요.`);
      }
      this.render();
    }

    spawnParticles(x, y, color, count) {
      const reduceMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) return;
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 3;
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color,
          life: 18 + Math.random() * 16,
        });
      }
    }

    updateHud(message) {
      const { round, balls, score, best, message: messageElement } = this.elements;
      if (round) round.textContent = this.round;
      if (balls) balls.textContent = this.ballCount;
      if (score) score.textContent = this.score;
      if (best) best.textContent = this.best;
      if (messageElement && message) messageElement.textContent = message;
    }

    render() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);
      const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
      gradient.addColorStop(0, "#13245a");
      gradient.addColorStop(1, "#0f172a");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, this.width, this.height);

      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      for (let x = this.margin; x <= this.width - this.margin; x += this.cellSize() + this.gap) {
        ctx.beginPath();
        ctx.moveTo(x, this.top - 18);
        ctx.lineTo(x, this.launchPoint.y);
        ctx.stroke();
      }

      this.drawBlocks();
      this.drawBonuses();
      this.drawAim();
      this.drawBalls();
      this.drawParticles();

      ctx.strokeStyle = "rgba(239,68,68,0.72)";
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(this.margin, this.top + (this.rows - 1) * (this.cellSize() + this.gap) - this.gap / 2);
      ctx.lineTo(this.width - this.margin, this.top + (this.rows - 1) * (this.cellSize() + this.gap) - this.gap / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      if (!this.running && !this.gameOver) {
        this.drawOverlay("Brick Blast", "시작 버튼을 누르고 조준해보세요.");
      }
      if (this.gameOver) {
        this.drawOverlay("Game Over", "다시 시작으로 새 게임을 시작하세요.");
      }
    }

    drawBlocks() {
      this.blocks.forEach((block) => {
        const rect = this.blockRect(block);
        const ratio = Math.max(0.1, block.hp / block.maxHp);
        const hue = 195 - ratio * 155;
        this.ctx.fillStyle = `hsl(${hue}, 84%, 55%)`;
        this.ctx.shadowColor = "rgba(251,191,36,0.42)";
        this.ctx.shadowBlur = block.hp <= 2 ? 18 : 0;
        this.roundRect(rect.x, rect.y, rect.width, rect.height, 8);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
        this.ctx.fillStyle = "#0f172a";
        this.ctx.font = "700 18px Trebuchet MS, sans-serif";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText(block.hp, rect.x + rect.width / 2, rect.y + rect.height / 2);
      });
    }

    drawBonuses() {
      this.bonusBalls.forEach((bonus) => {
        if (bonus.collected) return;
        const center = this.bonusCenter(bonus);
        this.ctx.fillStyle = "#22c55e";
        this.ctx.shadowColor = "rgba(34,197,94,0.7)";
        this.ctx.shadowBlur = 14;
        this.ctx.beginPath();
        this.ctx.arc(center.x, center.y, 11, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
        this.ctx.fillStyle = "#052e16";
        this.ctx.font = "800 14px Trebuchet MS, sans-serif";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText("+", center.x, center.y + 1);
      });
    }

    drawAim() {
      if (!this.running || this.moving || this.gameOver) return;
      this.ctx.strokeStyle = "rgba(255,255,255,0.35)";
      this.ctx.fillStyle = "rgba(251,191,36,0.92)";
      this.ctx.lineWidth = 3;
      this.ctx.setLineDash([6, 10]);
      this.ctx.beginPath();
      this.ctx.moveTo(this.launchPoint.x, this.launchPoint.y);
      this.ctx.lineTo(this.aimPoint.x, this.aimPoint.y);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      for (let i = 1; i <= 8; i += 1) {
        const t = i / 9;
        const x = this.launchPoint.x + (this.aimPoint.x - this.launchPoint.x) * t;
        const y = this.launchPoint.y + (this.aimPoint.y - this.launchPoint.y) * t;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    drawBalls() {
      const visibleBalls = this.balls.filter((ball) => !ball.done && ball.delay <= 0);
      if (visibleBalls.length === 0) {
        visibleBalls.push({ x: this.launchPoint.x, y: this.launchPoint.y });
      }
      visibleBalls.forEach((ball) => {
        this.ctx.fillStyle = "#fbbf24";
        this.ctx.shadowColor = "rgba(251,191,36,0.7)";
        this.ctx.shadowBlur = 12;
        this.ctx.beginPath();
        this.ctx.arc(ball.x, ball.y, this.ballRadius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
      });
    }

    drawParticles() {
      this.particles.forEach((particle) => {
        this.ctx.globalAlpha = Math.max(0, particle.life / 30);
        this.ctx.fillStyle = particle.color;
        this.ctx.beginPath();
        this.ctx.arc(particle.x, particle.y, 3, 0, Math.PI * 2);
        this.ctx.fill();
      });
      this.ctx.globalAlpha = 1;
    }

    drawOverlay(title, copy) {
      this.ctx.fillStyle = "rgba(15, 23, 42, 0.68)";
      this.ctx.fillRect(0, 0, this.width, this.height);
      this.ctx.fillStyle = "#fff7ed";
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.font = "800 34px Trebuchet MS, sans-serif";
      this.ctx.fillText(title, this.width / 2, this.height / 2 - 18);
      this.ctx.font = "700 16px Trebuchet MS, sans-serif";
      this.ctx.fillText(copy, this.width / 2, this.height / 2 + 22);
    }

    roundRect(x, y, width, height, radius) {
      this.ctx.beginPath();
      this.ctx.moveTo(x + radius, y);
      this.ctx.arcTo(x + width, y, x + width, y + height, radius);
      this.ctx.arcTo(x + width, y + height, x, y + height, radius);
      this.ctx.arcTo(x, y + height, x, y, radius);
      this.ctx.arcTo(x, y, x + width, y, radius);
      this.ctx.closePath();
    }
  }

  const makeCells = (container, count, className) => {
    container.textContent = "";
    return Array.from({ length: count }, () => {
      const cell = document.createElement("span");
      cell.className = className;
      container.appendChild(cell);
      return cell;
    });
  };

  const renderPiecePreview = (cells, piece) => {
    cells.forEach((cell) => {
      cell.className = "mini-cell";
    });
    piece.shape.forEach((row, y) => {
      row.forEach((filled, x) => {
        if (!filled) return;
        const index = y * MINI + x;
        if (cells[index]) {
          cells[index].className = `mini-cell piece-${piece.type.toLowerCase()}`;
        }
      });
    });
  };

  const setupPage = () => {
    const navToggle = document.querySelector(".nav-toggle");
    const siteNav = document.querySelector("#site-nav");
    const currentYear = document.querySelector("#current-year");
    const startButton = document.querySelector("#start-game");
    const pauseButton = document.querySelector("#pause-game");
    const restartButton = document.querySelector("#restart-game");
    const fullscreenButton = document.querySelector("#fullscreen-game");
    const message = document.querySelector("#battle-message");
    const resultPopup = document.querySelector("#result-popup");
    const resultPopupTitle = document.querySelector("#result-popup-title");
    const resultPopupMessage = document.querySelector("#result-popup-message");
    const resultPopupRestart = document.querySelector("#result-popup-restart");
    const resultPopupClose = document.querySelector("#result-popup-close");
    const modeInputs = [...document.querySelectorAll('input[name="game-mode"]')];
    const singleControlInputs = [...document.querySelectorAll('input[name="single-control"]')];
    const singleControlSelector = document.querySelector("[data-single-control-selector]");
    const gameRoot = document.querySelector("[data-game-root]");
    const modeCopy = document.querySelector("[data-mode-copy]");
    const controlHelps = [...document.querySelectorAll("[data-control-help]")];
    const gamesSection = document.querySelector("#battle-tetris");
    const boards = [...document.querySelectorAll("[data-board]")];
    const nextBoards = [...document.querySelectorAll("[data-next]")];

    const gameTabs = [...document.querySelectorAll("[role='tab'][aria-controls]")];
    const gamePanels = [...document.querySelectorAll(".game-panel[role='tabpanel']")];
    const showGamePanel = (panelId) => {
      gameTabs.forEach((tab) => {
        const isActive = tab.getAttribute("aria-controls") === panelId;
        tab.classList.toggle("is-active", isActive);
        tab.setAttribute("aria-selected", isActive.toString());
      });
      gamePanels.forEach((panel) => {
        panel.toggleAttribute("hidden", panel.id !== panelId);
      });
    };
    gameTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const panelId = tab.getAttribute("aria-controls");
        if (panelId) showGamePanel(panelId);
      });
    });
    document.querySelectorAll('a[href="#battle-tetris"], a[href="#brick-blast"], a[href="#rules"]').forEach((link) => {
      link.addEventListener("click", () => {
        const panelId = link.getAttribute("href")?.slice(1);
        if (panelId === "rules") {
          showGamePanel("brick-blast");
        } else if (panelId) {
          showGamePanel(panelId);
        }
      });
    });

    const brickCanvas = document.querySelector("#brick-canvas");
    if (brickCanvas instanceof HTMLCanvasElement) {
      const brickGame = new BrickBlast(brickCanvas, {
        round: document.querySelector("[data-brick-round]"),
        balls: document.querySelector("[data-brick-balls]"),
        score: document.querySelector("[data-brick-score]"),
        best: document.querySelector("[data-brick-best]"),
        message: document.querySelector("#brick-message"),
      });
      document.querySelector("#brick-start")?.addEventListener("click", () => brickGame.start());
      document.querySelector("#brick-restart")?.addEventListener("click", () => brickGame.reset());
      window.BrickBlast = { BrickBlast };
    }

    if (currentYear) {
      currentYear.textContent = new Date().getFullYear().toString();
    }

    if (navToggle && siteNav) {
      navToggle.addEventListener("click", () => {
        const isOpen = siteNav.classList.toggle("is-open");
        navToggle.setAttribute("aria-expanded", isOpen.toString());
      });

      siteNav.addEventListener("click", (event) => {
        if (event.target instanceof HTMLAnchorElement) {
          siteNav.classList.remove("is-open");
          navToggle.setAttribute("aria-expanded", "false");
        }
      });
    }

    if (boards.length !== 2 || nextBoards.length !== 2) return;

    const boardCells = boards.map((board) => makeCells(board, COLS * ROWS, "cell"));
    const miniCells = nextBoards.map((board) => makeCells(board, MINI * MINI, "mini-cell"));
    const game = new BattleTetris();
    let announcedWinner = null;
    const controlHelpLabels = {
      left: ["A: 왼쪽", "D: 오른쪽", "S: 빠른 낙하", "W: 회전", "Space: 하드드롭"],
      right: ["←: 왼쪽", "→: 오른쪽", "↓: 빠른 낙하", "↑: 회전", "Enter: 하드드롭"],
    };

    const winnerText = (winner) => {
      if (winner === "single-over") return "게임 오버";
      if (winner === "draw") return "무승부";
      return `${winner + 1}P 승리`;
    };

    const hideResultPopup = () => {
      resultPopup?.setAttribute("hidden", "");
    };

    const showResultPopup = (winner) => {
      if (!resultPopup || !resultPopupTitle || !resultPopupMessage) return;
      const resultText = winnerText(winner);
      resultPopupTitle.textContent = resultText;
      resultPopupMessage.textContent = `${resultText}입니다. 다시 시작을 누르면 새 경기가 바로 시작됩니다.`;
      resultPopup.removeAttribute("hidden");
      resultPopupClose?.focus();
    };

    const fullscreenElement = () =>
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement ||
      null;

    const isGamesFullscreen = () => fullscreenElement() === gamesSection;

    const updateFullscreenButton = () => {
      if (!fullscreenButton) return;
      const isFullscreen = isGamesFullscreen();
      fullscreenButton.textContent = isFullscreen ? "전체화면 종료" : "전체화면";
      fullscreenButton.setAttribute("aria-pressed", isFullscreen.toString());
    };

    const requestFullscreen = (element) => {
      const request =
        element?.requestFullscreen ||
        element?.webkitRequestFullscreen ||
        element?.msRequestFullscreen;
      return request ? request.call(element) : Promise.reject(new Error("fullscreen unsupported"));
    };

    const exitFullscreen = () => {
      const exit =
        document.exitFullscreen ||
        document.webkitExitFullscreen ||
        document.msExitFullscreen;
      return exit ? exit.call(document) : Promise.reject(new Error("fullscreen unsupported"));
    };

    const toggleFullscreen = async () => {
      if (!gamesSection) return;
      try {
        if (isGamesFullscreen()) {
          await exitFullscreen();
        } else {
          await requestFullscreen(gamesSection);
        }
      } catch {
        if (message) {
          message.textContent = "이 브라우저에서는 전체화면을 시작할 수 없습니다. 브라우저 설정을 확인해 주세요.";
        }
      } finally {
        updateFullscreenButton();
      }
    };

    const updateControlHelp = (container, labels) => {
      if (!container) return;
      const key = labels.join("|");
      if (container.dataset.helpKey === key) return;
      container.dataset.helpKey = key;
      container.textContent = "";
      labels.forEach((label) => {
        const item = document.createElement("span");
        item.textContent = label;
        container.appendChild(item);
      });
    };

    const render = (state) => {
      state.players.forEach((player, playerIndex) => {
        const cells = player.getCells();
        cells.flat().forEach((cellValue, index) => {
          const cell = boardCells[playerIndex][index];
          cell.className = "cell";
          if (cellValue === "G") cell.classList.add("is-garbage");
          if (cellValue && cellValue !== "G") cell.classList.add(`piece-${cellValue.toLowerCase()}`);
        });
        renderPiecePreview(miniCells[playerIndex], player.next);
        document.querySelector(`[data-score="${playerIndex}"]`).textContent = player.score;
        document.querySelector(`[data-lines="${playerIndex}"]`).textContent = player.lines;
        document.querySelector(`[data-level="${playerIndex}"]`).textContent = player.level;
        document.querySelector(`[data-garbage="${playerIndex}"]`).textContent = player.pendingGarbage;
        document.querySelector(`[data-best="${playerIndex}"]`).textContent = player.best;
        const panel = document.querySelector(`[data-player-panel="${playerIndex}"]`);
        panel.toggleAttribute("data-lost", player.lost);
      });

      gameRoot?.setAttribute("data-mode", state.mode);
      modeInputs.forEach((input) => {
        input.checked = input.value === state.mode;
      });
      singleControlInputs.forEach((input) => {
        input.checked = input.value === state.singleControlScheme;
      });
      if (singleControlSelector) {
        singleControlSelector.toggleAttribute("hidden", state.mode !== "single");
        singleControlSelector.setAttribute("aria-hidden", (state.mode !== "single").toString());
      }
      updateControlHelp(
        controlHelps[0],
        controlHelpLabels[state.mode === "single" ? state.singleControlScheme : "left"],
      );
      updateControlHelp(controlHelps[1], controlHelpLabels.right);
      if (modeCopy) {
        modeCopy.textContent =
          state.mode === "single"
            ? "1인용에서는 공격 없이 1P 점수와 최고 점수에 도전합니다."
            : "2인용에서는 라인을 지우면 상대 보드에 방해줄을 보냅니다.";
      }

      if (modeCopy && state.mode === "single") {
        modeCopy.textContent = `1인용에서는 ${state.singleControlScheme === "left" ? "왼쪽 자판" : "오른쪽 방향키"}로 1P 점수와 최고 점수에 도전합니다.`;
      }

      if (state.winner === "single-over") {
        message.textContent = "게임 오버입니다. 다시 시작을 누르면 1인용으로 바로 재도전합니다.";
      } else if (state.winner === "draw") {
        message.textContent = "무승부입니다. 다시 시작을 누르면 새 경기가 바로 시작됩니다.";
      } else if (state.winner !== null) {
        message.textContent = `${state.winner + 1}P 승리! 다시 시작을 누르면 새 경기가 바로 시작됩니다.`;
      } else if (state.paused) {
        message.textContent = "일시정지 중입니다.";
      } else if (state.running) {
        message.textContent =
          state.mode === "single"
            ? "1인용 진행 중입니다. P 또는 일시정지 버튼으로 멈출 수 있습니다."
            : "2인용 경기 진행 중입니다. P 또는 일시정지 버튼으로 멈출 수 있습니다.";
      } else {
        message.textContent =
          state.mode === "single"
            ? "1인용을 선택했습니다. 게임 시작을 누르면 1P 보드만 시작됩니다."
            : "2인용을 선택했습니다. 게임 시작을 누르면 두 보드가 동시에 시작됩니다.";
      }

      if (state.mode === "single" && state.winner === null && !state.paused) {
        const controlLabel = state.singleControlScheme === "left" ? "왼쪽 자판" : "오른쪽 방향키";
        message.textContent = state.running
          ? `1인용 진행 중입니다. ${controlLabel}로 조작하고, P 또는 일시정지 버튼으로 멈출 수 있습니다.`
          : `1인용을 선택했습니다. ${controlLabel}를 사용합니다. 게임 시작을 누르면 1P 보드만 시작합니다.`;
      }

      if (state.winner === null) {
        announcedWinner = null;
        hideResultPopup();
      } else if (announcedWinner !== state.winner) {
        announcedWinner = state.winner;
        showResultPopup(state.winner);
      }
    };

    game.setRenderer(render);

    startButton?.addEventListener("click", () => game.start());
    pauseButton?.addEventListener("click", () => game.togglePause());
    restartButton?.addEventListener("click", () => game.restart());
    fullscreenButton?.addEventListener("click", toggleFullscreen);
    document.addEventListener("fullscreenchange", updateFullscreenButton);
    document.addEventListener("webkitfullscreenchange", updateFullscreenButton);
    document.addEventListener("MSFullscreenChange", updateFullscreenButton);
    resultPopupClose?.addEventListener("click", hideResultPopup);
    resultPopupRestart?.addEventListener("click", () => game.restart());
    modeInputs.forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) {
          game.setMode(input.value);
        }
      });
    });
    singleControlInputs.forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) {
          game.setSingleControlScheme(input.value);
        }
      });
    });

    document.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      const keyMap = {
        a: ["left", "left"],
        d: ["left", "right"],
        s: ["left", "down"],
        w: ["left", "rotate"],
        " ": ["left", "drop"],
        arrowleft: ["right", "left"],
        arrowright: ["right", "right"],
        arrowdown: ["right", "down"],
        arrowup: ["right", "rotate"],
        enter: ["right", "drop"],
      };
      if (key === "p") {
        event.preventDefault();
        game.togglePause();
        return;
      }
      if (key === "r") {
        event.preventDefault();
        game.restart();
        return;
      }
      const mapped = keyMap[key];
      if (!mapped) return;
      event.preventDefault();
      game.actionFromControl(mapped[0], mapped[1]);
    });

    document.querySelectorAll("[data-touch-player]").forEach((button) => {
      button.addEventListener("click", () => {
        const player = Number(button.getAttribute("data-touch-player"));
        const action = button.getAttribute("data-action");
        game.action(player, action);
      });
    });

    window.BattleTetris = { BattleTetris, PlayerState, rotateMatrix, createEmptyBoard };
  };

  if (typeof document !== "undefined") {
    setupPage();
  }

  if (typeof globalThis !== "undefined") {
    globalThis.BattleTetrisCore = { BattleTetris, PlayerState, rotateMatrix, createEmptyBoard };
    globalThis.BrickBlastCore = { BrickBlast };
  }
})();

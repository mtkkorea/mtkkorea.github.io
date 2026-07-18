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
    const boards = [...document.querySelectorAll("[data-board]")];
    const nextBoards = [...document.querySelectorAll("[data-next]")];

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
  }
})();

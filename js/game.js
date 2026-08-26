(function (UB) {
  'use strict';

  const timerValues = UB.DIFFICULTY_SECONDS;
  let timerHandle = null;
  let boardTargetResolver = null;

  function blankState() {
    return {
      status: 'menu', difficulty: 'normal', board: [], selectedCells: [], assignments: {},
      craftedUnits: [], remainingTime: 480, boardSize: 10, initialBlockCount: 100, score: 0, unlimitedMode: false,
      chainCount: 0, maxChainCount: 0, hintsRemaining: 5, isAnimating: false,
      isPaused: false, timeExpired: false, removedBlocks: 0, correctCrafts: 0,
      placementCandidates: [], hintPath: [], abilityPath: [], lastAffected: [],
      pushMotion: [], pushDirection: null, rotationMotion: [], gravityMovements: [], attractMovements: [],
      bonusItems: 0, bonusMilestone: 0, bonusUnitTypes: [], nextBonusThreshold: UB.bonusItemThreshold(1), itemTargeting: false,
      gravityPulse: 0, abilityPulse: 0, lastAbility: null, focusedIndex: 90,
      startedAt: null, initialSeconds: 480, tutorialMode: false, shuffleFree: false
    };
  }

  const Game = {
    state: blankState(),

    setStatus: function (status) {
      this.state.status = status;
      this.state.isAnimating = status === 'animating';
      UB.UI.syncGameState();
    },

    initialize: function (difficulty, unlimitedMode) {
      if (UB.Navigation) UB.Navigation.enter('game');
      window.clearInterval(timerHandle);
      this.state = blankState();
      this.state.difficulty = difficulty || 'normal';
      this.state.unlimitedMode = Boolean(unlimitedMode);
      const config = UB.DIFFICULTIES[this.state.difficulty] || UB.DIFFICULTIES.normal;
      this.state.boardSize = config.boardSize;
      this.state.initialBlockCount = config.initialBlocks;
      this.state.hintsRemaining = config.hints;
      this.state.focusedIndex = config.boardSize * (config.boardSize - 1);
      this.state.remainingTime = config.seconds || timerValues[this.state.difficulty];
      this.state.initialSeconds = this.state.remainingTime;
      this.state.board = UB.Board.generateBoard(config.boardSize);
      this.state.startedAt = Date.now();
      this.setStatus('playing');
      this.syncShuffleState(UB.Board.findAvailableRecipe(this.state.board));
      UB.UI.showGame();
      UB.UI.renderAll();
      this.startTimer();
      window.setTimeout(function () { UB.UI.focusBoardCell(Game.state.focusedIndex); }, 80);
    },

    startTutorialSession: function (board) {
      window.clearInterval(timerHandle);
      this.state = blankState();
      this.state.difficulty = 'easy';
      this.state.tutorialMode = true;
      this.state.unlimitedMode = true;
      this.state.boardSize = 5;
      this.state.initialBlockCount = 25;
      this.state.hintsRemaining = 7;
      this.state.remainingTime = 600;
      this.state.initialSeconds = 600;
      this.state.focusedIndex = 20;
      this.state.board = (board || []).slice();
      while (this.state.board.length < 25) this.state.board.push(null);
      this.state.startedAt = Date.now();
      this.setStatus('playing');
      UB.UI.showGame();
      UB.UI.renderAll();
    },

    startTimer: function () {
      window.clearInterval(timerHandle);
      if (this.state.unlimitedMode || this.state.tutorialMode) return;
      timerHandle = window.setInterval(function () {
        const current = Game.state;
        if (current.status === 'menu' || current.status === 'won' || current.status === 'lost' || current.isPaused || current.remainingTime <= 0) return;
        current.remainingTime -= 1;
        UB.UI.updateStatus();
        if (current.remainingTime <= 10 && current.remainingTime > 0) {
          UB.UI.flashCountdown(current.remainingTime);
        }
        if (current.remainingTime === 0) {
          current.timeExpired = true;
          if (!current.isAnimating) Game.finalizeTimedOut();
        }
      }, 1000);
    },

    togglePause: function () {
      if (this.state.status === 'won' || this.state.status === 'lost' || this.state.status === 'menu') return;
      if (this.state.isAnimating && !this.state.isPaused) return;
      if (!this.state.isPaused) {
        this.state.resumeStatus = this.state.status;
        this.state.isPaused = true;
        this.setStatus('paused');
        UB.UI.showPause();
      } else {
        this.state.isPaused = false;
        this.setStatus(this.state.resumeStatus || 'playing');
        this.state.resumeStatus = null;
        UB.UI.closeModal();
      }
    },

    selectCell: function (index) {
      const current = this.state;
      if (boardTargetResolver) {
        const resolve = boardTargetResolver;
        boardTargetResolver = null;
        UB.UI.setTargeting(false);
        resolve(index);
        return;
      }
      if (current.status === 'placing') {
        if (current.placementCandidates.indexOf(index) >= 0) this.placeDerivedUnit(index);
        return;
      }
      if (current.status === 'placingItem') {
        this.activateBonusItem(index);
        return;
      }
      if (current.status !== 'playing' || current.isPaused || current.isAnimating || current.timeExpired) return;
      const block = current.board[index];
      if (!block || block.type !== 'base') return;
      const existing = current.selectedCells.indexOf(index);
      if (existing >= 0) {
        if (existing === current.selectedCells.length - 1) this.deselectLastCell();
        else UB.UI.toast('경로의 마지막 블록부터 취소할 수 있습니다.');
        return;
      }
      if (current.selectedCells.length && !UB.Board.isAdjacent(current.selectedCells[current.selectedCells.length - 1], index, current.boardSize)) {
        UB.UI.toast('직전에 선택한 블록과 인접한 칸을 선택하세요.');
        return;
      }
      current.selectedCells.push(index);
      current.assignments[block.id] = null;
      current.hintPath = [];
      UB.UI.renderBoard();
      UB.UI.renderComposer();
    },

    deselectLastCell: function () {
      const index = this.state.selectedCells.pop();
      if (index === undefined) return;
      const block = this.state.board[index];
      if (block) delete this.state.assignments[block.id];
      UB.UI.renderBoard();
      UB.UI.renderComposer();
    },

    clearSelection: function () {
      if (this.state.status === 'placing') this.setStatus('playing');
      if (this.state.status === 'placingItem') {
        this.state.itemTargeting = false;
        this.setStatus('playing');
      }
      this.state.selectedCells = [];
      this.state.assignments = {};
      this.state.placementCandidates = [];
      this.state.hintPath = [];
      UB.UI.renderBoard();
      UB.UI.renderComposer();
    },

    cycleAssignment: function (blockId) {
      if (this.state.status !== 'playing') return;
      const current = this.state.assignments[blockId];
      this.state.assignments[blockId] = current === null ? 'numerator' : current === 'numerator' ? 'denominator' : null;
      UB.UI.renderBoard();
      UB.UI.renderComposer();
    },

    getAssignments: function () {
      const current = this.state;
      return current.selectedCells.map(function (index) {
        const block = current.board[index];
        return block ? { id: block.id, unit: block.unit, role: current.assignments[block.id] || null, index: index } : null;
      }).filter(Boolean);
    },

    craftDerivedUnit: async function () {
      if (this.state.status !== 'playing' || this.state.timeExpired) return;
      const matches = UB.UnitSystem.findMatchingUnits(this.getAssignments());
      if (!matches.length) return;
      let unit = matches[0];
      if (matches.length > 1) {
        const symbol = await UB.UI.requestChoice('제작할 유도단위를 선택하세요', matches.map(function (candidate) {
          return {
            value: candidate.symbol,
            label: candidate.symbol + ' · ' + candidate.nameKo,
            subtitle: candidate.quantity,
            description: candidate.description
          };
        }));
        if (this.state.status !== 'playing' || this.state.timeExpired) return;
        unit = matches.find(function (candidate) { return candidate.symbol === symbol; }) || matches[0];
      }
      this.state.placementCandidates = this.state.selectedCells.slice();
      this.state.pendingUnit = unit;
      this.setStatus('placing');
      UB.UI.renderBoard();
      UB.UI.renderComposer();
      UB.UI.toast(unit.nameKo + '(' + unit.symbol + ')을 놓을 강조 칸을 선택하세요.');
    },

    placeDerivedUnit: async function (index) {
      const current = this.state;
      if (current.status !== 'placing' || current.placementCandidates.indexOf(index) < 0) return;
      const unit = current.pendingUnit;
      const selected = current.selectedCells.slice();
      this.setStatus('animating');
      const special = UB.Board.createSpecialBlock(unit);
      selected.forEach(function (cell) { current.board[cell] = null; });
      current.board[index] = special;
      this.recordCraft(unit, selected.length);
      current.selectedCells = [];
      current.assignments = {};
      current.placementCandidates = [];
      current.pendingUnit = null;
      UB.UI.renderAll();
      await new Promise(function (resolve) { window.setTimeout(resolve, 240); });
      await UB.Abilities.settle();
      await UB.Abilities.activateSpecial(special.id, 1, new Set());
      current.chainCount = 0;
      current.lastAffected = [];
      if (UB.Board.baseCount(current.board) === 0) {
        this.win();
      } else if (current.timeExpired) {
        this.lose();
      } else {
        this.setStatus('playing');
        const available = UB.Board.findAvailableRecipe(current.board);
        this.syncShuffleState(available);
        UB.UI.renderAll();
      }
    },

    useHint: function () {
      const current = this.state;
      if (current.status !== 'playing' || current.hintsRemaining <= 0) return;
      const hint = UB.Board.findAvailableRecipe(current.board);
      this.syncShuffleState(hint);
      if (!hint) {
        UB.UI.toast('제작 가능한 유도단위가 없어 힌트를 차감하지 않았습니다. 셔플로 배열을 바꿔 보세요.');
      } else {
        current.hintsRemaining -= 1;
        current.hintPath = hint.path;
        UB.UI.toast(hint.unit.nameKo + ' ' + UB.UnitSystem.formatAssignments(hint.materials, 'fraction') + ' 경로를 강조했습니다.');
        UB.UI.renderBoard();
      }
      UB.UI.updateStatus();
    },

    recordCraft: function (unit, materialCount) {
      const current = this.state;
      const count = Math.max(0, Number(materialCount) || 0);
      current.removedBlocks += count;
      current.correctCrafts += 1;
      current.craftedUnits.push(unit.symbol);
      current.score += count * 120;
      return this.recordBonusUnit(unit.symbol);
    },

    recordBonusUnit: function (symbol) {
      const current = this.state;
      if (current.bonusUnitTypes.indexOf(symbol) < 0) current.bonusUnitTypes.push(symbol);
      return this.checkBonusReward();
    },

    checkBonusReward: function () {
      const current = this.state;
      const distinctCount = current.bonusUnitTypes.length;
      if (distinctCount < current.nextBonusThreshold) return 0;
      const completedThreshold = current.nextBonusThreshold;
      current.bonusItems += 1;
      current.bonusMilestone += 1;
      current.bonusUnitTypes = [];
      current.nextBonusThreshold = UB.bonusItemThreshold(current.bonusMilestone + 1);
      UB.UI.toast('서로 다른 특수 단위 ' + completedThreshold + '종을 제작해 3×3 반응 폭탄 1개를 획득했습니다. 다음 단위 목록을 새로 시작합니다.');
      return 1;
    },

    useBonusItem: function () {
      const current = this.state;
      if (current.status !== 'playing' || current.bonusItems <= 0 || current.isPaused) return;
      this.clearSelection();
      current.itemTargeting = true;
      this.setStatus('placingItem');
      if (!this.isBonusTarget(current.focusedIndex)) {
        const center = Math.floor(current.boardSize / 2);
        current.focusedIndex = UB.Board.toIndex(center, center, current.boardSize);
      }
      UB.UI.renderAll();
      window.setTimeout(function () { UB.UI.focusBoardCell(current.focusedIndex); }, 0);
      UB.UI.toast('가장자리를 제외한 강조 영역에서 반응 폭탄의 중심을 선택하세요.');
    },

    isBonusTarget: function (index) {
      const current = this.state;
      const point = UB.Board.rowCol(index, current.boardSize);
      return index >= 0 && index < current.boardSize * current.boardSize &&
        point.row > 0 && point.row < current.boardSize - 1 &&
        point.col > 0 && point.col < current.boardSize - 1;
    },

    getBonusArea: function (index) {
      const current = this.state;
      if (!this.isBonusTarget(index)) return [];
      const point = UB.Board.rowCol(index, current.boardSize);
      const area = [];
      for (let row = point.row - 1; row <= point.row + 1; row += 1) {
        for (let col = point.col - 1; col <= point.col + 1; col += 1) area.push(UB.Board.toIndex(row, col, current.boardSize));
      }
      return area;
    },

    activateBonusItem: async function (index) {
      const current = this.state;
      if (current.status !== 'placingItem' || current.bonusItems <= 0) return;
      if (!this.isBonusTarget(index)) { UB.UI.toast('3×3 영역이 보드 안에 모두 들어오는 칸을 선택하세요.'); return; }
      const area = this.getBonusArea(index);
      current.itemTargeting = false;
      current.bonusItems -= 1;
      current.lastAffected = area.filter(function (cell) { return current.board[cell] && current.board[cell].type === 'base'; });
      this.setStatus('animating');
      UB.UI.renderAll();
      await UB.UI.playTelegraph(index, { symbol: '✦', kind: 'item', label: '3×3 반응 폭발' }, 1100);
      await UB.Abilities.removeBase(area, 1);
      await UB.Abilities.settle();
      current.lastAffected = [];
      if (UB.Board.baseCount(current.board) === 0) {
        this.win();
      } else if (current.timeExpired && !current.unlimitedMode) {
        this.lose();
      } else {
        this.setStatus('playing');
        this.syncShuffleState(UB.Board.findAvailableRecipe(current.board));
        UB.UI.renderAll();
      }
    },

    syncShuffleState: function (availableRecipe) {
      const current = this.state;
      const available = Boolean(availableRecipe);
      current.shuffleFree = !available;
      UB.UI.setShuffleAvailable(current.unlimitedMode ? !available : true);
      return available;
    },

    shuffle: function (force) {
      const current = this.state;
      if (current.status !== 'playing' && !force) return;
      const availableBeforeShuffle = Boolean(UB.Board.findAvailableRecipe(current.board));
      if (!force && current.unlimitedMode && availableBeforeShuffle) return;
      const before = current.board.filter(Boolean).length;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        UB.Board.shuffleRemaining(current.board);
        if (UB.Board.findAvailableRecipe(current.board)) break;
      }
      const after = current.board.filter(Boolean).length;
      if (!force && !current.unlimitedMode && availableBeforeShuffle) current.remainingTime = Math.max(0, current.remainingTime - 10);
      current.hintPath = [];
      this.clearSelection();
      this.syncShuffleState(UB.Board.findAvailableRecipe(current.board));
      UB.UI.toast('블록 ' + after + '개의 위치를 재배열했습니다.' + (before === after ? '' : ' (수량 검증 필요)'));
      UB.UI.renderAll();
      if (!current.unlimitedMode && current.remainingTime === 0) { current.timeExpired = true; this.finalizeTimedOut(); }
    },

    requestBoardTarget: function (message) {
      UB.UI.setTargeting(true, message);
      return new Promise(function (resolve) { boardTargetResolver = resolve; });
    },

    finalizeTimedOut: function () {
      if (this.state.unlimitedMode) return;
      if (this.state.isAnimating) return;
      if (UB.Board.baseCount(this.state.board) === 0) this.win(); else this.lose();
    },

    win: function () {
      if (this.state.status === 'won') return;
      window.clearInterval(timerHandle);
      this.setStatus('won');
      UB.UI.showResult(true);
    },

    lose: function () {
      if (this.state.status === 'lost') return;
      window.clearInterval(timerHandle);
      this.setStatus('lost');
      UB.UI.showResult(false);
    },

    backToMenu: function (options) {
      window.clearInterval(timerHandle);
      this.state = blankState();
      UB.UI.closeModal();
      UB.UI.showMenu();
      if (!(options && options.preserveHistory) && UB.Navigation) UB.Navigation.leave();
    },

    restart: function () { this.initialize(this.state.difficulty, this.state.unlimitedMode); }
  };

  UB.Game = Game;
})(window.UnitBreaker = window.UnitBreaker || {});

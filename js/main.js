(function (UB) {
  'use strict';

  function selectedDifficulty() {
    const checked = document.querySelector('input[name="difficulty"]:checked');
    return checked ? checked.value : 'normal';
  }

  function bindEvents() {
    document.querySelector('#start-button').addEventListener('click', function () {
      UB.Audio.unlock(); UB.Game.initialize(selectedDifficulty(), document.querySelector('#unlimited-mode').checked);
    });
    document.querySelectorAll('[data-open="tutorial"]').forEach(function (button) { button.addEventListener('click', function () { UB.UI.showTutorial(0); }); });
    document.querySelectorAll('[data-open="codex"]').forEach(function (button) { button.addEventListener('click', UB.UI.showCodex); });
    document.querySelector('#codex-button').addEventListener('click', UB.UI.showCodex);
    document.querySelector('#keyboard-help-button').addEventListener('click', UB.UI.showKeyboardHelp);
    document.querySelector('#pause-button').addEventListener('click', function () { UB.Game.togglePause(); });
    document.querySelector('#home-button').addEventListener('click', function () { UB.Game.backToMenu(); });
    document.querySelector('#hint-button').addEventListener('click', function () { UB.Game.useHint(); });
    document.querySelector('#shuffle-button').addEventListener('click', function () { UB.Game.shuffle(false); });
    document.querySelector('#bonus-item-button').addEventListener('click', function () { UB.Game.useBonusItem(); });
    document.querySelector('#reset-selection').addEventListener('click', function () { UB.Game.clearSelection(); });
    document.querySelector('#craft-button').addEventListener('click', function () { UB.Game.craftDerivedUnit(); });
    document.querySelector('#sound-button').addEventListener('click', function (event) {
      const muted = UB.Audio.toggle(); event.currentTarget.textContent = muted ? '×' : '♪';
      event.currentTarget.setAttribute('aria-pressed', String(muted));
      event.currentTarget.setAttribute('aria-label', muted ? '음향 켜기' : '음향 끄기');
    });

    document.querySelector('#board').addEventListener('click', function (event) {
      const cell = event.target.closest('.cell'); if (!cell) return;
      UB.Game.state.focusedIndex = Number(cell.dataset.index); UB.Game.selectCell(Number(cell.dataset.index));
    });
    document.querySelector('#material-list').addEventListener('click', function (event) {
      const chip = event.target.closest('.material-chip'); if (chip) UB.Game.cycleAssignment(chip.dataset.blockId);
    });
    window.addEventListener('resize', UB.UI.drawSelectionPath);

    document.addEventListener('keydown', function (event) {
      const state = UB.Game.state;
      if (event.key === 'Escape') {
        if (document.querySelector('#modal-root').classList.contains('open')) return;
        UB.Game.clearSelection(); return;
      }
      if (state.status === 'menu' || state.status === 'won' || state.status === 'lost') return;
      if (event.key.toLowerCase() === 'p') { event.preventDefault(); UB.Game.togglePause(); return; }
      if (event.key.toLowerCase() === 'h') { event.preventDefault(); UB.Game.useHint(); return; }
      if (event.key.toLowerCase() === 'r') { event.preventDefault(); UB.Game.clearSelection(); return; }
      if (event.key === 'Backspace') { event.preventDefault(); UB.Game.deselectLastCell(); return; }
      if (state.isPaused) return;
      const size = state.boardSize || UB.BOARD_SIZE;
      const arrows = { ArrowUp: -size, ArrowDown: size, ArrowLeft: -1, ArrowRight: 1 };
      if (arrows[event.key]) {
        event.preventDefault();
        let next = Math.max(0, Math.min(state.board.length - 1, state.focusedIndex + arrows[event.key]));
        if (event.key === 'ArrowLeft' && state.focusedIndex % size === 0) next = state.focusedIndex;
        if (event.key === 'ArrowRight' && state.focusedIndex % size === size - 1) next = state.focusedIndex;
        if (state.status === 'placingItem') {
          const point = UB.Board.rowCol(next, size);
          next = UB.Board.toIndex(Math.max(1, Math.min(size - 2, point.row)), Math.max(1, Math.min(size - 2, point.col)), size);
        }
        state.focusedIndex = next; UB.UI.renderBoard(); UB.UI.focusBoardCell(next); return;
      }
      if ((event.key === 'Enter' || event.key === ' ') && document.activeElement && document.activeElement.classList.contains('cell')) {
        event.preventDefault(); UB.Game.selectCell(state.focusedIndex);
      }
    });
  }

  function setupDebug() {
    const panel = document.querySelector('#debug-panel');
    if (new URLSearchParams(window.location.search).get('debug') !== 'true') return;
    panel.hidden = false;
    const specialSelect = document.querySelector('#debug-special');
    Object.values(UB.DERIVED_UNITS).forEach(function (unit) {
      const option = document.createElement('option'); option.value = unit.symbol; option.textContent = unit.nameKo + ' (' + unit.symbol + ')'; specialSelect.appendChild(option);
    });
    panel.addEventListener('click', async function (event) {
      const action = event.target.dataset.debug; if (!action) return;
      const state = UB.Game.state;
      if (action === 'time') state.remainingTime = Math.max(0, Number(document.querySelector('#debug-time').value) || 0);
      if (action === 'add') {
        const empty = state.board.findIndex(function (block) { return !block; });
        const target = empty >= 0 ? empty : state.focusedIndex;
        state.board[target] = UB.Board.createBaseBlock(document.querySelector('#debug-unit').value);
      }
      if (action === 'special') {
        const unit = Object.values(UB.DERIVED_UNITS).find(function (item) { return item.symbol === specialSelect.value; });
        let target = state.board.findIndex(function (block) { return !block; }); if (target < 0) target = 112;
        state.board[target] = UB.Board.createSpecialBlock(unit); UB.UI.renderAll();
      }
      if (action === 'reset') { state.board = UB.Board.generateBoard(); state.removedBlocks = 0; UB.Game.clearSelection(true); }
      if (action === 'clear') { state.board = state.board.map(function () { return null; }); UB.UI.renderAll(); }
      if (action === 'gravity') await UB.Abilities.settle();
      if (action === 'shuffle') UB.Game.shuffle(true);
      if (action === 'chain') {
        const joule = UB.DERIVED_UNITS.J;
        const size = state.boardSize;
        const specialIndex = UB.Board.toIndex(Math.floor(size / 2), 0, size);
        const materialColumns = [size - 4, size - 3, size - 2, size - 1];
        const materialRows = [0, Math.floor((size - 1) / 3), Math.ceil((size - 1) * 2 / 3), size - 1];
        const materialUnits = ['kg', 'm', 's', 's'];
        state.board = Array(size * size).fill(null);
        materialUnits.forEach(function (symbol, order) {
          state.board[UB.Board.toIndex(materialRows[order], materialColumns[order], size)] = UB.Board.createBaseBlock(symbol);
        });
        const special = UB.Board.createSpecialBlock(joule);
        state.board[specialIndex] = special;
        state.status = 'animating'; state.isAnimating = true; UB.UI.renderAll();
        UB.Game.recordCraft(joule, 5);
        await UB.Abilities.activateSpecial(special.id, 1, new Set());
        state.status = 'playing'; state.isAnimating = false;
      }
      if (action === 'win') UB.Game.win();
      if (action === 'lose') UB.Game.lose();
      UB.UI.renderAll();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    UB.UI.cache(); bindEvents(); setupDebug(); UB.UI.showMenu();
    if (!localStorage.getItem('unitBreakerTutorialSeen')) window.setTimeout(function () { UB.UI.showTutorial(0); }, 450);
  });
})(window.UnitBreaker = window.UnitBreaker || {});

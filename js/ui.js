(function (UB) {
  'use strict';

  const $ = function (selector) { return document.querySelector(selector); };
  const refs = {};
  let modalResumeState = null;
  let toastTimer = null;

  function cache() {
    refs.menu = $('#menu-screen'); refs.game = $('#game-screen'); refs.board = $('#board'); refs.boardWrap = $('#board-wrap');
    refs.pathLayer = $('#path-layer'); refs.timer = $('#timer'); refs.timerLabel = $('#timer-label'); refs.timerCard = $('#timer-card'); refs.remaining = $('#remaining-count');
    refs.score = $('#score'); refs.maxChain = $('#max-chain'); refs.initialCount = $('#initial-count'); refs.hintCount = $('#hint-count'); refs.hintButton = $('#hint-button');
    refs.shuffleButton = $('#shuffle-button'); refs.materials = $('#material-list'); refs.numerator = $('#numerator-display');
    refs.denominator = $('#denominator-display'); refs.dimension = $('#dimension-expression'); refs.vector = $('#dimension-vector');
    refs.result = $('#result-preview'); refs.resultSymbol = $('#result-symbol'); refs.resultQuantity = $('#result-quantity');
    refs.resultName = $('#result-name'); refs.resultDescription = $('#result-description'); refs.craftButton = $('#craft-button');
    refs.selectionCount = $('#selection-count'); refs.composerHelp = $('#composer-help'); refs.modalRoot = $('#modal-root');
    refs.toast = $('#toast'); refs.countdown = $('#countdown-flash'); refs.pauseButton = $('#pause-button'); refs.debug = $('#debug-panel');
    refs.abilityOverlay = $('#ability-overlay');
    refs.bonusItemButton = $('#bonus-item-button'); refs.bonusItemCount = $('#bonus-item-count'); refs.bonusProgress = $('#bonus-progress');
    refs.shuffleCost = $('#shuffle-cost');
  }

  function showGame() { refs.menu.classList.remove('active'); refs.game.classList.add('active'); }
  function showMenu() { refs.game.classList.remove('active'); refs.menu.classList.add('active'); }

  function syncGameState() {
    if (!refs.game) return;
    refs.game.dataset.status = UB.Game.state.status;
    refs.pauseButton.textContent = UB.Game.state.isPaused ? '▶' : 'Ⅱ';
    refs.pauseButton.setAttribute('aria-label', UB.Game.state.isPaused ? '게임 계속하기' : '일시정지');
  }

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
    const rest = (seconds % 60).toString().padStart(2, '0');
    return minutes + ':' + rest;
  }

  function updateStatus() {
    const state = UB.Game.state;
    const timed = !state.unlimitedMode;
    refs.timer.textContent = timed ? formatTime(state.remainingTime) : '∞';
    refs.timerLabel.textContent = timed ? '남은 시간' : '시간 제한';
    refs.timerCard.classList.toggle('warning', timed && state.remainingTime <= 30);
    refs.timerCard.classList.toggle('critical', timed && state.remainingTime <= 10);
    refs.remaining.textContent = UB.Board.baseCount(state.board);
    refs.initialCount.textContent = state.initialBlockCount;
    refs.score.textContent = state.score.toLocaleString('ko-KR');
    refs.maxChain.textContent = state.maxChainCount;
    refs.hintCount.textContent = state.hintsRemaining;
    refs.hintButton.disabled = state.hintsRemaining <= 0 || state.status !== 'playing';
    const distinctCrafts = state.bonusUnitTypes.length;
    refs.bonusItemCount.textContent = state.bonusItems;
    refs.bonusProgress.textContent = distinctCrafts + ' / ' + state.nextBonusThreshold;
    refs.bonusItemButton.disabled = state.bonusItems <= 0 || state.status !== 'playing';
    refs.bonusItemButton.title = '현재 목록 ' + (state.bonusUnitTypes.length ? state.bonusUnitTypes.join(', ') : '비어 있음') + ' · 다음 폭탄 ' + state.nextBonusThreshold + '종';
    refs.shuffleCost.textContent = state.unlimitedMode ? '무료' : '−10s';
  }

  function blockLabel(block, index) {
    const point = UB.Board.rowCol(index, UB.Game.state.boardSize);
    if (!block) return (point.row + 1) + '행 ' + (point.col + 1) + '열, 빈칸';
    if (block.type === 'special') return block.unit + ' 특수 유도단위';
    const base = UB.BASE_UNITS[block.unit];
    return base.unitName + ', ' + base.quantity + ', ' + (point.row + 1) + '행 ' + (point.col + 1) + '열';
  }

  function renderBoard() {
    const state = UB.Game.state;
    const size = state.boardSize || UB.BOARD_SIZE;
    refs.board.dataset.size = size;
    refs.board.style.gridTemplateColumns = 'repeat(' + size + ', minmax(0, 1fr))';
    refs.board.style.gridTemplateRows = 'repeat(' + size + ', minmax(0, 1fr))';
    refs.board.setAttribute('aria-rowcount', size);
    refs.board.setAttribute('aria-colcount', size);
    refs.board.setAttribute('aria-label', size + ' 곱하기 ' + size + ' SI 기본단위 보드');
    const selectedOrder = new Map(state.selectedCells.map(function (cell, order) { return [cell, order + 1]; }));
    const candidates = new Set(state.placementCandidates);
    const hints = new Set(state.hintPath);
    const abilityPath = new Set(state.abilityPath);
    const affected = new Set(state.lastAffected);
    const pushMotion = new Set(state.pushMotion || []);
    const rotationMotion = new Set(state.rotationMotion || []);
    const now = Date.now();
    const fragment = document.createDocumentFragment();
    state.board.forEach(function (block, index) {
      const button = document.createElement('button');
      const validItemTarget = state.status === 'placingItem' && UB.Game.isBonusTarget(index);
      button.type = 'button'; button.className = 'cell'; button.dataset.index = index; button.setAttribute('role', 'gridcell');
      button.setAttribute('aria-label', blockLabel(block, index));
      button.tabIndex = index === state.focusedIndex ? 0 : -1;
      if (!block) {
        button.classList.add('is-empty');
        button.disabled = !document.body.classList.contains('targeting');
      } else {
        button.dataset.blockId = block.id;
        button.dataset.unit = block.unit;
        button.classList.add(block.type === 'special' ? 'is-special' : 'unit-' + block.unit);
        button.title = block.type === 'base' ? UB.BASE_UNITS[block.unit].unitName + ' · ' + UB.BASE_UNITS[block.unit].quantity : block.unit + ' 특수 유도단위';
        const symbol = document.createElement('span'); symbol.className = 'cell-symbol'; symbol.textContent = block.unit; button.appendChild(symbol);
        if (block.bonus && block.revealed) { const bonus = document.createElement('i'); bonus.className = 'bonus-mark'; bonus.textContent = '✦'; button.appendChild(bonus); }
        if (block.removing) button.classList.add('is-removing');
        if (block.litUntil > now) {
          const litStartedAt = block.litStartedAt || now;
          button.classList.add('is-lit');
          button.style.setProperty('--lit-duration', Math.max(1, block.litUntil - litStartedAt) + 'ms');
          button.style.setProperty('--lit-delay', '-' + Math.max(0, now - litStartedAt) + 'ms');
        }
      }
      if (selectedOrder.has(index)) {
        button.classList.add('is-selected');
        const order = document.createElement('b'); order.className = 'selection-order'; order.textContent = selectedOrder.get(index); button.appendChild(order);
        if (block && state.assignments[block.id]) button.classList.add('role-' + state.assignments[block.id]);
      }
      if (candidates.has(index)) button.classList.add('is-candidate');
      if (hints.has(index)) button.classList.add('is-hint');
      if (abilityPath.has(index)) button.classList.add('in-ability-path');
      if (affected.has(index)) button.classList.add('is-affected');
      if (pushMotion.has(index)) button.classList.add('is-pushing', 'push-' + (state.pushDirection || 'up'));
      if (rotationMotion.has(index)) button.classList.add('is-rotating');
      if (state.status === 'placingItem') {
        button.disabled = !validItemTarget;
        button.classList.add(validItemTarget ? 'is-item-candidate' : 'is-item-unavailable');
      }
      fragment.appendChild(button);
    });
    refs.board.replaceChildren(fragment);
    if (state.gravityMovements && state.gravityMovements.length) {
      const cellsById = new Map();
      refs.board.querySelectorAll('.cell[data-block-id]').forEach(function (cell) { cellsById.set(cell.dataset.blockId, cell); });
      const gap = parseFloat(window.getComputedStyle(refs.board).rowGap) || 0;
      state.gravityMovements.forEach(function (movement) {
        const cell = cellsById.get(movement.id);
        if (!cell) return;
        const distance = (cell.offsetHeight + gap) * movement.rows;
        cell.style.setProperty('--fall-distance', '-' + distance + 'px');
        cell.style.setProperty('--fall-duration', Math.min(620, 260 + movement.rows * 45) + 'ms');
        cell.classList.add('is-settling');
      });
    }
    if (state.attractMovements && state.attractMovements.length) {
      const cellsById = new Map();
      refs.board.querySelectorAll('.cell[data-block-id]').forEach(function (cell) { cellsById.set(cell.dataset.blockId, cell); });
      const boardStyle = window.getComputedStyle(refs.board);
      const rowGap = parseFloat(boardStyle.rowGap) || 0;
      const columnGap = parseFloat(boardStyle.columnGap) || 0;
      state.attractMovements.forEach(function (movement) {
        const cell = cellsById.get(movement.id);
        if (!cell) return;
        const from = UB.Board.rowCol(movement.fromIndex, state.boardSize);
        const to = UB.Board.rowCol(movement.toIndex, state.boardSize);
        const offsetX = (from.col - to.col) * (cell.offsetWidth + columnGap);
        const offsetY = (from.row - to.row) * (cell.offsetHeight + rowGap);
        cell.style.setProperty('--attract-x', offsetX + 'px');
        cell.style.setProperty('--attract-y', offsetY + 'px');
        cell.style.setProperty('--attract-duration', Math.min(900, 500 + movement.distance * 45) + 'ms');
        cell.classList.add('is-attracting');
        if (movement.kind === 'displaced') cell.classList.add('is-displaced');
      });
    }
    drawSelectionPath();
  }

  function drawSelectionPath() {
    window.requestAnimationFrame(function () {
      const selected = UB.Game.state.selectedCells;
      const rect = refs.board.getBoundingClientRect();
      refs.pathLayer.setAttribute('viewBox', '0 0 ' + rect.width + ' ' + rect.height);
      refs.pathLayer.replaceChildren();
      if (selected.length < 2) return;
      const points = selected.map(function (index) {
        const cell = refs.board.querySelector('[data-index="' + index + '"]');
        if (!cell) return null;
        const box = cell.getBoundingClientRect();
        return (box.left - rect.left + box.width / 2) + ',' + (box.top - rect.top + box.height / 2);
      }).filter(Boolean).join(' ');
      const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline.setAttribute('points', points); polyline.setAttribute('class', 'selection-path'); refs.pathLayer.appendChild(polyline);
    });
  }

  function materialChip(item, order) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'material-chip';
    button.dataset.blockId = item.id; button.dataset.role = item.role || 'none';
    button.setAttribute('aria-label', item.unit + ', 현재 ' + (item.role === 'numerator' ? '분자' : item.role === 'denominator' ? '분모' : '미지정') + ', 역할 변경');
    button.innerHTML = '<small>' + (order + 1) + '</small><b>' + item.unit + '</b><span>' + (item.role === 'numerator' ? '분자' : item.role === 'denominator' ? '분모' : '지정') + '</span>';
    return button;
  }

  function renderComposer() {
    const state = UB.Game.state;
    const assignments = UB.Game.getAssignments();
    refs.selectionCount.textContent = assignments.length + ' 선택';
    if (!assignments.length) {
      refs.materials.className = 'material-list empty-state'; refs.materials.innerHTML = '<span>보드에서 연결된 블록을 선택하세요</span>';
    } else {
      refs.materials.className = 'material-list'; refs.materials.replaceChildren();
      assignments.forEach(function (item, order) { refs.materials.appendChild(materialChip(item, order)); });
    }
    const numeratorUnits = assignments.filter(function (item) { return item.role === 'numerator'; }).map(function (item) { return item.unit; });
    const denominatorUnits = assignments.filter(function (item) { return item.role === 'denominator'; }).map(function (item) { return item.unit; });
    refs.numerator.textContent = numeratorUnits.length ? UB.UnitSystem.formatProduct(numeratorUnits.reduce(function (c, u) { c[u] = (c[u] || 0) + 1; return c; }, {})) : '—';
    refs.denominator.textContent = denominatorUnits.length ? UB.UnitSystem.formatProduct(denominatorUnits.reduce(function (c, u) { c[u] = (c[u] || 0) + 1; return c; }, {})) : '—';
    const matchingUnits = UB.UnitSystem.findMatchingUnits(assignments);
    const unit = matchingUnits[0] || null;
    const vector = unit && unit.gameCost ? unit.dimension : UB.UnitSystem.calculateDimension(assignments);
    refs.dimension.textContent = unit && unit.gameCost ? 'cd  ·  제작 비용 cd×3' : UB.UnitSystem.formatAssignments(assignments);
    refs.vector.textContent = '[' + vector.join(', ') + ']';
    const allAssigned = assignments.length > 0 && assignments.every(function (item) { return item.role; });
    if (unit) {
      refs.result.className = 'result-preview is-valid' + (matchingUnits.length > 1 ? ' is-multiple' : ''); refs.resultSymbol.textContent = matchingUnits.map(function (candidate) { return candidate.symbol; }).join(' / ');
      refs.resultQuantity.textContent = matchingUnits.length > 1 ? '제작 결과 ' + matchingUnits.length + '개 중 선택' : unit.quantity;
      refs.resultName.textContent = matchingUnits.length > 1 ? matchingUnits.map(function (candidate) { return candidate.nameKo; }).join(' · ') : unit.nameKo + ' · ' + unit.nameEn;
      refs.resultDescription.textContent = matchingUnits.length > 1 ? '같은 SI 차원식을 쓰는 단위입니다. 제작 버튼을 누른 뒤 원하는 단위를 고르세요.' : unit.description + (unit.scienceNote ? ' ' + unit.scienceNote : '');
      refs.craftButton.disabled = state.status !== 'playing' || state.timeExpired;
      refs.composerHelp.textContent = state.status === 'placing' ? '보드의 강조된 후보 위치 중 하나를 선택하세요.' : '정확한 차원식입니다. 제작할 수 있습니다.';
    } else {
      refs.result.className = 'result-preview ' + (allAssigned ? 'is-invalid' : 'is-empty'); refs.resultSymbol.textContent = allAssigned ? '×' : '?';
      refs.resultQuantity.textContent = allAssigned ? '등록되지 않은 차원식' : '예상 결과';
      refs.resultName.textContent = allAssigned ? UB.UnitSystem.formatAssignments(assignments) : '재료의 역할을 지정하세요';
      refs.resultDescription.textContent = allAssigned ? '현재 조합과 정확히 일치하는 특수 유도단위가 없습니다. 재료와 분자·분모를 확인하세요.' : '선택한 재료를 눌러 분자와 분모에 배치하면 차원식이 계산됩니다.';
      refs.craftButton.disabled = true;
      refs.composerHelp.textContent = assignments.length ? '모든 재료를 분자 또는 분모에 지정하세요.' : '8방향으로 인접한 블록을 이어 선택하세요.';
    }
    if (state.status === 'placing') refs.craftButton.disabled = true;
  }

  function renderAll() { renderBoard(); renderComposer(); updateStatus(); syncGameState(); }

  function toast(message) {
    window.clearTimeout(toastTimer); refs.toast.textContent = message; refs.toast.classList.add('show');
    toastTimer = window.setTimeout(function () { refs.toast.classList.remove('show'); }, 3200);
  }

  function flashCountdown(number) {
    refs.countdown.textContent = number; refs.countdown.classList.remove('flash'); void refs.countdown.offsetWidth; refs.countdown.classList.add('flash');
  }

  function setShuffleAvailable(available) { refs.shuffleButton.disabled = !available; refs.shuffleButton.classList.toggle('is-ready', available); }

  function setTargeting(active, message) {
    document.body.classList.toggle('targeting', active);
    refs.boardWrap.classList.toggle('is-targeting', active);
    if (message) toast(message);
    renderBoard();
  }

  function showAbilityBanner(symbol, chain) {
    const unit = Object.values(UB.DERIVED_UNITS).find(function (candidate) { return candidate.symbol === symbol; });
    const banner = document.createElement('div'); banner.className = 'ability-banner';
    banner.innerHTML = '<small>' + (chain > 1 ? chain + ' CHAIN' : 'ABILITY ACTIVE') + '</small><strong>' + symbol + '</strong><span>' + (unit ? unit.nameKo : '') + '</span>';
    refs.boardWrap.appendChild(banner);
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = chain > 1 ? 1300 : 950;
    window.setTimeout(function () { banner.remove(); }, reduceMotion ? Math.min(duration, 100) : duration);
  }

  function playTelegraph(index, options, duration) {
    const config = options || {};
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const actualDuration = reduceMotion ? Math.min(duration || 800, 100) : (duration || 800);
    const cell = refs.board.querySelector('[data-index="' + index + '"]');
    if (!cell) return Promise.resolve();
    const directionArrows = { up: '↑', right: '→', down: '↓', left: '←', row: '↔', col: '↕' };
    const effect = document.createElement('div');
    effect.className = 'effect-telegraph telegraph-' + (config.kind || 'charge') + (config.direction ? ' direction-' + config.direction : '');
    effect.style.left = (refs.board.offsetLeft + cell.offsetLeft + cell.offsetWidth / 2) + 'px';
    effect.style.top = (refs.board.offsetTop + cell.offsetTop + cell.offsetHeight / 2) + 'px';
    effect.style.setProperty('--telegraph-duration', actualDuration + 'ms');
    effect.style.setProperty('--telegraph-cell', Math.max(cell.offsetWidth, cell.offsetHeight) + 'px');
    effect.innerHTML = '<span class="telegraph-core">' + (config.symbol || '•') + '</span>' +
      (config.direction ? '<i class="telegraph-arrow">' + (directionArrows[config.direction] || '→') + '</i>' : '') +
      '<small>' + (config.label || '능력 충전') + '</small>';
    refs.abilityOverlay.appendChild(effect);
    return new Promise(function (resolve) {
      window.setTimeout(function () { effect.remove(); resolve(); }, actualDuration);
    });
  }

  function openModal(content, options) {
    const config = options || {};
    refs.modalRoot.innerHTML = '<div class="modal-backdrop"></div><section class="modal-card ' + (config.className || '') + '" role="dialog" aria-modal="true" aria-label="' + (config.label || '대화상자') + '">' + content + '</section>';
    refs.modalRoot.classList.add('open');
    const focusable = refs.modalRoot.querySelector('button, [href], input'); if (focusable) focusable.focus();
  }

  function closeModal() { refs.modalRoot.classList.remove('open'); refs.modalRoot.replaceChildren(); }

  function requestChoice(title, options) {
    return new Promise(function (resolve) {
      const hasDescriptions = options.some(function (option) { return Boolean(option.description); });
      const buttons = options.map(function (option) {
        const content = option.description ? '<strong>' + option.label + '</strong>' + (option.subtitle ? '<em>' + option.subtitle + '</em>' : '') + '<small><b>능력</b> ' + option.description + '</small>' : '<span>' + option.label + '</span>';
        return '<button type="button" data-choice="' + option.value + '">' + content + '</button>';
      }).join('');
      openModal('<p class="eyebrow">ABILITY PARAMETER</p><h2>' + title + '</h2><div class="choice-grid' + (hasDescriptions ? ' has-descriptions' : '') + '">' + buttons + '</div>', { className: 'choice-modal', label: title });
      refs.modalRoot.querySelectorAll('[data-choice]').forEach(function (button) {
        button.addEventListener('click', function () { const value = button.dataset.choice; closeModal(); resolve(value); });
      });
    });
  }

  function codexCards() {
    return Object.values(UB.DERIVED_UNITS).map(function (unit) {
      const materials = UB.UnitSystem.recipeMaterials(unit);
      const extraId = 'codex-extra-' + unit.id;
      const craftCount = (UB.Game.state.craftedUnits || []).filter(function (symbol) { return symbol === unit.symbol; }).length;
      return '<article class="codex-card"><div class="codex-symbol">' + unit.symbol + '</div><div class="codex-card-body"><small>' + unit.quantity + '</small><h3>' + unit.nameKo + ' <em>' + unit.nameEn + '</em></h3><code>' + UB.UnitSystem.formatAssignments(materials) + '</code><p class="codex-materials"><b>재료</b> ' + UB.UnitSystem.formatAssignments(materials, 'fraction') + '</p><div class="codex-extra" id="' + extraId + '"><p>' + unit.description + '</p><p class="real-use">실제 사용 · ' + unit.realUse + '</p>' + (unit.scienceNote ? '<p class="science-warning">' + unit.scienceNote + '</p>' : '') + '</div><span class="codex-count">이번 실험 제작 ' + craftCount + '회</span><button class="codex-extra-toggle" type="button" data-codex-toggle aria-controls="' + extraId + '" aria-expanded="false"><span>능력·설명 보기</span><i aria-hidden="true">＋</i></button></div></article>';
    }).join('');
  }

  function showCodex() {
    const pausable = ['playing', 'placing', 'placingItem'].indexOf(UB.Game.state.status) >= 0;
    modalResumeState = pausable ? UB.Game.state.status : null;
    if (pausable) { UB.Game.state.isPaused = true; UB.Game.setStatus('paused'); }
    openModal('<header class="modal-header"><div><p class="eyebrow">SI UNIT ARCHIVE</p><h2>유도단위 도감</h2></div><button class="modal-close" type="button" data-close aria-label="도감 닫기">×</button></header><p class="modal-intro">각 특수 능력은 해당 SI 단위가 나타내는 물리적 의미를 퍼즐 규칙으로 재해석한 게임적 표현입니다.</p><div class="codex-grid">' + codexCards() + '</div>', { className: 'codex-modal', label: '유도단위 도감' });
    refs.modalRoot.querySelector('[data-close]').addEventListener('click', closeInformationalModal);
    refs.modalRoot.querySelectorAll('[data-codex-toggle]').forEach(function (button) {
      button.addEventListener('click', function () {
        const expanded = button.getAttribute('aria-expanded') === 'true';
        const extra = refs.modalRoot.querySelector('#' + button.getAttribute('aria-controls'));
        button.setAttribute('aria-expanded', String(!expanded));
        button.querySelector('span').textContent = expanded ? '능력·설명 보기' : '능력·설명 닫기';
        if (extra) extra.classList.toggle('is-open', !expanded);
      });
    });
  }

  function showKeyboardHelp() {
    const pausable = ['playing', 'placing', 'placingItem'].indexOf(UB.Game.state.status) >= 0;
    modalResumeState = pausable ? UB.Game.state.status : null;
    if (pausable) { UB.Game.state.isPaused = true; UB.Game.setStatus('paused'); }
    const shortcuts = [
      ['↑ ↓ ← →', '보드 포커스 이동'],
      ['Enter / Space', '블록 선택'],
      ['Backspace', '마지막 선택 취소'],
      ['Esc', '전체 선택 취소'],
      ['H', '힌트 사용'],
      ['R', '조합 초기화'],
      ['P', '일시정지 / 계속하기']
    ];
    openModal('<header class="modal-header"><div><p class="eyebrow">KEYBOARD CONTROLS</p><h2>키보드 조작법</h2></div><button class="modal-close" type="button" data-close aria-label="키보드 조작법 닫기">×</button></header><p class="modal-intro">보드의 블록에 포커스를 맞춘 뒤 아래 단축키로 게임을 조작할 수 있습니다.</p><div class="shortcut-grid">' + shortcuts.map(function (shortcut) { return '<div><kbd>' + shortcut[0] + '</kbd><span>' + shortcut[1] + '</span></div>'; }).join('') + '</div>', { className: 'keyboard-help-modal', label: '키보드 조작법' });
    refs.modalRoot.querySelector('[data-close]').addEventListener('click', closeInformationalModal);
  }

  const TUTORIAL_STEPS = [
    ['기본단위 블록', 'kg, m, s, A, K, mol, cd의 7가지 SI 기본단위가 보드를 구성합니다.', 'kg  m  s  A  K  mol  cd'],
    ['연결 경로 선택', '직전에 고른 블록과 인접한 칸을 이어 선택하세요. 대각선도 연결됩니다.', '① ─ ② ↘ ③'],
    ['분자와 분모', '선택한 재료를 눌러 분자 → 분모 → 미지정 순서로 역할을 바꾸고 차원식을 완성하세요.', 'kg·m  /  s²'],
    ['유도단위 제작', '예를 들어 kg·m·s⁻²을 완성하면 힘의 단위 뉴턴(N)을 제작할 수 있습니다. 뉴턴은 제작 가능한 여러 유도단위 중 하나의 예시입니다.', '예시 · kg·m·s⁻²  →  N'],
    ['이동 연쇄', '능력으로 움직인 블록이 새로운 유도단위 경로를 만들면 자동 제작되어 연쇄가 이어집니다. N/Pa와 Ω/S는 50:50으로 결정되며 Hz, Bq, Gy, Sv는 자동 연쇄에서 제외됩니다.', 'MOVE  →  AUTO UNIT  →  CHAIN'],
    ['무제한 모드', '메인 메뉴에서 무제한 모드를 켜면 시간 제한과 셔플 시간 페널티 없이 플레이합니다. 보드 크기와 힌트 수는 선택한 난이도를 그대로 따릅니다.', '∞  ·  셔플 무료'],
    ['반응 폭탄', '현재 목록에서 서로 다른 특수 단위를 3종, 5종, 9종… 제작할 때마다 반응 폭탄을 획득합니다. 폭탄을 획득하면 목록이 초기화되어 이전 단위도 다음 단계에서 다시 세어집니다. 같은 단계 안의 중복은 한 번만 세며, 가장자리를 제외한 강조 칸을 중심으로 고르면 3×3 영역이 폭발합니다.', '3종  →  ✦  →  3×3'],
    ['실험 목표', '유도단위 능력과 반응 폭탄으로 선택한 난이도의 모든 기본단위 블록을 제거하면 승리합니다.', 'ALL BLOCKS  →  0']
  ];

  function tutorialContent(step) {
    const data = TUTORIAL_STEPS[step] || TUTORIAL_STEPS[0];
    const lastStep = TUTORIAL_STEPS.length - 1;
    return '<div class="tutorial-slide"><p class="eyebrow">TUTORIAL · ' + (step + 1) + ' / ' + TUTORIAL_STEPS.length + '</p><div class="tutorial-visual"><span>' + data[2] + '</span></div><h2>' + data[0] + '</h2><p>' + data[1] + '</p><div class="tutorial-dots">' + TUTORIAL_STEPS.map(function (_, i) { return '<i class="' + (i === step ? 'active' : '') + '"></i>'; }).join('') + '</div><div class="tutorial-actions"><button type="button" data-tutorial="prev"' + (step === 0 ? ' disabled' : '') + '>← 이전</button><button type="button" data-tutorial="skip">닫기</button><button class="primary-button" type="button" data-tutorial="next">' + (step === lastStep ? '실험실로' : '다음') + ' →</button></div></div>';
  }

  function showTutorial(startStep) {
    const pausable = ['playing', 'placing', 'placingItem'].indexOf(UB.Game.state.status) >= 0;
    modalResumeState = pausable ? UB.Game.state.status : null;
    if (pausable) { UB.Game.state.isPaused = true; UB.Game.setStatus('paused'); }
    let step = startStep || 0;
    let transitionTimer = null;
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function finishTutorial() {
      window.clearTimeout(transitionTimer);
      localStorage.setItem('unitBreakerTutorialSeen', '1');
      closeInformationalModal();
    }

    function bindTutorialActions(card) {
      card.querySelector('[data-tutorial="skip"]').addEventListener('click', finishTutorial);
      card.querySelector('[data-tutorial="prev"]').addEventListener('click', function (event) {
        if (step <= 0) return;
        event.currentTarget.disabled = true;
        step -= 1;
        render(true);
      });
      card.querySelector('[data-tutorial="next"]').addEventListener('click', function (event) {
        if (step >= TUTORIAL_STEPS.length - 1) { finishTutorial(); return; }
        event.currentTarget.disabled = true;
        step += 1;
        render(true);
      });
    }

    function replaceSlide(card) {
      card.innerHTML = tutorialContent(step);
      const incoming = card.querySelector('.tutorial-slide');
      bindTutorialActions(card);
      if (reduceMotion) return;
      incoming.classList.add('is-entering');
      void incoming.offsetWidth;
      window.requestAnimationFrame(function () { incoming.classList.remove('is-entering'); });
    }

    function render(animate) {
      const card = refs.modalRoot.querySelector('.tutorial-modal');
      if (!card) {
        openModal(tutorialContent(step), { className: 'tutorial-modal', label: '게임 튜토리얼' });
        bindTutorialActions(refs.modalRoot.querySelector('.tutorial-modal'));
        return;
      }
      const outgoing = card.querySelector('.tutorial-slide');
      if (!animate || reduceMotion || !outgoing) { replaceSlide(card); return; }
      outgoing.classList.add('is-leaving');
      window.clearTimeout(transitionTimer);
      transitionTimer = window.setTimeout(function () { replaceSlide(card); }, 200);
    }
    render(false);
  }

  function closeInformationalModal() {
    closeModal();
    if (modalResumeState) { UB.Game.state.isPaused = false; UB.Game.setStatus(modalResumeState); }
    modalResumeState = null;
  }

  function showPause() {
    openModal('<p class="eyebrow">EXPERIMENT PAUSED</p><h2>실험 일시정지</h2><p>타이머도 함께 멈췄습니다.</p><div class="pause-actions"><button class="primary-button" type="button" data-resume>계속하기</button><button type="button" data-menu>메뉴로</button></div>', { className: 'pause-modal', label: '일시정지 메뉴' });
    refs.modalRoot.querySelector('[data-resume]').addEventListener('click', function () { UB.Game.togglePause(); });
    refs.modalRoot.querySelector('[data-menu]').addEventListener('click', function () { UB.Game.backToMenu(); });
  }

  function mostUsed(items) {
    if (!items.length) return '없음';
    const counts = items.reduce(function (map, item) { map[item] = (map[item] || 0) + 1; return map; }, {});
    return Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
  }

  function showResult(won) {
    const state = UB.Game.state; const remaining = UB.Board.baseCount(state.board);
    const stars = state.unlimitedMode ? 3 : state.remainingTime >= 90 ? 3 : state.remainingTime >= 30 ? 2 : state.remainingTime > 0 ? 1 : 0;
    const timeLabel = state.unlimitedMode ? '무제한' : formatTime(state.remainingTime);
    const title = won ? '보드 정리 완료' : '시간 초과';
    const statHtml = '<div class="result-stats"><div><small>남은 시간</small><b>' + timeLabel + '</b></div><div><small>최종 점수</small><b>' + state.score.toLocaleString('ko-KR') + '</b></div><div><small>제거한 블록</small><b>' + state.removedBlocks + '</b></div><div><small>남은 블록</small><b>' + remaining + '</b></div><div><small>제작 단위</small><b>' + state.craftedUnits.length + '</b></div><div><small>최고 연쇄</small><b>' + state.maxChainCount + '</b></div></div>';
    openModal('<p class="eyebrow">' + (won ? 'EXPERIMENT COMPLETE' : 'EXPERIMENT FAILED') + '</p><div class="result-emblem ' + (won ? 'won' : 'lost') + '">' + (won ? '✓' : '!') + '</div><h2>' + title + '</h2>' + (won ? '<div class="stars" aria-label="별 ' + stars + '개">' + [0,1,2].map(function (i) { return '<span class="' + (i < stars ? 'on' : '') + '">★</span>'; }).join('') + '</div>' : '<p>제거율 ' + Math.round((state.initialBlockCount - remaining) / state.initialBlockCount * 100) + '% · 가장 많이 사용한 단위 ' + mostUsed(state.craftedUnits) + '</p>') + statHtml + '<div class="result-actions"><button class="primary-button" type="button" data-restart>다시 시작</button><button type="button" data-menu>난이도 선택</button></div>', { className: 'game-result-modal', label: title });
    refs.modalRoot.querySelector('[data-restart]').addEventListener('click', function () { closeModal(); UB.Game.restart(); });
    refs.modalRoot.querySelector('[data-menu]').addEventListener('click', function () { UB.Game.backToMenu(); });
  }

  function focusBoardCell(index) {
    const cell = refs.board.querySelector('[data-index="' + index + '"]'); if (cell) cell.focus();
  }

  UB.UI = {
    cache: cache, closeModal: closeModal, drawSelectionPath: drawSelectionPath, flashCountdown: flashCountdown,
    focusBoardCell: focusBoardCell, renderAll: renderAll, renderBoard: renderBoard, renderComposer: renderComposer,
    playTelegraph: playTelegraph, requestChoice: requestChoice, setShuffleAvailable: setShuffleAvailable, setTargeting: setTargeting,
    showAbilityBanner: showAbilityBanner, showCodex: showCodex, showGame: showGame, showMenu: showMenu,
    showKeyboardHelp: showKeyboardHelp, showPause: showPause, showResult: showResult, showTutorial: showTutorial, syncGameState: syncGameState,
    toast: toast, updateStatus: updateStatus
  };
})(window.UnitBreaker = window.UnitBreaker || {});

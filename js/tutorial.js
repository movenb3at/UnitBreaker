(function (UB) {
  'use strict';

  const NEWTON_PATH = [17, 11, 5, 1];
  let active = false;
  let offering = false;
  let stepIndex = 0;
  let actionIndex = 0;
  let positionTimer = null;
  let positionFrame = null;
  let transitionTimer = null;
  let transitionToken = 0;
  let transitioning = false;
  let waitTimer = null;
  let resizeBound = false;
  let reviewing = false;
  let reviewReturn = null;
  let codexCollapsed = false;
  let codexReadComplete = false;
  let exitConfirmOpen = false;
  let exitUnlockTimer = null;
  let targetNeighborhood = { previous: null, current: null, next: null };
  let refs = {};

  function base(symbol) { return UB.Board.createBaseBlock(symbol); }

  function newtonBoard() {
    const board = Array(25).fill(null);
    board[17] = base('kg'); board[11] = base('m'); board[5] = base('s'); board[1] = base('s');
    board[7] = base('A'); board[23] = base('s');
    board[22] = base('K'); board[20] = base('mol'); board[24] = base('cd');
    return board;
  }

  function filledBoard() { return Array.from({ length: 25 }, function () { return base('K'); }); }

  function cell(index) { return '#board .cell[data-index="' + index + '"]'; }
  function chip(order) { return '#material-list .material-chip:nth-child(' + order + ')'; }
  function state() { return UB.Game.state; }
  function role(order, value) {
    const element = document.querySelector(chip(order));
    return element && element.dataset.role === value;
  }

  function action(target, label, after, options) {
    return Object.assign({ target: target, label: label, after: after || function () { return true; } }, options || {});
  }

  function assignActions() {
    return [
      action(chip(1), 'kg를 한 번 눌러 분자로 지정하세요.', function () { return role(1, 'numerator'); }),
      action(chip(2), 'm을 한 번 눌러 분자로 지정하세요.', function () { return role(2, 'numerator'); }),
      action(chip(3), '첫 번째 s를 한 번 눌러 분자로 보내세요.', function () { return role(3, 'numerator'); }),
      action(chip(3), '같은 s를 다시 눌러 분모로 보내세요.', function () { return role(3, 'denominator'); }),
      action(chip(4), '두 번째 s를 한 번 눌러 분자로 보내세요.', function () { return role(4, 'numerator'); }),
      action(chip(4), '같은 s를 다시 눌러 분모로 보내세요.', function () { return role(4, 'denominator'); })
    ];
  }

  function selectNewtonActions() {
    return NEWTON_PATH.map(function (index, order) {
      return action(cell(index), (order + 1) + '번째 재료 ' + ['kg', 'm', 's', 's'][order] + '를 선택하세요.', function () {
        return state().selectedCells.length === order + 1;
      });
    });
  }

  function prepareNewton() {
    document.querySelector('#unlimited-mode').checked = true;
    UB.UI.closeModal();
    UB.Game.startTutorialSession(newtonBoard());
  }

  function showNewtonHint() {
    const current = state();
    if (current.status !== 'playing' || current.hintsRemaining <= 0) return;
    current.hintsRemaining -= 1;
    current.hintPath = NEWTON_PATH.slice();
    UB.UI.toast('뉴턴 kg·m / s² 경로를 강조했습니다.');
    UB.UI.renderBoard();
    UB.UI.updateStatus();
  }

  function prepareBomb() {
    state().board = filledBoard(); state().initialBlockCount = 25; state().selectedCells = []; state().assignments = {};
    state().placementCandidates = []; state().pendingUnit = null; state().status = 'playing'; state().isAnimating = false;
    state().itemTargeting = false; state().bonusItems = Math.max(1, state().bonusItems || 0);
    UB.UI.closeModal(); UB.UI.renderAll();
  }

  const steps = [
    { chapter: '1 · 핵심 플레이', title: '연습 시작', body: '시간이 멈춘 5×5 연습 보드에서 유도단위 하나를 직접 만들어 봅니다.', target: '#board-wrap', info: true, onEnter: prepareNewton },
    { chapter: '1 · 핵심 플레이', title: '힌트로 뉴턴 표시', body: '힌트는 현재 보드에서 실제로 제작 가능한 연결 경로를 강조합니다. 먼저 뉴턴(N)의 재료 경로를 확인하세요.', actions: [action('#hint-button', '힌트를 눌러 뉴턴 경로를 표시하세요.', function () { return state().hintsRemaining === 6 && state().hintPath.join(',') === NEWTON_PATH.join(','); }, { intercept: true, run: showNewtonHint })] },
    { chapter: '1 · 핵심 플레이', title: '연결된 재료 선택', body: '필요한 기본단위 블록을 상하좌우 또는 대각선으로 이어 선택합니다. 뉴턴(N)을 만들 kg·m·s·s를 순서대로 고르세요.', actions: selectNewtonActions() },
    { chapter: '1 · 핵심 플레이', title: '분자와 분모 지정', body: '선택한 재료를 눌러 분자 또는 분모에 배치합니다. kg·m은 분자, s 두 개는 분모로 지정해 kg·m/s²를 만드세요.', actions: assignActions() },
    { chapter: '1 · 핵심 플레이', title: '유도단위 제작', body: '차원식이 등록된 유도단위와 일치하면 제작 버튼이 활성화됩니다.', actions: [action('#craft-button', '뉴턴(N)을 제작하세요.', function () { return state().status === 'placing'; })] },
    { chapter: '1 · 핵심 플레이', title: '배치 위치 선택', body: '강조된 재료 칸 중 하나에 유도단위를 놓습니다. 나머지 재료 블록은 사라집니다.', actions: [action(cell(17), '원래 kg가 있던 칸에 N을 놓으세요.', function () { return state().status === 'animating' || document.querySelector('#modal-root [data-choice="up"]'); })] },
    { chapter: '1 · 핵심 플레이', title: '능력 발동과 연쇄', body: '만든 유도단위는 즉시 고유 능력을 발동합니다. 뉴턴은 선택한 방향으로 블록을 밀고, 새 조합이 생기면 연쇄 제작이 이어집니다.', actions: [
      action('#modal-root [data-choice="up"]', '↑ 위쪽을 선택하세요.', function () { return !document.querySelector('#modal-root [data-choice="up"]'); }),
      action('#board-wrap', 'N → C 연쇄가 끝날 때까지 지켜보세요.', function () { return state().status === 'playing' && state().craftedUnits.indexOf('C') >= 0 && state().maxChainCount >= 2; }, { wait: true })
    ] },
    { chapter: '1 · 핵심 플레이', title: '반응 폭탄 시연', body: '서로 다른 유도단위를 모아 얻은 반응 폭탄은 선택한 중심의 3×3 기본 블록을 제거합니다.', onEnter: prepareBomb, actions: [
      action('#bonus-item-button', '반응 폭탄을 누르세요.', function () { return state().status === 'placingItem'; }),
      action(cell(12), '보드 중앙을 폭발 중심으로 고르세요.', function () { return state().status === 'animating' || state().bonusItems === 0; }),
      action('#board-wrap', '3×3 폭발이 끝날 때까지 지켜보세요.', function () { return state().status === 'playing'; }, { wait: true })
    ] },
    { chapter: '1 · 핵심 플레이', title: '승리 조건', body: '유도단위의 능력과 반응 폭탄을 활용해 기본 블록을 모두 없애면 승리합니다. 일반 모드에서는 제한 시간이 끝나기 전에 보드를 정리하세요.', target: '.status-cluster', info: true }
  ];

  function cache() {
    refs.root = document.querySelector('#tutorial-guide');
    refs.ring = refs.root.querySelector('.tutorial-spotlight');
    refs.coach = refs.root.querySelector('.tutorial-coach');
    refs.chapter = refs.root.querySelector('#tutorial-chapter');
    refs.count = refs.root.querySelector('#tutorial-step-count');
    refs.title = refs.root.querySelector('#tutorial-title');
    refs.body = refs.root.querySelector('#tutorial-body');
    refs.task = refs.root.querySelector('#tutorial-task');
    refs.back = refs.root.querySelector('[data-tutorial-control="back"]');
    refs.skip = refs.root.querySelector('[data-tutorial-control="skip"]');
    refs.next = refs.root.querySelector('[data-tutorial-control="next"]');
    refs.exitConfirmation = refs.root.querySelector('#tutorial-exit-confirmation');
    refs.exitCancel = refs.root.querySelector('[data-tutorial-exit-control="cancel"]');
    refs.exitConfirm = refs.root.querySelector('[data-tutorial-exit-control="confirm"]');
    refs.exitStatus = refs.root.querySelector('#tutorial-exit-status');
    refs.shields = Array.from(refs.root.querySelectorAll('[data-tutorial-shield]'));
  }

  function currentStep() { return steps[stepIndex]; }
  function currentAction() { const step = currentStep(); return !reviewing && step && step.actions ? step.actions[actionIndex] : null; }
  function syncReviewSurface(step) {
    const reviewingMainMenu = reviewing && step && step.chapter === '1 · 메인 메뉴';
    if (reviewingMainMenu) UB.UI.showMenu();
    else if (state().tutorialMode && state().status !== 'menu') UB.UI.showGame();
    return reviewingMainMenu;
  }
  function itemAt(targetStepIndex, targetActionIndex, reviewMode) {
    const step = steps[targetStepIndex];
    if (!step) return null;
    if (step.actions) return step.actions[reviewMode ? 0 : Math.min(targetActionIndex, step.actions.length - 1)];
    return step;
  }

  function adjacentItem(direction) {
    const step = currentStep();
    if (!step) return null;
    if (reviewing) {
      if (direction < 0) return itemAt(stepIndex - 1, 0, true);
      if (reviewReturn && stepIndex + 1 >= reviewReturn.stepIndex) {
        return itemAt(reviewReturn.stepIndex, reviewReturn.actionIndex, false);
      }
      return itemAt(stepIndex + 1, 0, true);
    }
    if (step.actions) {
      const neighborAction = actionIndex + direction;
      if (neighborAction >= 0 && neighborAction < step.actions.length) return step.actions[neighborAction];
    }
    const neighborStepIndex = stepIndex + direction;
    const neighborStep = steps[neighborStepIndex];
    if (!neighborStep) return null;
    return itemAt(neighborStepIndex, direction < 0 && neighborStep.actions ? neighborStep.actions.length - 1 : 0, false);
  }

  function resolveItemTarget(item) {
    if (!item || !item.target) return null;
    return typeof item.target === 'function' ? item.target() : document.querySelector(item.target);
  }

  function measureItem(item) {
    const element = resolveItemTarget(item);
    if (!element || !element.getClientRects().length) return { item: item, element: element, rect: null };
    const rect = element.getBoundingClientRect();
    return { item: item, element: element, rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } };
  }

  function measureTargetNeighborhood() {
    const step = currentStep();
    const current = currentAction() || (reviewing && step && step.actions ? step.actions[0] : step);
    targetNeighborhood = {
      previous: measureItem(adjacentItem(-1)),
      current: measureItem(current),
      next: measureItem(adjacentItem(1))
    };
    return targetNeighborhood;
  }

  function resolveTarget() {
    const step = currentStep();
    const item = currentAction() || (reviewing && step && step.actions ? step.actions[0] : step);
    return resolveItemTarget(item);
  }

  function setShield(shield, left, top, width, height) {
    shield.style.left = Math.max(0, left) + 'px'; shield.style.top = Math.max(0, top) + 'px';
    shield.style.width = Math.max(0, width) + 'px'; shield.style.height = Math.max(0, height) + 'px';
  }

  function position(premeasuredTarget) {
    if (!active && !offering) return;
    window.clearTimeout(positionTimer);
    const measuredElement = premeasuredTarget && premeasuredTarget.nodeType === 1 ? premeasuredTarget : null;
    const target = active ? measuredElement || resolveTarget() : null;
    const vw = document.documentElement.clientWidth; const vh = window.innerHeight;
    if (!target || !target.getClientRects().length) {
      refs.ring.hidden = true;
      setShield(refs.shields[0], 0, 0, vw, vh);
      refs.shields.slice(1).forEach(function (shield) { setShield(shield, 0, 0, 0, 0); });
      refs.coach.style.left = Math.max(12, (vw - Math.min(420, vw - 24)) / 2) + 'px';
      refs.coach.style.top = Math.max(12, (vh - refs.coach.offsetHeight) / 2) + 'px';
      if (active) positionTimer = window.setTimeout(position, 220);
      return;
    }
    let rect = target.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= vh) {
      target.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
      rect = target.getBoundingClientRect();
    }
    const pad = 7;
    const hole = { left: Math.max(0, rect.left - pad), top: Math.max(0, rect.top - pad), right: Math.min(vw, rect.right + pad), bottom: Math.min(vh, rect.bottom + pad) };
    setShield(refs.shields[0], 0, 0, vw, hole.top);
    setShield(refs.shields[1], hole.right, hole.top, vw - hole.right, hole.bottom - hole.top);
    setShield(refs.shields[2], 0, hole.bottom, vw, vh - hole.bottom);
    setShield(refs.shields[3], 0, hole.top, hole.left, hole.bottom - hole.top);
    refs.ring.hidden = false;
    refs.ring.style.left = hole.left + 'px'; refs.ring.style.top = hole.top + 'px';
    refs.ring.style.width = (hole.right - hole.left) + 'px'; refs.ring.style.height = (hole.bottom - hole.top) + 'px';
    const inGame = document.body.classList.contains('tutorial-in-game');
    const cardWidth = Math.min(inGame ? 360 : 420, vw - 24);
    refs.coach.style.removeProperty('width');
    refs.coach.style.width = cardWidth + 'px';
    const cardHeight = refs.coach.offsetHeight;
    if (refs.coach.classList.contains('is-codex-reading')) {
      const close = document.querySelector('#modal-root [data-close]');
      const closeRect = close ? close.getBoundingClientRect() : null;
      const availableWidth = closeRect ? Math.max(190, (closeRect.left - 12 - vw / 2) * 2) : refs.coach.offsetWidth;
      const safeWidth = Math.min(refs.coach.offsetWidth, availableWidth);
      const centeredLeft = (vw - safeWidth) / 2;
      const closeSafeLeft = closeRect ? closeRect.left - 12 - safeWidth : centeredLeft;
      refs.coach.style.setProperty('width', safeWidth + 'px', 'important');
      refs.coach.style.left = Math.max(12, Math.min(centeredLeft, closeSafeLeft)) + 'px';
      refs.coach.style.top = '10px';
      return;
    }
    if (inGame) {
      if (vw <= 680) {
        refs.coach.style.left = Math.max(12, (vw - cardWidth) / 2) + 'px';
        const targetOnTop = rect.top + Math.min(rect.height, vh) / 2 < vh / 2;
        refs.coach.style.top = Math.max(10, targetOnTop ? vh - cardHeight - 10 : 10) + 'px';
      } else {
        const targetOnLeft = rect.left + rect.width / 2 < vw / 2;
        const targetOnTop = rect.top + Math.min(rect.height, vh) / 2 < vh / 2;
        refs.coach.style.left = (targetOnLeft ? vw - cardWidth - 16 : 16) + 'px';
        refs.coach.style.top = Math.max(16, targetOnTop ? vh - cardHeight - 16 : 16) + 'px';
      }
      return;
    }
    const below = hole.bottom + 14;
    const top = below + cardHeight <= vh - 12 ? below : Math.max(12, hole.top - cardHeight - 14);
    refs.coach.style.top = top + 'px';
    refs.coach.style.left = Math.max(12, Math.min(vw - cardWidth - 12, rect.left + rect.width / 2 - cardWidth / 2)) + 'px';
  }

  function pulse() {
    refs.ring.classList.remove('is-warning'); void refs.ring.offsetWidth; refs.ring.classList.add('is-warning');
  }

  function preparePosition(onReady) {
    window.clearTimeout(positionTimer);
    if (positionFrame !== null) window.cancelAnimationFrame(positionFrame);
    const neighborhood = measureTargetNeighborhood();
    const target = neighborhood.current && neighborhood.current.element;
    if (target && neighborhood.current.rect && (neighborhood.current.rect.bottom <= 0 || neighborhood.current.rect.top >= window.innerHeight)) {
      target.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
    }
    positionFrame = window.requestAnimationFrame(function () {
      positionFrame = window.requestAnimationFrame(function () {
        if (!active && !offering) return;
        const settled = active ? measureTargetNeighborhood() : null;
        position(settled && settled.current ? settled.current.element : null);
        void refs.ring.offsetWidth;
        positionFrame = null;
        if (onReady) onReady();
      });
    });
  }

  function commitRender(entering, token) {
    if (token !== transitionToken) return;
    const step = currentStep(); if (!step) { finish(); return; }
    if (entering && step.onEnter) step.onEnter();
    const reviewingMainMenu = syncReviewSurface(step);
    document.body.classList.toggle('tutorial-in-game', !reviewingMainMenu && Boolean(state().tutorialMode && state().status !== 'menu'));
    if (!document.querySelector('#modal-root .codex-modal')) { codexCollapsed = false; codexReadComplete = false; }
    const current = currentAction();
    refs.chapter.textContent = step.chapter;
    refs.count.textContent = (stepIndex + 1) + ' / ' + steps.length;
    refs.title.textContent = step.title;
    refs.body.textContent = step.body;
    refs.task.textContent = reviewing ? '이전 단계 설명을 다시 확인 중입니다. 다음을 누르면 기존 진행 지점으로 돌아갑니다.' : current ? current.label : '설명을 확인한 뒤 다음을 누르세요.';
    refs.task.classList.toggle('is-action', Boolean(current));
    refs.coach.classList.toggle('is-collapsed', codexCollapsed && !reviewing);
    refs.coach.classList.toggle('is-codex-reading', Boolean(current && current.scroll && codexCollapsed && !reviewing));
    refs.back.disabled = stepIndex === 0;
    refs.next.hidden = Boolean(current) && !reviewing;
    refs.next.textContent = reviewing ? '다음' : stepIndex === steps.length - 1 ? '완료' : '다음';
    refs.root.hidden = false;
    preparePosition(function () {
      if (token !== transitionToken) return;
      refs.root.classList.remove('is-transitioning');
      transitioning = false;
      if (current && current.wait) {
        waitTimer = window.setInterval(function () {
          if (!active || transitioning || exitConfirmOpen) return;
          if (current.after()) completeAction(current);
        }, 180);
      }
    });
  }

  function render(entering) {
    window.clearInterval(waitTimer);
    window.clearTimeout(transitionTimer);
    if (positionFrame !== null) window.cancelAnimationFrame(positionFrame);
    const step = currentStep(); if (!step) { finish(); return; }
    const token = ++transitionToken;
    transitioning = true;
    measureTargetNeighborhood();
    refs.root.classList.add('is-transitioning');
    transitionTimer = window.setTimeout(function () { commitRender(entering, token); }, 120);
  }

  function completeAction(completed) {
    window.clearInterval(waitTimer);
    if (completed.afterComplete) completed.afterComplete();
    actionIndex += 1;
    if (actionIndex >= currentStep().actions.length) {
      stepIndex += 1; actionIndex = 0; render(true);
    } else render(false);
  }

  function eventHits(event, target) { return Boolean(target && (event.target === target || target.contains(event.target))); }

  function handleGuidedClick(event) {
    if (!active) return;
    if (exitConfirmOpen) {
      if (event.target.closest('[data-tutorial-exit-control]')) return;
      event.preventDefault(); event.stopPropagation(); return;
    }
    if (transitioning) { event.preventDefault(); event.stopPropagation(); return; }
    if (event.target.closest('[data-tutorial-control]')) return;
    const current = currentAction();
    if (!current || current.wait) { pulse(); return; }
    const target = resolveTarget();
    if (current.scroll) {
      const closeButton = event.target.closest('[data-close]');
      if (!eventHits(event, target) || (closeButton && !codexReadComplete)) {
        event.preventDefault(); event.stopPropagation(); pulse();
        return;
      }
      if (closeButton && codexReadComplete) {
        window.setTimeout(function () {
          if (active && current === currentAction() && current.after()) completeAction(current);
        }, 40);
      }
      return;
    }
    if (!eventHits(event, target)) { pulse(); return; }
    if (current.intercept) {
      event.preventDefault(); event.stopPropagation();
      if (current.run) current.run();
    }
    window.setTimeout(function () {
      if (!active || current !== currentAction()) return;
      if (current.after()) completeAction(current); else pulse();
    }, current.delay || 40);
  }

  function handleGuidedScroll(event) {
    if (!active || transitioning || exitConfirmOpen) return;
    const current = currentAction();
    if (!current || !current.scroll) return;
    const target = resolveTarget();
    if (event.target !== target) return;
    if (target.scrollTop > 24 && !codexCollapsed) {
      codexCollapsed = true;
      refs.coach.classList.add('is-collapsed', 'is-codex-reading');
      position();
    }
    if (target.scrollTop + target.clientHeight >= target.scrollHeight - 12 && !codexReadComplete) {
      codexReadComplete = true;
      refs.task.textContent = '끝까지 확인했습니다. 더 살펴봐도 좋습니다. 준비되면 ×를 눌러 도감을 닫으세요.';
      refs.task.classList.add('is-action');
    }
  }

  function closeExitConfirmation(restoreFocus) {
    window.clearTimeout(exitUnlockTimer); exitUnlockTimer = null;
    exitConfirmOpen = false;
    refs.exitConfirmation.hidden = true;
    refs.exitConfirm.disabled = true;
    refs.exitStatus.textContent = '종료 버튼은 1초 후 활성화됩니다.';
    if (restoreFocus && (active || offering)) refs.skip.focus();
  }

  function openExitConfirmation() {
    if ((!active && !offering) || exitConfirmOpen || transitioning) return;
    window.clearTimeout(exitUnlockTimer);
    exitConfirmOpen = true;
    refs.exitConfirmation.hidden = false;
    refs.exitConfirm.disabled = true;
    refs.exitStatus.textContent = '종료 버튼은 1초 후 활성화됩니다.';
    refs.exitCancel.focus();
    exitUnlockTimer = window.setTimeout(function () {
      exitUnlockTimer = null;
      if (!exitConfirmOpen || (!active && !offering)) return;
      refs.exitConfirm.disabled = false;
      refs.exitStatus.textContent = '이제 튜토리얼을 종료할 수 있습니다.';
    }, 1000);
  }

  function handleExitKeydown(event) {
    if (!exitConfirmOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); closeExitConfirmation(true); return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [refs.exitCancel, refs.exitConfirm].filter(function (button) { return !button.disabled; });
    const currentIndex = focusable.indexOf(document.activeElement);
    if (!focusable.length) return;
    if (currentIndex < 0 || (!event.shiftKey && currentIndex === focusable.length - 1) || (event.shiftKey && currentIndex === 0)) {
      event.preventDefault();
      focusable[event.shiftKey ? focusable.length - 1 : 0].focus();
    }
  }

  function finish(options) {
    closeExitConfirmation(false);
    active = false; offering = false;
    reviewing = false; reviewReturn = null; codexCollapsed = false; codexReadComplete = false;
    transitioning = false; transitionToken += 1;
    window.clearInterval(waitTimer); window.clearTimeout(positionTimer); window.clearTimeout(transitionTimer);
    if (positionFrame !== null) window.cancelAnimationFrame(positionFrame);
    positionFrame = null; targetNeighborhood = { previous: null, current: null, next: null };
    localStorage.setItem('unitBreakerTutorialSeen', '1');
    refs.root.classList.remove('is-transitioning'); refs.root.hidden = true; document.body.classList.remove('tutorial-active');
    document.body.classList.remove('tutorial-in-game');
    document.querySelector('#home-button').disabled = false;
    UB.UI.closeModal();
    if (state().tutorialMode || state().status !== 'menu') UB.Game.backToMenu(options);
    else if (!(options && options.preserveHistory) && UB.Navigation) UB.Navigation.leave();
  }

  function start() {
    if (!refs.root) cache();
    if (UB.Navigation) UB.Navigation.enter('tutorial');
    closeExitConfirmation(false);
    offering = false; active = true; stepIndex = 0; actionIndex = 0;
    reviewing = false; reviewReturn = null; codexCollapsed = false; codexReadComplete = false; transitioning = false;
    UB.UI.closeModal(); UB.Game.backToMenu({ preserveHistory: true }); UB.UI.showMenu();
    document.body.classList.add('tutorial-active'); document.body.classList.remove('tutorial-in-game');
    document.querySelector('#home-button').disabled = true;
    render(true);
  }

  function offer() {
    if (!refs.root) cache();
    if (active || localStorage.getItem('unitBreakerTutorialSeen')) return;
    closeExitConfirmation(false);
    offering = true; refs.root.classList.remove('is-transitioning'); refs.root.hidden = false; document.body.classList.add('tutorial-active');
    refs.chapter.textContent = 'FIRST EXPERIMENT'; refs.count.textContent = '';
    refs.title.textContent = '핵심 플레이 튜토리얼';
    refs.body.textContent = '힌트로 조합을 찾고 유도단위를 제작해 능력과 반응 폭탄을 사용하는 핵심 흐름만 익힙니다.';
    refs.task.textContent = '지금 시작할까요?'; refs.task.classList.remove('is-action');
    refs.back.hidden = true; refs.skip.textContent = '나중에'; refs.next.hidden = false; refs.next.textContent = '튜토리얼 시작';
    position();
  }

  function bind() {
    cache();
    refs.next.addEventListener('click', function () {
      if (transitioning) return;
      if (offering) { refs.back.hidden = false; refs.skip.textContent = '건너뛰기'; start(); return; }
      if (!active) return;
      if (reviewing && reviewReturn) {
        stepIndex += 1;
        if (stepIndex >= reviewReturn.stepIndex) {
          const returnState = reviewReturn;
          stepIndex = returnState.stepIndex; actionIndex = returnState.actionIndex;
          reviewing = false; reviewReturn = null;
          if (returnState.restoreModal) UB.UI.restoreModal();
        }
        render(false); return;
      }
      if (currentStep().info) { stepIndex += 1; actionIndex = 0; render(true); }
    });
    refs.skip.addEventListener('click', openExitConfirmation);
    refs.exitCancel.addEventListener('click', function () { closeExitConfirmation(true); });
    refs.exitConfirm.addEventListener('click', function () {
      if (refs.exitConfirm.disabled) return;
      closeExitConfirmation(false); finish();
    });
    refs.back.addEventListener('click', function () {
      if (!active || transitioning || stepIndex <= 0) return;
      const modalRoot = document.querySelector('#modal-root');
      const modalOpen = Boolean(modalRoot && modalRoot.classList.contains('open'));
      const codexOpen = Boolean(document.querySelector('#modal-root .codex-modal'));
      if (!reviewing) reviewReturn = { stepIndex: stepIndex, actionIndex: codexOpen ? 0 : actionIndex, restoreModal: modalOpen && !codexOpen };
      if (codexOpen) {
        UB.UI.closeInformationalModal();
        codexCollapsed = false; codexReadComplete = false;
      } else if (modalOpen) UB.UI.suspendModal();
      stepIndex -= 1; actionIndex = 0; reviewing = true; render(false);
    });
    refs.shields.forEach(function (shield) { shield.addEventListener('click', pulse); });
    document.addEventListener('click', handleGuidedClick, true);
    document.addEventListener('keydown', handleExitKeydown, true);
    document.addEventListener('scroll', handleGuidedScroll, true);
    if (!resizeBound) { window.addEventListener('resize', position); window.addEventListener('scroll', position, true); resizeBound = true; }
  }

  document.addEventListener('DOMContentLoaded', bind);
  UB.Tutorial = { offer: offer, start: start, finish: finish, steps: steps };
})(window.UnitBreaker = window.UnitBreaker || {});

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

  function hzBoard() {
    const board = Array(25).fill(null);
    board[22] = base('s');
    board[4] = base('K'); board[9] = base('mol'); board[14] = base('kg'); board[19] = base('cd'); board[24] = base('A');
    return board;
  }

  function noRecipeBoard() {
    const board = Array(25).fill(null);
    board[0] = base('kg'); board[4] = base('m'); board[12] = base('K'); board[20] = base('s'); board[24] = base('A');
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

  function codexScrollAction() {
    return action('#modal-root .codex-modal', '도감을 맨 아래까지 스크롤해 모든 단위를 확인하세요.', function () {
      return codexReadComplete && !document.querySelector('#modal-root').classList.contains('open');
    }, { scroll: true });
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

  function rebuildActions() {
    return NEWTON_PATH.map(function (index, order) {
      return action(cell(index), (order + 1) + '번째 재료 ' + ['kg', 'm', 's', 's'][order] + '를 선택하세요.', function () {
        return state().selectedCells.length === order + 1;
      });
    }).concat(assignActions());
  }

  function prepareNewton() {
    document.querySelector('#unlimited-mode').checked = true;
    UB.UI.closeModal();
    UB.Game.startTutorialSession(newtonBoard());
  }

  function prepareHz() {
    if (!state().tutorialMode) UB.Game.startTutorialSession(hzBoard());
    state().board = hzBoard();
    state().selectedCells = []; state().assignments = {}; state().placementCandidates = [];
    state().pendingUnit = null; state().status = 'playing'; state().isAnimating = false;
    state().craftedUnits = ['N', 'C']; state().bonusUnitTypes = ['N', 'C'];
    state().correctCrafts = 2; state().bonusItems = 0; state().bonusMilestone = 0; state().nextBonusThreshold = 3;
    UB.UI.closeModal(); UB.UI.renderAll();
  }

  function prepareShuffle() {
    state().board = noRecipeBoard(); state().selectedCells = []; state().assignments = {};
    state().placementCandidates = []; state().pendingUnit = null; state().status = 'playing'; state().isAnimating = false;
    UB.UI.closeModal(); UB.UI.renderAll(); UB.UI.setShuffleAvailable(true);
  }

  function prepareBomb() {
    state().board = filledBoard(); state().initialBlockCount = 25; state().selectedCells = []; state().assignments = {};
    state().placementCandidates = []; state().pendingUnit = null; state().status = 'playing'; state().isAnimating = false;
    state().itemTargeting = false; state().bonusItems = Math.max(1, state().bonusItems || 0);
    UB.UI.closeModal(); UB.UI.renderAll();
  }

  function showTutorialResult() {
    state().board = Array(25).fill(null);
    state().removedBlocks = Math.max(state().removedBlocks, 25);
    UB.UI.renderAll();
    UB.Game.win();
  }

  const steps = [
    { chapter: '1 · 메인 메뉴', title: '참여형 튜토리얼', body: '이 안내는 설명만 넘기는 슬라이드가 아닙니다. 강조된 실제 화면 요소를 직접 조작하며 진행합니다.', target: '.menu-actions', info: true },
    { chapter: '1 · 메인 메뉴', title: '난이도 선택', body: '쉬움·보통·어려움은 보드 크기, 제한 시간, 힌트 수를 함께 바꿉니다.', actions: [action(function () { return document.querySelector('input[name="difficulty"][value="easy"]').closest('label'); }, '쉬움을 선택하세요.', function () { return document.querySelector('input[value="easy"]').checked; })] },
    { chapter: '1 · 메인 메뉴', title: '무제한 모드 켜기', body: '무제한 모드는 시간 제한과 셔플의 10초 페널티를 없애지만, 난이도의 보드 크기와 힌트 수는 유지합니다.', actions: [action('.unlimited-toggle', '무제한 모드를 켜세요.', function () { return document.querySelector('#unlimited-mode').checked; })] },
    { chapter: '1 · 메인 메뉴', title: '무제한 상태 유지', body: '튜토리얼에서는 시간에 쫓기지 않고 각 효과를 확인할 수 있도록 무제한 모드를 켠 채 진행합니다. 셔플도 무료입니다.', target: '.unlimited-toggle', info: true },
    { chapter: '1 · 메인 메뉴', title: '단위 도감', body: '도감에는 모든 유도단위의 차원식, 재료, 실제 쓰임과 게임 능력이 정리되어 있습니다.', actions: [
      action('[data-open="codex"]', '단위 도감을 여세요.', function () { return document.querySelector('#modal-root').classList.contains('open'); }),
      codexScrollAction()
    ] },
    { chapter: '2 · 게임 화면', title: '연습 실험 시작', body: '실험 시작 버튼은 선택한 설정으로 새 보드를 만듭니다. 튜토리얼에서는 결과가 기록되지 않는 고정 5×5 보드를 사용합니다.', actions: [action('#start-button', '실험 시작을 누르세요.', function () { return state().tutorialMode && state().status === 'playing'; }, { intercept: true, run: prepareNewton })] },
    { chapter: '2 · 게임 화면', title: '상태 표시', body: '위쪽에는 남은 시간, 남은 기본 블록, 점수, 최고 연쇄가 표시됩니다. 튜토리얼 중에는 시간이 멈춰 있습니다.', target: '.status-cluster', info: true },
    { chapter: '2 · 게임 화면', title: '홈 버튼', body: 'UNIT BREAKER 로고는 현재 실험을 버리고 메인 메뉴로 돌아갑니다. 튜토리얼 중에는 건너뛰기 버튼이 같은 역할을 합니다.', target: '#home-button', info: true },
    { chapter: '2 · 게임 화면', title: '게임 중 단위 도감', body: '게임 중 도감을 열면 실험이 자동으로 일시정지됩니다.', actions: [
      action('#codex-button', '▦ 도감 버튼을 누르세요.', function () { return document.querySelector('#modal-root').classList.contains('open') && state().isPaused; }),
      codexScrollAction()
    ] },
    { chapter: '2 · 게임 화면', title: '키보드 조작법', body: '⌨ 버튼은 방향키, Enter·Space, Backspace, Esc, H, R, P 단축키를 보여줍니다.', actions: [
      action('#keyboard-help-button', '⌨ 버튼을 눌러 조작법을 여세요.', function () { return document.querySelector('#modal-root .shortcut-grid'); }),
      action('#modal-root [data-close]', '확인한 뒤 ×로 닫으세요.', function () { return !document.querySelector('#modal-root').classList.contains('open'); })
    ] },
    { chapter: '2 · 게임 화면', title: '음향 끄기', body: '♪ 버튼은 효과음 전체를 켜고 끕니다. 설정은 브라우저에 저장됩니다.', actions: [action('#sound-button', '♪ 버튼을 눌러 음향을 끄세요.', function () { return document.querySelector('#sound-button').getAttribute('aria-pressed') === 'true'; })] },
    { chapter: '2 · 게임 화면', title: '음향 켜기', body: '같은 버튼을 다시 누르면 효과음이 켜집니다.', actions: [action('#sound-button', '× 버튼을 눌러 음향을 켜세요.', function () { return document.querySelector('#sound-button').getAttribute('aria-pressed') === 'false'; })] },
    { chapter: '2 · 게임 화면', title: '일시정지', body: 'Ⅱ 버튼 또는 P 키로 실험과 타이머를 멈출 수 있습니다.', actions: [action('#pause-button', 'Ⅱ 버튼을 눌러 일시정지하세요.', function () { return state().isPaused && document.querySelector('#modal-root [data-resume]'); })] },
    { chapter: '2 · 게임 화면', title: '계속하기와 메뉴', body: '일시정지 창의 계속하기는 실험을 재개하고, 메뉴로는 현재 실험을 종료합니다.', actions: [action('#modal-root [data-resume]', '계속하기를 누르세요.', function () { return !state().isPaused && state().status === 'playing'; })] },
    { chapter: '2 · 게임 화면', title: '보드와 범례', body: '보드는 7가지 SI 기본단위 kg, m, s, A, K, mol, cd로 구성됩니다. 아래 범례에서 색과 물리량을 확인할 수 있습니다.', target: '.board-panel', info: true },
    { chapter: '2 · 게임 화면', title: '반응 폭탄', body: '서로 다른 유도단위를 3종, 5종, 9종… 만들 때마다 3×3 반응 폭탄을 얻습니다. 숫자는 보유량, 아래 표시는 다음 획득 진행도입니다.', target: '#bonus-item-button', info: true },
    { chapter: '3 · 뉴턴 제작', title: '힌트 사용', body: '힌트는 현재 보드에서 실제로 제작 가능한 연결 경로 하나를 강조하며, 경로가 없으면 횟수를 소모하지 않습니다.', actions: [action('#hint-button', '힌트 버튼을 한 번 누르세요.', function () { return state().hintsRemaining === 6 && state().hintPath.length > 0; })] },
    { chapter: '3 · 뉴턴 제작', title: 'kg 선택', body: '블록은 직전 블록의 상하좌우 또는 대각선, 즉 8방향으로 이어 선택합니다.', actions: [action(cell(17), '강조된 kg 블록을 선택하세요.', function () { return state().selectedCells.join(',') === '17'; })] },
    { chapter: '3 · 뉴턴 제작', title: 'm 연결', body: '선택 순서는 연결 경로를 만들지만, 최종 단위는 각 재료의 분자·분모 역할로 결정됩니다.', actions: [action(cell(11), '대각선 위의 m을 이어 선택하세요.', function () { return state().selectedCells.join(',') === '17,11'; })] },
    { chapter: '3 · 뉴턴 제작', title: '첫 번째 s 연결', body: '뉴턴에는 시간 단위 s가 두 개 필요합니다.', actions: [action(cell(5), '첫 번째 s를 이어 선택하세요.', function () { return state().selectedCells.join(',') === '17,11,5'; })] },
    { chapter: '3 · 뉴턴 제작', title: '두 번째 s 연결', body: '같은 종류의 블록도 각각 하나의 재료로 취급됩니다.', actions: [action(cell(1), '두 번째 s를 이어 선택하세요.', function () { return state().selectedCells.length === 4; })] },
    { chapter: '3 · 뉴턴 제작', title: '마지막 선택 취소와 복구', body: '경로 끝 블록을 다시 누르거나 Backspace를 누르면 마지막 선택만 취소됩니다. 같은 블록을 다시 눌러 곧바로 복구할 수 있습니다.', actions: [
      action(cell(1), '방금 고른 s를 다시 눌러 취소하세요.', function () { return state().selectedCells.length === 3; }),
      action(cell(1), 's를 다시 선택해 재료 네 개를 복구하세요.', function () { return state().selectedCells.length === 4; })
    ] },
    { chapter: '3 · 뉴턴 제작', title: '분자와 분모 지정', body: '재료 칩은 미지정 → 분자 → 분모 → 미지정 순서로 바뀝니다. kg·m을 분자, s 두 개를 분모로 지정합니다.', actions: assignActions() },
    { chapter: '3 · 뉴턴 제작', title: '차원식과 예상 결과', body: '조합기는 kg·m/s², 차원 벡터 [1, 1, −2, 0, 0, 0, 0], 그리고 힘의 단위 뉴턴(N)을 실시간으로 보여줍니다.', target: '.dimension-readout, #result-preview', info: true },
    { chapter: '3 · 뉴턴 제작', title: '초기화', body: '초기화 버튼 또는 R 키는 현재 선택 경로와 모든 역할 지정을 지웁니다.', actions: [action('#reset-selection', '초기화를 눌러 선택을 모두 지우세요.', function () { return state().selectedCells.length === 0; })] },
    { chapter: '3 · 뉴턴 제작', title: '뉴턴식 다시 만들기', body: '이번에는 같은 경로와 역할을 한 단계 안에서 다시 완성해 봅니다.', actions: rebuildActions() },
    { chapter: '3 · 뉴턴 제작', title: '뉴턴 제작', body: '정확한 차원식이 완성되면 제작 버튼이 활성화됩니다. 제작 후에는 사용한 네 칸 중 유도단위를 놓을 위치를 고릅니다.', actions: [action('#craft-button', '제작 버튼을 누르세요.', function () { return state().status === 'placing'; })] },
    { chapter: '3 · 뉴턴 제작', title: '배치 위치 선택', body: '강조된 후보 중 하나가 뉴턴의 중심이 됩니다. 나머지 재료 블록은 사라집니다.', actions: [action(cell(17), '원래 kg가 있던 칸에 N을 놓으세요.', function () { return state().status === 'animating' || document.querySelector('#modal-root [data-choice="up"]'); })] },
    { chapter: '3 · 뉴턴 제작', title: '힘의 방향과 이동 연쇄', body: '뉴턴은 고른 방향으로 블록을 밉니다. 이동한 A가 s와 새로 연결되면 C가 자동 제작되어 2연쇄가 됩니다.', actions: [
      action('#modal-root [data-choice="up"]', '↑ 위쪽을 선택하세요.', function () { return !document.querySelector('#modal-root [data-choice="up"]'); }),
      action('#board-wrap', 'N → C 연쇄가 끝날 때까지 지켜보세요.', function () { return state().status === 'playing' && state().craftedUnits.indexOf('C') >= 0 && state().maxChainCount >= 2; }, { wait: true })
    ] },
    { chapter: '4 · 고급 기능', title: '같은 차원식의 두 단위', body: 's⁻¹은 Hz와 Bq 두 단위가 가능하므로 자동 연쇄에서는 제외됩니다. 직접 s를 분모로 지정하고 제작해 보세요.', onEnter: prepareHz, actions: [
      action(cell(22), 's 블록을 선택하세요.', function () { return state().selectedCells.length === 1; }),
      action(chip(1), 's를 한 번 눌러 분자로 보내세요.', function () { return role(1, 'numerator'); }),
      action(chip(1), 's를 다시 눌러 분모로 보내세요.', function () { return role(1, 'denominator'); }),
      action('#craft-button', 'Hz / Bq 제작 버튼을 누르세요.', function () { return Boolean(document.querySelector('#modal-root [data-choice="Hz"]')); })
    ] },
    { chapter: '4 · 고급 기능', title: 'Hz 또는 Bq 직접 선택', body: '둘 중 하나를 사용자가 직접 고릅니다. Gy·Sv도 같은 이유로 자동 연쇄에서 제외됩니다.', actions: [
      action('#modal-root [data-choice="Hz"], #modal-root [data-choice="Bq"]', 'Hz 또는 Bq 중 원하는 단위를 고르세요.', function () { return state().status === 'placing'; }),
      action(cell(22), '선택한 단위를 s가 있던 칸에 놓으세요.', function () { return state().status === 'animating' || state().bonusItems > 0; }),
      action('#bonus-item-button', '세 번째 서로 다른 단위가 기록될 때까지 지켜보세요.', function () { return state().status === 'playing' && state().bonusItems > 0; }, { wait: true })
    ] },
    { chapter: '4 · 고급 기능', title: '능력마다 다른 추가 입력', body: 'N은 방향, V는 두 번째 지점, Ω은 행·열, T는 끌어당길 기본단위를 고릅니다. 능력이 필요한 순간 화면에 선택지가 나타납니다.', target: '#result-preview', info: true },
    { chapter: '4 · 고급 기능', title: '셔플', body: '제작 가능한 경로가 하나도 없을 때만 셔플이 활성화됩니다. 남은 블록 수는 유지하며, 일반 모드에서는 10초가 차감됩니다.', onEnter: prepareShuffle, actions: [action('#shuffle-button', '활성화된 셔플을 누르세요.', function () { return state().selectedCells.length === 0; })] },
    { chapter: '4 · 고급 기능', title: '반응 폭탄과 실험 종료', body: '획득한 폭탄은 가장자리를 제외한 중심을 골라 3×3 기본 블록을 제거합니다. 이후 결과 화면의 다시 시작과 난이도 선택도 확인합니다.', onEnter: prepareBomb, actions: [
      action('#bonus-item-button', '반응 폭탄을 누르세요.', function () { return state().status === 'placingItem'; }),
      action(cell(12), '보드 중앙을 폭발 중심으로 고르세요.', function () { return state().status === 'animating' || state().bonusItems === 0; }),
      action('#board-wrap', '3×3 폭발이 끝날 때까지 지켜보세요.', function () { return state().status === 'playing'; }, { wait: true, afterComplete: showTutorialResult }),
      action('#modal-root [data-menu]', '결과 화면에서 난이도 선택을 누르면 튜토리얼이 끝납니다.', function () { return state().status === 'menu'; })
    ] }
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
          if (!active || transitioning) return;
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
    refs.root.hidden = false;
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
    if (!active || transitioning) return;
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

  function finish() {
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
    if (state().tutorialMode || state().status !== 'menu') UB.Game.backToMenu();
  }

  function start() {
    if (!refs.root) cache();
    offering = false; active = true; stepIndex = 0; actionIndex = 0;
    reviewing = false; reviewReturn = null; codexCollapsed = false; codexReadComplete = false; transitioning = false;
    UB.UI.closeModal(); UB.Game.backToMenu(); UB.UI.showMenu();
    document.body.classList.add('tutorial-active'); document.body.classList.remove('tutorial-in-game');
    document.querySelector('#home-button').disabled = true;
    render(true);
  }

  function offer() {
    if (!refs.root) cache();
    if (active || localStorage.getItem('unitBreakerTutorialSeen')) return;
    offering = true; refs.root.classList.remove('is-transitioning'); refs.root.hidden = false; document.body.classList.add('tutorial-active');
    refs.chapter.textContent = 'FIRST EXPERIMENT'; refs.count.textContent = '';
    refs.title.textContent = '직접 해보는 튜토리얼';
    refs.body.textContent = '메뉴부터 유도단위 제작, 이동 연쇄, 셔플과 반응 폭탄까지 실제 화면을 조작하며 익힐 수 있습니다.';
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
    refs.skip.addEventListener('click', finish);
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
    document.addEventListener('scroll', handleGuidedScroll, true);
    if (!resizeBound) { window.addEventListener('resize', position); window.addEventListener('scroll', position, true); resizeBound = true; }
  }

  document.addEventListener('DOMContentLoaded', bind);
  UB.Tutorial = { offer: offer, start: start, finish: finish, steps: steps };
})(window.UnitBreaker = window.UnitBreaker || {});

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = { window: {}, console, Math, Date, Set, Map, Object, Array };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);

['js/data/units.js', 'js/unit-system.js', 'js/board.js'].forEach((file) => {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
});

const UB = sandbox.window.UnitBreaker;
let passed = 0;

function test(name, assertion) {
  try {
    assertion();
    passed += 1;
    console.log('PASS', name);
  } catch (error) {
    console.error('FAIL', name, '-', error.message);
    process.exitCode = 1;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

function assignments(numerator, denominator) {
  const items = [];
  Object.entries(numerator || {}).forEach(([unit, count]) => {
    for (let i = 0; i < count; i += 1) items.push({ unit, role: 'numerator' });
  });
  Object.entries(denominator || {}).forEach(([unit, count]) => {
    for (let i = 0; i < count; i += 1) items.push({ unit, role: 'denominator' });
  });
  return items;
}

test('난이도별 보드는 5×5, 10×10, 15×15 크기로 생성된다', () => {
  assert(UB.Board.generateBoard(5).length === 25);
  assert(UB.Board.generateBoard(10).length === 100);
  assert(UB.Board.generateBoard(15).length === 225);
  assert(UB.DIFFICULTIES.easy.initialBlocks === 25);
  assert(UB.DIFFICULTIES.normal.initialBlocks === 100);
  assert(UB.DIFFICULTIES.hard.initialBlocks === 225);
  assert(UB.DIFFICULTIES.easy.hints === 7);
  assert(UB.DIFFICULTIES.normal.hints === 5);
  assert(UB.DIFFICULTIES.hard.hints === 3);
  assert(UB.DIFFICULTIES.easy.seconds === 600);
  assert(UB.DIFFICULTIES.normal.seconds === 480);
  assert(UB.DIFFICULTIES.hard.seconds === 360);
});

test('반응 폭탄 획득 기준은 3, 5, 9, 15, 23 순서다', () => {
  assert([1, 2, 3, 4, 5].map(UB.bonusItemThreshold).join(',') === '3,5,9,15,23');
});

test('모든 보드 크기에서 7개 기본단위가 각각 최소 3개 있다', () => {
  [5, 10, 15].forEach((size) => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const counts = UB.Board.countBaseUnits(UB.Board.generateBoard(size));
      assert(Object.keys(UB.BASE_UNITS).every((symbol) => counts[symbol] >= 3), size + ': ' + JSON.stringify(counts));
    }
  });
});

test('8방향 인접 판정과 비인접 거부가 정확하다', () => {
  assert(UB.Board.isAdjacent(16, 32));
  assert(UB.Board.isAdjacent(16, 17));
  assert(!UB.Board.isAdjacent(16, 34));
  assert(!UB.Board.isAdjacent(14, 15));
  assert(!UB.Board.isAdjacent(4, 5, 5));
  assert(UB.Board.isAdjacent(4, 8, 5));
  assert(!UB.Board.isAdjacent(9, 10, 10));
});

test('Wb 5×5 회전은 모든 가장자리에서도 블록을 복제하거나 누락하지 않는다', () => {
  [5, 10, 15].forEach((size) => {
    for (let center = 0; center < size * size; center += 1) {
      const mapping = UB.Board.squareRotationMap(center, 5, size);
      const sources = mapping.map((item) => item.source);
      const destinations = mapping.map((item) => item.destination);
      assert(mapping.length === 25);
      assert(new Set(sources).size === 25);
      assert(new Set(destinations).size === 25);
      assert(sources.slice().sort((a, b) => a - b).join(',') === destinations.slice().sort((a, b) => a - b).join(','));
    }
  });
});

test('와트 차원 벡터와 조합이 정확히 판정된다', () => {
  const recipe = assignments({ kg: 1, m: 2 }, { s: 3 });
  assert(JSON.stringify(UB.UnitSystem.calculateDimension(recipe)) === JSON.stringify([1, 2, -3, 0, 0, 0, 0]));
  assert(UB.UnitSystem.findMatchingUnit(recipe).symbol === 'W');
  assert(UB.UnitSystem.formatAssignments(recipe) === 'kg¹·m²·s⁻³');
});

test('같은 차원이더라도 불필요한 재료가 있으면 거부한다', () => {
  const invalid = assignments({ kg: 1, m: 3 }, { s: 3, m: 1 });
  assert(UB.UnitSystem.findMatchingUnit(invalid) === null);
});

test('루멘은 cd와 같은 내부 차원을 유지하며 cd 3개 제작 비용을 쓴다', () => {
  const lumen = UB.UnitSystem.findMatchingUnit(assignments({ cd: 3 }, {}));
  assert(lumen && lumen.symbol === 'lm');
  assert(JSON.stringify(lumen.dimension) === JSON.stringify([0, 0, 0, 0, 0, 0, 1]));
});

test('게임 조합으로 구현한 19개 이름 있는 유도단위가 모두 등록되어 있다', () => {
  const units = Object.values(UB.DERIVED_UNITS);
  assert(units.length === 19);
  assert(['F', 'S', 'H', 'Bq', 'Gy', 'Sv', 'kat'].every((symbol) => units.some((unit) => unit.symbol === symbol)));
  assert(!units.some((unit) => unit.symbol === 'rad' || unit.symbol === 'sr' || unit.symbol === '°C'));
  assert(UB.DERIVED_UNITS.C.nameKo === '쿨롬');
  units.forEach((unit) => {
    const matches = UB.UnitSystem.findMatchingUnits(UB.UnitSystem.recipeMaterials(unit));
    assert(matches.some((match) => match.symbol === unit.symbol), unit.symbol + ' recipe mismatch');
  });
});

test('같은 SI 차원식을 쓰는 단위를 모두 제작 후보로 제공한다', () => {
  const reciprocalSecond = UB.UnitSystem.findMatchingUnits(assignments({}, { s: 1 })).map((unit) => unit.symbol);
  const dose = UB.UnitSystem.findMatchingUnits(assignments({ m: 2 }, { s: 2 })).map((unit) => unit.symbol);
  assert(reciprocalSecond.includes('Hz') && reciprocalSecond.includes('Bq'));
  assert(dose.includes('Gy') && dose.includes('Sv'));
  const game = fs.readFileSync(path.join(root, 'js/game.js'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8');
  assert(game.includes('description: candidate.description'));
  assert(game.includes('subtitle: candidate.quantity'));
  assert(ui.includes("option.description ? '<strong>'"));
  assert(ui.includes("option.subtitle ? '<em>'"));
});

test('등록된 19개 유도단위의 특수 능력이 모두 실행기에 연결되어 있다', () => {
  const abilities = fs.readFileSync(path.join(root, 'js/abilities.js'), 'utf8');
  Object.values(UB.DERIVED_UNITS).forEach((unit) => {
    assert(abilities.includes(unit.abilityId + ': ' + unit.abilityId), unit.symbol + ' ability missing');
  });
});

test('보드 경로 탐색은 셀을 중복 사용하지 않는다', () => {
  const board = Array(225).fill(null);
  board[0] = UB.Board.createBaseBlock('kg');
  board[1] = UB.Board.createBaseBlock('m');
  board[16] = UB.Board.createBaseBlock('s');
  board[17] = UB.Board.createBaseBlock('s');
  const pathFound = UB.Board.pathForMaterials(board, assignments({ kg: 1, m: 1 }, { s: 2 }));
  assert(pathFound && pathFound.length === 4);
  assert(new Set(pathFound).size === pathFound.length);
});

test('힌트는 현재 제작 가능한 조합 중 필요한 블록 수가 가장 많은 조합을 우선한다', () => {
  const board = Array(25).fill(null);
  ['kg', 'm', 'm', 's', 's', 's', 's', 'A', 'A'].forEach((symbol, order) => {
    const path = [0, 1, 2, 3, 4, 9, 8, 7, 6];
    board[path[order]] = UB.Board.createBaseBlock(symbol);
  });
  const hint = UB.Board.findAvailableRecipe(board);
  assert(hint && hint.unit.symbol === 'F');
  assert(hint.path.length === 9);
});

test('최대 블록 수가 같은 힌트 후보는 등록 순서의 첫 단위에 고정되지 않는다', () => {
  const board = Array(25).fill(null);
  board[0] = UB.Board.createBaseBlock('s');
  const originalRandom = Math.random;
  Math.random = () => 0.99;
  try {
    const hint = UB.Board.findAvailableRecipe(board);
    assert(hint && hint.unit.symbol === 'Bq');
    assert(hint.path.length === 1);
  } finally {
    Math.random = originalRandom;
  }
});

test('중력 후 블록 수와 ID가 보존되고 빈칸은 위에 남는다', () => {
  const board = Array(225).fill(null);
  const a = UB.Board.createBaseBlock('kg'); const b = UB.Board.createBaseBlock('m');
  board[0] = a; board[30] = b;
  UB.Board.applyGravity(board);
  const blocks = board.filter(Boolean);
  assert(blocks.length === 2 && new Set(blocks.map((block) => block.id)).size === 2);
  assert(board[210] === b && board[195] === a);
  assert(board.slice(0, 195).every((block) => block === null));
});

test('삭제 후 실제로 내려간 블록과 낙하 칸 수만 기록한다', () => {
  const board = Array(25).fill(null);
  const upper = UB.Board.createBaseBlock('kg');
  const lower = UB.Board.createBaseBlock('m');
  board[0] = upper;
  board[10] = lower;
  const movements = UB.Board.applyGravityDetailed(board);
  assert(movements.length === 2, JSON.stringify(movements));
  const upperMove = movements.find((movement) => movement.id === upper.id);
  const lowerMove = movements.find((movement) => movement.id === lower.id);
  assert(upperMove.rows === 3 && upperMove.toIndex === 15);
  assert(lowerMove.rows === 2 && lowerMove.toIndex === 20);
  assert(UB.Board.applyGravityDetailed(board).length === 0, '이미 정렬된 블록은 다시 움직이면 안 된다');
});

test('셔플은 블록 총개수와 ID 집합을 바꾸지 않는다', () => {
  const board = UB.Board.generateBoard();
  const before = board.filter(Boolean).map((block) => block.id).sort();
  UB.Board.shuffleRemaining(board);
  const after = board.filter(Boolean).map((block) => block.id).sort();
  assert(JSON.stringify(before) === JSON.stringify(after));
});

test('생성된 보드는 적어도 하나의 제작 가능 경로가 있다', () => {
  [5, 10, 15].forEach((size) => {
    assert(Boolean(UB.Board.findAvailableRecipe(UB.Board.generateBoard(size))), size + '×' + size);
  });
});

test('특수 능력 충전·방향 이동 애니메이션이 실행 흐름에 연결되어 있다', () => {
  const abilities = fs.readFileSync(path.join(root, 'js/abilities.js'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
  assert(abilities.includes("kind: 'charge'"));
  assert(abilities.includes('function planPushLine'));
  assert(abilities.includes('plan.movements.map(function (movement) { return movement.from; })'));
  assert(abilities.includes('state().attractMovements = movements'));
  assert(ui.includes('function playTelegraph'));
  assert(ui.includes("cell.classList.add('is-attracting')"));
  assert(css.includes('@keyframes pushUp') && css.includes('@keyframes telegraphRing') && css.includes('@keyframes chargeAttract'));
});

test('참여형 튜토리얼은 34단계 실제 조작과 한 단계씩 이전 보기를 제공한다', () => {
  const tutorial = fs.readFileSync(path.join(root, 'js/tutorial.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
  assert((tutorial.match(/chapter: '/g) || []).length === 34);
  assert(!tutorial.includes('restartChapter') && !tutorial.includes('CHAPTER_STARTS'));
  assert(tutorial.includes('reviewReturn = { stepIndex: stepIndex, actionIndex: codexOpen ? 0 : actionIndex, restoreModal:'));
  assert(tutorial.includes('stepIndex -= 1; actionIndex = 0; reviewing = true'));
  assert(tutorial.includes("title: '무제한 모드 켜기'") && tutorial.includes("title: '반응 폭탄'"));
  assert(tutorial.includes("title: '무제한 상태 유지'") && !tutorial.includes("title: '무제한 모드 끄기'"));
  assert(tutorial.includes("classList.toggle('tutorial-in-game'") && css.includes('.tutorial-in-game .tutorial-coach'));
  assert((tutorial.match(/codexScrollAction\(\)/g) || []).length === 3);
  assert(tutorial.includes("document.addEventListener('scroll', handleGuidedScroll, true)"));
  assert(tutorial.includes("event.target.closest('[data-close]')"));
  assert(tutorial.includes("refs.coach.classList.add('is-collapsed', 'is-codex-reading')"));
  assert(tutorial.includes('UB.UI.closeInformationalModal()'));
  assert(tutorial.includes('codexOpen ? 0 : actionIndex'));
  assert(tutorial.includes('더 살펴봐도 좋습니다. 준비되면 ×를 눌러'));
  assert(ui.includes('closeInformationalModal: closeInformationalModal'));
  assert(tutorial.includes("querySelector('#home-button').disabled = true"));
  assert(tutorial.includes("querySelector('#home-button').disabled = false"));
  assert(css.includes('.tutorial-coach.is-collapsed'));
  assert(tutorial.includes("classList.contains('is-codex-reading')"));
  assert(tutorial.includes("setProperty('width', safeWidth + 'px', 'important')"));
  assert(tutorial.includes('Math.min(centeredLeft, closeSafeLeft)'));
  assert(css.includes('.tutorial-coach.is-codex-reading'));
  assert(tutorial.includes("input[name=\"difficulty\"][value=\"easy\"]').closest('label')"));
  assert(tutorial.includes("action('#hint-button'") && tutorial.includes("action('#shuffle-button'") && tutorial.includes("action('#bonus-item-button'"));
  assert(tutorial.includes("data-choice=\"Hz\"") && tutorial.includes("data-choice=\"Bq\""));
  assert(tutorial.includes("data-choice=\"up\"") && tutorial.includes("craftedUnits.indexOf('C')"));
  assert(!tutorial.includes('#debug-panel') && !ui.includes('TUTORIAL_STEPS'));
  assert(tutorial.includes('function measureTargetNeighborhood()'));
  assert(tutorial.includes('previous: measureItem(adjacentItem(-1))') && tutorial.includes('next: measureItem(adjacentItem(1))'));
  assert(tutorial.includes("scrollIntoView({ behavior: 'auto'") && !tutorial.includes("scrollIntoView({ behavior: 'smooth'"));
  assert(tutorial.includes("refs.root.classList.add('is-transitioning')") && tutorial.includes("refs.root.classList.remove('is-transitioning')"));
  assert(tutorial.includes('transitionTimer') && tutorial.includes('commitRender(entering, token)'));
  assert(!tutorial.includes('syncBackAvailability') && !tutorial.includes('modalObserver'), 'modal back disabling was not rolled back');
  assert(tutorial.includes('restoreModal: modalOpen && !codexOpen'), 'modal restore state missing');
  assert(tutorial.includes('UB.UI.suspendModal()') && tutorial.includes('UB.UI.restoreModal()'), 'tutorial modal suspend/restore wiring missing');
  assert(ui.includes('function suspendModal()') && ui.includes('function restoreModal()'), 'UI modal suspend/restore helpers missing');
  assert(tutorial.includes('function syncReviewSurface(step)'));
  assert(tutorial.includes('if (reviewingMainMenu) UB.UI.showMenu()'));
  assert(tutorial.includes("else if (state().tutorialMode && state().status !== 'menu') UB.UI.showGame()"));
  assert(css.includes('.tutorial-guide.is-transitioning .tutorial-spotlight'));
  assert(css.includes('transition: opacity .16s ease, transform .16s ease'));
  assert(html.includes('id="tutorial-guide"') && html.includes('src="js/tutorial.js?v=20260722-tutorial17"'));
  assert(html.includes('src="js/board.js?v=20260722-hint2"'));
  assert(css.includes('.tutorial-spotlight') && css.includes('.tutorial-coach'));
});

test('모바일 유도단위 도감은 한 열과 부가 설명 토글을 사용한다', () => {
  const ui = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
  assert(ui.includes('data-codex-toggle'));
  assert(ui.includes("extra.classList.toggle('is-open', !expanded)"));
  assert(css.includes('.codex-grid { grid-template-columns: minmax(0, 1fr); }'));
  assert(css.includes('.codex-extra { order: 3; display: none;'));
  assert(css.includes('.codex-extra.is-open { display: block;'));
});

test('게임 로고의 메뉴 이동과 모바일 세로 레이아웃이 연결되어 있다', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
  assert(html.includes('id="home-button"'));
  assert(main.includes("querySelector('#home-button')") && main.includes('UB.Game.backToMenu()'));
  assert(css.includes('@media (max-width: 980px)'));
  assert(css.includes('grid-template-columns: minmax(0, 1fr);'));
  assert(css.includes('.board-wrap { width: 100%; min-width: 0;'));
});

test('제작 가능한 단위가 없으면 힌트를 차감하지 않고 셔플을 활성화한다', () => {
  const harness = { window: {}, console, Math, Date, Set, Map, Object, Array };
  harness.window.window = harness.window;
  harness.window.setTimeout = () => 0;
  harness.window.clearTimeout = () => {};
  harness.window.setInterval = () => 0;
  harness.window.clearInterval = () => {};
  vm.createContext(harness);
  ['js/data/units.js', 'js/unit-system.js', 'js/board.js'].forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), harness, { filename: file });
  });
  let shuffleEnabled = false;
  harness.window.UnitBreaker.UI = {
    syncGameState() {}, toast() {}, renderBoard() {}, renderComposer() {}, renderAll() {}, updateStatus() {},
    setShuffleAvailable(value) { shuffleEnabled = value; }
  };
  vm.runInContext(fs.readFileSync(path.join(root, 'js/game.js'), 'utf8'), harness, { filename: 'js/game.js' });
  const gameUB = harness.window.UnitBreaker;
  gameUB.Game.state.status = 'playing';
  gameUB.Game.state.hintsRemaining = 7;
  gameUB.Game.state.board = Array.from({ length: 25 }, () => gameUB.Board.createBaseBlock('kg'));
  gameUB.Game.useHint();
  assert(gameUB.Game.state.hintsRemaining === 7);
  assert(shuffleEnabled === true);

  gameUB.Game.state.board[0] = gameUB.Board.createBaseBlock('s');
  gameUB.Game.useHint();
  assert(gameUB.Game.state.hintsRemaining === 6);
  assert(gameUB.Game.state.hintPath.length > 0);

  ['Hz', 'W', 'V'].forEach((symbol) => {
    gameUB.Game.state.craftedUnits.push(symbol);
    gameUB.Game.recordBonusUnit(symbol);
  });
  assert(gameUB.Game.state.bonusItems === 1);
  assert(gameUB.Game.state.bonusUnitTypes.length === 0);
  assert(gameUB.Game.state.nextBonusThreshold === 5);

  ['Hz', 'W', 'V', 'Hz', 'W', 'V', 'Bq', 'Pa'].forEach((symbol) => {
    gameUB.Game.state.craftedUnits.push(symbol);
    gameUB.Game.recordBonusUnit(symbol);
  });
  assert(gameUB.Game.state.bonusItems === 2);
  assert(gameUB.Game.state.bonusUnitTypes.length === 0);
  assert(gameUB.Game.state.nextBonusThreshold === 9);

  gameUB.Game.state.boardSize = 10;
  [11, 55, 88].forEach((index) => {
    assert(gameUB.Game.isBonusTarget(index));
    const area = gameUB.Game.getBonusArea(index);
    assert(area.length === 9);
    assert(new Set(area).size === 9);
    assert(area.includes(index));
    assert(area.every((cell) => cell >= 0 && cell < 100));
  });
  [0, 9, 90, 99].forEach((index) => {
    assert(!gameUB.Game.isBonusTarget(index));
    assert(gameUB.Game.getBonusArea(index).length === 0);
  });

  gameUB.Game.state.status = 'playing';
  gameUB.Game.state.board = Array.from({ length: 100 }, () => gameUB.Board.createBaseBlock('kg'));
  gameUB.Game.state.remainingTime = 100;
  gameUB.Game.state.unlimitedMode = false;
  gameUB.Game.shuffle(false);
  assert(gameUB.Game.state.remainingTime === 90);
  gameUB.Game.state.status = 'playing';
  gameUB.Game.state.remainingTime = 100;
  gameUB.Game.state.unlimitedMode = true;
  gameUB.Game.shuffle(false);
  assert(gameUB.Game.state.remainingTime === 100);

  vm.runInContext(fs.readFileSync(path.join(root, 'js/abilities.js'), 'utf8'), harness, { filename: 'js/abilities.js' });
  const chainGroups = gameUB.Abilities.automaticChainGroups();
  const automaticSymbols = chainGroups.flatMap((group) => group.units.map((unit) => unit.symbol));
  assert(['Hz', 'Bq', 'Gy', 'Sv'].every((symbol) => !automaticSymbols.includes(symbol)));
  const forcePressure = gameUB.Abilities.chooseChainUnit([gameUB.DERIVED_UNITS.N, gameUB.DERIVED_UNITS.Pa], 0.999);
  const forceNewton = gameUB.Abilities.chooseChainUnit([gameUB.DERIVED_UNITS.N, gameUB.DERIVED_UNITS.Pa], 0);
  assert(forceNewton.symbol === 'N' && forcePressure.symbol === 'Pa');
  const resistanceGroup = chainGroups.find((group) => group.units.some((unit) => unit.symbol === 'Ω'));
  assert(resistanceGroup && resistanceGroup.units.map((unit) => unit.symbol).join(',') === 'Ω,S');

  gameUB.Game.state.boardSize = 10;
  gameUB.Game.state.board = Array(100).fill(null);
  for (let col = 1; col <= 8; col += 1) {
    gameUB.Game.state.board[40 + col] = gameUB.Board.createBaseBlock('mol');
  }
  const blockedPush = gameUB.Abilities.planPushLine(40, 'right');
  assert(blockedPush.line.length === 7);
  assert(blockedPush.movements.length === 0, '막혀서 움직이지 않는 블록은 뉴턴 이동 효과 대상이 아니어야 한다');
  gameUB.Game.state.board[48] = null;
  const openPush = gameUB.Abilities.planPushLine(40, 'right');
  assert(openPush.movements.length === 7);
  assert(openPush.movements.every((movement) => movement.destination === movement.from + 1));

  gameUB.Game.state.boardSize = 5;
  gameUB.Game.state.board = Array(25).fill(null);
  const movingA = gameUB.Board.createBaseBlock('A');
  const movingS = gameUB.Board.createBaseBlock('s');
  gameUB.Game.state.board[0] = movingA;
  gameUB.Game.state.board[24] = movingS;
  const beforeMovement = gameUB.Abilities.captureBasePositions();
  gameUB.Game.state.board[0] = null;
  gameUB.Game.state.board[24] = null;
  gameUB.Game.state.board[6] = movingA;
  gameUB.Game.state.board[7] = movingS;
  const movementChain = gameUB.Abilities.findMovementChain(beforeMovement);
  assert(movementChain && movementChain.group.units.length === 1 && movementChain.group.units[0].symbol === 'C');

  const craftCountBefore = gameUB.Game.state.correctCrafts;
  const scoreBefore = gameUB.Game.state.score;
  gameUB.Game.recordCraft(gameUB.DERIVED_UNITS.C, 2);
  assert(gameUB.Game.state.correctCrafts === craftCountBefore + 1);
  assert(gameUB.Game.state.score === scoreBefore + 240);
  assert(gameUB.Game.state.craftedUnits[gameUB.Game.state.craftedUnits.length - 1] === 'C');
});

if (!process.exitCode) console.log(`\n${passed} tests passed.`);

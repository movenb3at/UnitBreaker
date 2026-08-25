(function (UB) {
  'use strict';

  const delay = function (ms) { return new Promise(function (resolve) { window.setTimeout(resolve, ms); }); };
  const AUTO_CHAIN_EXCLUDED = new Set(['Hz', 'Bq', 'Gy', 'Sv']);
  const CHAIN_TIMING = {
    candidate: 1000,
    crafted: 700,
    charge: 900,
    transition: 400
  };
  const visualDelay = function (ms) {
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return delay(reduced ? Math.min(ms, 100) : ms);
  };

  function state() { return UB.Game.state; }
  function boardSize() { return state().boardSize || UB.BOARD_SIZE; }
  function blockAt(index) { return state().board[index]; }
  function specialIdAt(index) { const block = blockAt(index); return block && block.type === 'special' ? block.id : null; }

  function multiplier(chain) {
    if (chain >= 5) return 3;
    if (chain === 4) return 2;
    if (chain === 3) return 1.5;
    if (chain === 2) return 1.2;
    return 1;
  }

  async function removeBase(indices, chainDepth) {
    const unique = Array.from(new Set(indices)).filter(function (index) {
      const block = blockAt(index);
      return block && block.type === 'base' && !block.removing;
    });
    if (!unique.length) return 0;
    unique.forEach(function (index) { blockAt(index).removing = true; });
    state().lastAffected = unique;
    UB.UI.renderBoard();
    await visualDelay(340);
    let removed = 0;
    unique.forEach(function (index) {
      const block = blockAt(index);
      if (block && block.type === 'base' && block.removing) {
        const bonus = block.bonus && block.revealed ? 150 : 0;
        state().score += Math.round((100 + bonus) * multiplier(chainDepth || 1));
        state().board[index] = null;
        removed += 1;
      }
    });
    state().board.forEach(function (block) { if (block && block.type === 'base' && block.removing) block.removing = false; });
    state().removedBlocks += removed;
    state().lastAffected = [];
    UB.UI.updateStatus();
    return removed;
  }

  async function settle() {
    const movements = UB.Board.applyGravityDetailed(state().board);
    if (movements.length) {
      state().gravityPulse += 1;
      state().gravityMovements = movements;
      UB.UI.renderBoard();
      const longestFall = Math.max.apply(null, movements.map(function (movement) { return movement.rows; }));
      await visualDelay(Math.min(620, 260 + longestFall * 45));
      state().gravityMovements = [];
      UB.UI.renderBoard();
    } else {
      state().gravityMovements = [];
      UB.UI.renderBoard();
    }
  }

  function indicesInRadius(center, radius) {
    const point = UB.Board.rowCol(center);
    const indices = [];
    for (let row = point.row - radius; row <= point.row + radius; row += 1) {
      for (let col = point.col - radius; col <= point.col + radius; col += 1) {
        const index = UB.Board.toIndex(row, col);
        if (index >= 0) indices.push(index);
      }
    }
    return indices;
  }

  function impactedSpecials(indices, exceptId) {
    return Array.from(new Set(indices.map(specialIdAt).filter(function (id) { return id && id !== exceptId; })));
  }

  function materialCounts(unit) {
    const counts = {};
    ['numerator', 'denominator'].forEach(function (role) {
      Object.keys(unit.recipe[role] || {}).forEach(function (symbol) {
        counts[symbol] = (counts[symbol] || 0) + unit.recipe[role][symbol];
      });
    });
    return counts;
  }

  function materialKey(unit) {
    const counts = materialCounts(unit);
    return Object.keys(counts).sort().map(function (symbol) { return symbol + ':' + counts[symbol]; }).join('|');
  }

  function automaticChainGroups() {
    const groups = new Map();
    Object.values(UB.DERIVED_UNITS).forEach(function (unit, order) {
      if (AUTO_CHAIN_EXCLUDED.has(unit.symbol)) return;
      const key = materialKey(unit);
      if (!groups.has(key)) groups.set(key, { key: key, order: order, units: [], counts: materialCounts(unit) });
      groups.get(key).units.push(unit);
    });
    return Array.from(groups.values());
  }

  function captureBasePositions() {
    const positions = new Map();
    state().board.forEach(function (block, index) {
      if (block && block.type === 'base') positions.set(block.id, { index: index, unit: block.unit });
    });
    return positions;
  }

  function positionsAreAdjacent(first, second) {
    const a = UB.Board.rowCol(first, boardSize());
    const b = UB.Board.rowCol(second, boardSize());
    return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col)) === 1;
  }

  function wasConnectedBefore(ids, beforePositions) {
    if (ids.some(function (id) { return !beforePositions.has(id); })) return false;
    function search(id, used) {
      if (used.size === ids.length) return true;
      const current = beforePositions.get(id).index;
      for (let i = 0; i < ids.length; i += 1) {
        const nextId = ids[i];
        if (!used.has(nextId) && positionsAreAdjacent(current, beforePositions.get(nextId).index)) {
          const nextUsed = new Set(used); nextUsed.add(nextId);
          if (search(nextId, nextUsed)) return true;
        }
      }
      return false;
    }
    return ids.some(function (id) { return search(id, new Set([id])); });
  }

  function findGroupPath(group, movedIds, beforePositions) {
    const required = group.counts;
    const total = Object.values(required).reduce(function (sum, count) { return sum + count; }, 0);
    function search(index, remaining, path, used) {
      const block = blockAt(index);
      if (!block || block.type !== 'base' || !remaining[block.unit] || used.has(index)) return null;
      const nextRemaining = Object.assign({}, remaining);
      nextRemaining[block.unit] -= 1;
      const nextPath = path.concat(index);
      const nextUsed = new Set(used); nextUsed.add(index);
      if (nextPath.length === total) {
        const ids = nextPath.map(function (cell) { return blockAt(cell).id; });
        return wasConnectedBefore(ids, beforePositions) ? null : nextPath;
      }
      const candidates = UB.Board.neighbors(index, true, boardSize()).filter(function (cell) {
        const candidate = blockAt(cell);
        return candidate && candidate.type === 'base' && nextRemaining[candidate.unit] > 0 && !nextUsed.has(cell);
      });
      for (let i = 0; i < candidates.length; i += 1) {
        const result = search(candidates[i], nextRemaining, nextPath, nextUsed);
        if (result) return result;
      }
      return null;
    }

    const starts = state().board.map(function (block, index) {
      return block && block.type === 'base' && movedIds.has(block.id) && required[block.unit] ? index : -1;
    }).filter(function (index) { return index >= 0; });
    for (let i = 0; i < starts.length; i += 1) {
      const path = search(starts[i], required, [], new Set());
      if (path) return path;
    }
    return null;
  }

  function findMovementChain(beforePositions) {
    const movedIds = new Set();
    state().board.forEach(function (block, index) {
      if (block && block.type === 'base' && beforePositions.has(block.id) && beforePositions.get(block.id).index !== index) movedIds.add(block.id);
    });
    if (!movedIds.size) return null;
    const candidates = automaticChainGroups().map(function (group) {
      const path = findGroupPath(group, movedIds, beforePositions);
      if (!path) return null;
      const movedCount = path.reduce(function (count, cell) { return count + (movedIds.has(blockAt(cell).id) ? 1 : 0); }, 0);
      return { group: group, path: path, movedIds: movedIds, movedCount: movedCount };
    }).filter(Boolean);
    candidates.sort(function (a, b) {
      return b.movedCount - a.movedCount || b.path.length - a.path.length || a.group.order - b.group.order || a.path[0] - b.path[0];
    });
    return candidates[0] || null;
  }

  function chooseChainUnit(units, randomValue) {
    const roll = typeof randomValue === 'number' ? randomValue : Math.random();
    return units[Math.min(units.length - 1, Math.floor(roll * units.length))];
  }

  async function vibrationWave(index, depth) {
    const center = UB.Board.rowCol(index);
    const targets = [];
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    directions.forEach(function (direction) {
      let previousUnit = null;
      for (let distance = 1; distance <= 2; distance += 1) {
        const target = UB.Board.toIndex(center.row + direction[0] * distance, center.col + direction[1] * distance);
        if (target >= 0 && blockAt(target) && blockAt(target).type === 'base') {
          targets.push(target);
          if (distance === 2) previousUnit = blockAt(target).unit;
        }
      }
      if (previousUnit) {
        for (let distance = 3; distance < boardSize(); distance += 1) {
          const target = UB.Board.toIndex(center.row + direction[0] * distance, center.col + direction[1] * distance);
          const block = target >= 0 ? blockAt(target) : null;
          if (!block || block.type !== 'base' || block.unit !== previousUnit) break;
          targets.push(target);
        }
      }
    });
    await removeBase(targets, depth);
    return [];
  }

  function pushLineCells(index, directionName) {
    const vectors = { up: [-1, 0], right: [0, 1], down: [1, 0], left: [0, -1] };
    const vector = vectors[directionName] || vectors.up;
    const center = UB.Board.rowCol(index);
    const line = [];
    for (let distance = 1; distance <= 7; distance += 1) {
      const target = UB.Board.toIndex(center.row + vector[0] * distance, center.col + vector[1] * distance);
      if (target < 0) break;
      line.push(target);
    }
    return { vector: vector, line: line };
  }

  function planPushLine(index, directionName) {
    const config = pushLineCells(index, directionName);
    const occupied = new Set();
    state().board.forEach(function (block, cell) { if (block) occupied.add(cell); });
    const movements = [];
    for (let cursor = config.line.length - 1; cursor >= 0; cursor -= 1) {
      const from = config.line[cursor];
      const block = blockAt(from);
      if (!block) continue;
      const point = UB.Board.rowCol(from);
      const destination = UB.Board.toIndex(point.row + config.vector[0], point.col + config.vector[1]);
      if (destination < 0 || !occupied.has(destination)) {
        movements.push({ from: from, destination: destination, id: block.id, type: block.type });
        occupied.delete(from);
        if (destination >= 0) occupied.add(destination);
      }
    }
    return { vector: config.vector, line: config.line, movements: movements };
  }

  function bestPushDirection(index) {
    return ['up', 'right', 'down', 'left'].map(function (direction) {
      const plan = planPushLine(index, direction);
      const removed = plan.movements.filter(function (movement) {
        return movement.destination < 0 && movement.type === 'base';
      }).length;
      const moved = plan.movements.length;
      return { direction: direction, score: removed * 100 + moved };
    }).sort(function (a, b) { return b.score - a.score; })[0].direction;
  }

  async function pushLine(index, depth) {
    const directionName = depth > 1 ? bestPushDirection(index) : await UB.UI.requestChoice('힘의 방향을 선택하세요', [
      { value: 'up', label: '↑ 위' }, { value: 'right', label: '→ 오른쪽' },
      { value: 'down', label: '↓ 아래' }, { value: 'left', label: '← 왼쪽' }
    ]);
    const plan = planPushLine(index, directionName);
    const directionLabels = { up: '위쪽으로 힘 전달', right: '오른쪽으로 힘 전달', down: '아래쪽으로 힘 전달', left: '왼쪽으로 힘 전달' };
    await UB.UI.playTelegraph(index, {
      symbol: 'N', kind: 'direction', direction: directionName, label: directionLabels[directionName]
    }, 1400);
    state().pushMotion = plan.movements.map(function (movement) { return movement.from; });
    state().pushDirection = directionName;
    const chainIds = [];
    try {
      UB.UI.renderBoard();
      if (plan.movements.length) await visualDelay(650);
      plan.movements.forEach(function (movement) {
        const block = blockAt(movement.from);
        if (!block || block.id !== movement.id) return;
        if (movement.destination < 0) {
          if (block.type === 'special') chainIds.push(block.id);
          if (block.type === 'base') { block.removing = true; state().removedBlocks += 1; state().score += Math.round(100 * multiplier(depth)); }
          state().board[movement.from] = null;
        } else {
          state().board[movement.destination] = block;
          state().board[movement.from] = null;
        }
      });
    } finally {
      state().pushMotion = [];
      state().pushDirection = null;
      UB.UI.renderBoard();
    }
    await visualDelay(220);
    return chainIds;
  }

  async function pressurePull(index, depth) {
    const center = UB.Board.rowCol(index);
    const targets = [];
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (direction) {
      for (let distance = 1; distance <= 3; distance += 1) {
        const target = UB.Board.toIndex(center.row + direction[0] * distance, center.col + direction[1] * distance);
        if (target >= 0 && blockAt(target) && blockAt(target).type === 'base') { targets.push(target); break; }
      }
    });
    await removeBase(targets, depth);
    return [];
  }

  async function areaBlast(index, depth, ownId) {
    const area = indicesInRadius(index, 1);
    const chains = impactedSpecials(area, ownId);
    await removeBase(area, depth);
    return chains;
  }

  async function pulseClear(index, depth, ownId) {
    const chains = new Set();
    for (let pulse = 0; pulse < 3; pulse += 1) {
      const currentIndex = UB.Board.findBlockIndex(state().board, ownId);
      if (currentIndex < 0) break;
      const area = indicesInRadius(currentIndex, 1);
      impactedSpecials(area, ownId).forEach(function (id) { chains.add(id); });
      const candidates = area.filter(function (cell) { return blockAt(cell) && blockAt(cell).type === 'base'; }).slice(0, 2);
      state().abilityPulse = pulse + 1;
      await removeBase(candidates, depth);
      await settle();
      if (pulse < 2) await delay(210);
    }
    return Array.from(chains);
  }

  async function chargeAttract(index) {
    const center = UB.Board.rowCol(index);
    const bases = state().board.map(function (block, cell) { return block && block.type === 'base' ? { block: block, index: cell } : null; }).filter(Boolean);
    if (!bases.length) return [];
    bases.sort(function (a, b) {
      const pa = UB.Board.rowCol(a.index); const pb = UB.Board.rowCol(b.index);
      return (Math.abs(pa.row - center.row) + Math.abs(pa.col - center.col)) - (Math.abs(pb.row - center.row) + Math.abs(pb.col - center.col));
    });
    const targetUnit = bases[0].block.unit;
    const ring = indicesInRadius(index, 1).filter(function (cell) { return cell !== index; });
    const sources = bases.filter(function (item) {
      return item.block.unit === targetUnit && ring.indexOf(item.index) < 0;
    });
    const destinations = ring.filter(function (cell) {
      const block = blockAt(cell);
      return !block || (block.type === 'base' && block.unit !== targetUnit);
    });
    const moves = [];
    const availableDestinations = destinations.slice();

    sources.slice(0, Math.min(6, destinations.length)).forEach(function (source) {
      let bestOrder = 0;
      let bestDistance = Infinity;
      availableDestinations.forEach(function (destination, order) {
        const point = UB.Board.rowCol(destination);
        const sourcePoint = UB.Board.rowCol(source.index);
        const distance = Math.abs(point.row - sourcePoint.row) + Math.abs(point.col - sourcePoint.col);
        if (distance < bestDistance) { bestDistance = distance; bestOrder = order; }
      });
      moves.push({ source: source, destination: availableDestinations.splice(bestOrder, 1)[0], distance: bestDistance });
    });

    state().lastAffected = moves.map(function (move) { return move.source.index; });
    UB.UI.renderBoard();
    await UB.UI.playTelegraph(index, { symbol: 'C', kind: 'range', label: targetUnit + ' 블록 끌어당김' }, 800);

    const movements = [];
    moves.forEach(function (move) {
      const displaced = blockAt(move.destination);
      state().board[move.destination] = move.source.block;
      state().board[move.source.index] = displaced || null;
      movements.push({
        id: move.source.block.id, fromIndex: move.source.index, toIndex: move.destination,
        distance: move.distance, kind: 'attracted'
      });
      if (displaced) {
        movements.push({
          id: displaced.id, fromIndex: move.destination, toIndex: move.source.index,
          distance: move.distance, kind: 'displaced'
        });
      }
    });

    state().lastAffected = [];
    state().attractMovements = movements;
    UB.UI.renderBoard();
    if (movements.length) {
      const longestMove = Math.max.apply(null, movements.map(function (movement) { return movement.distance; }));
      await visualDelay(Math.min(900, 500 + longestMove * 45));
    }
    state().attractMovements = [];
    UB.UI.renderBoard();
    return [];
  }

  function electricPathCells(index, target) {
    const start = UB.Board.rowCol(index); const end = UB.Board.rowCol(target);
    const path = [];
    const colStep = start.col <= end.col ? 1 : -1;
    for (let col = start.col; col !== end.col + colStep; col += colStep) path.push(UB.Board.toIndex(start.row, col));
    const rowStep = start.row <= end.row ? 1 : -1;
    for (let row = start.row + rowStep; row !== end.row + rowStep; row += rowStep) path.push(UB.Board.toIndex(row, end.col));
    return path;
  }

  function bestElectricTarget(index) {
    return state().board.map(function (_, target) {
      const path = electricPathCells(index, target);
      const bases = path.reduce(function (count, cell) { return count + (blockAt(cell) && blockAt(cell).type === 'base' ? 1 : 0); }, 0);
      return { target: target, score: bases * 100 + path.length };
    }).sort(function (a, b) { return b.score - a.score || a.target - b.target; })[0].target;
  }

  async function electricPath(index, depth, ownId) {
    const target = depth > 1 ? bestElectricTarget(index) : await UB.Game.requestBoardTarget('전기 경로의 두 번째 지점을 선택하세요');
    const path = electricPathCells(index, target);
    state().abilityPath = path;
    UB.UI.renderBoard();
    await UB.UI.playTelegraph(index, { symbol: 'V', kind: 'path', label: '전기 경로 충전' }, 1000);
    const chains = impactedSpecials(path, ownId);
    await removeBase(path, depth);
    state().abilityPath = [];
    return chains;
  }

  async function resistanceLine(index, depth) {
    const point = UB.Board.rowCol(index);
    function targetsForAxis(axisName) {
      const result = [];
      for (let step = 0; step < boardSize() && result.length < 8; step += 2) {
        const target = axisName === 'col' ? UB.Board.toIndex(step, point.col) : UB.Board.toIndex(point.row, step);
        if (target >= 0 && blockAt(target) && blockAt(target).type === 'base') result.push(target);
      }
      return result;
    }
    const axis = depth > 1
      ? (targetsForAxis('col').length > targetsForAxis('row').length ? 'col' : 'row')
      : await UB.UI.requestChoice('저항을 적용할 축을 선택하세요', [
      { value: 'row', label: '↔ 행' }, { value: 'col', label: '↕ 열' }
    ]);
    const targets = targetsForAxis(axis);
    await UB.UI.playTelegraph(index, {
      symbol: 'Ω', kind: 'direction', direction: axis, label: axis === 'col' ? '열 방향 저항 전개' : '행 방향 저항 전개'
    }, 1200);
    await removeBase(targets, depth);
    return [];
  }

  async function fluxRotate(index, depth) {
    const cells = UB.Board.squareRotationMap(index, 5, boardSize()).map(function (item) {
      return { source: item.source, destination: item.destination, block: blockAt(item.source) };
    });
    state().rotationMotion = cells.map(function (item) { return item.source; });
    UB.UI.renderBoard();
    await UB.UI.playTelegraph(index, { symbol: 'Wb', kind: 'range', label: '5×5 자기 선속 회전' }, 900);
    await visualDelay(500);
    cells.forEach(function (item) { state().board[item.destination] = item.block; });
    state().rotationMotion = [];
    UB.UI.renderBoard(); await visualDelay(380);
    const visited = new Set(); const remove = [];
    cells.forEach(function (item) {
      const start = item.destination; const block = blockAt(start);
      if (!block || block.type !== 'base' || visited.has(start)) return;
      const cluster = []; const queue = [start]; visited.add(start);
      while (queue.length) {
        const current = queue.shift(); cluster.push(current);
        UB.Board.neighbors(current, false).forEach(function (next) {
          const nextBlock = blockAt(next);
          if (!visited.has(next) && nextBlock && nextBlock.type === 'base' && nextBlock.unit === block.unit) { visited.add(next); queue.push(next); }
        });
      }
      if (cluster.length >= 4) remove.push.apply(remove, cluster);
    });
    await removeBase(remove, depth);
    return [];
  }

  async function magneticGather(index, depth) {
    const present = Array.from(new Set(indicesInRadius(index, 3).map(function (cell) {
      const block = blockAt(cell); return block && block.type === 'base' ? block.unit : null;
    }).filter(Boolean)));
    const options = present.map(function (symbol) { return { value: symbol, label: symbol + ' · ' + UB.BASE_UNITS[symbol].quantity }; });
    if (!options.length) return [];
    const chosen = depth > 1 ? present.map(function (symbol) {
      return {
        symbol: symbol,
        count: indicesInRadius(index, 3).filter(function (cell) { const block = blockAt(cell); return block && block.type === 'base' && block.unit === symbol; }).length
      };
    }).sort(function (a, b) { return b.count - a.count; })[0].symbol : await UB.UI.requestChoice('끌어당길 기본단위를 선택하세요', options);
    const targets = indicesInRadius(index, 3).filter(function (cell) { const block = blockAt(cell); return block && block.type === 'base' && block.unit === chosen; });
    state().lastAffected = targets;
    UB.UI.renderBoard();
    await UB.UI.playTelegraph(index, { symbol: 'T', kind: 'range', label: chosen + ' 자기 집속' }, 1100);
    await visualDelay(280);
    if (targets.length >= 4) await removeBase(targets, depth);
    return [];
  }

  async function revealLight(index, depth) {
    state().board.forEach(function (block) { if (block && block.type === 'base' && block.bonus) block.revealed = true; });
    const bases = state().board.map(function (block, cell) { return block && block.type === 'base' ? cell : null; }).filter(function (cell) { return cell !== null; });
    bases.sort(function () { return Math.random() - 0.5; });
    await removeBase(bases.slice(0, 5), depth);
    return [];
  }

  async function illuminateArea(index, depth) {
    const area = indicesInRadius(index, 2).filter(function (cell) { return blockAt(cell) && blockAt(cell).type === 'base'; });
    const remove = area.filter(function () { return Math.random() < 0.5; });
    const survivors = area.filter(function (cell) { return remove.indexOf(cell) < 0; });
    await removeBase(remove, depth);
    const startedAt = Date.now();
    const expires = startedAt + 2000;
    survivors.forEach(function (cell) {
      if (blockAt(cell)) {
        blockAt(cell).litStartedAt = startedAt;
        blockAt(cell).litUntil = expires;
      }
    });
    window.setTimeout(function () { if (UB.Game && UB.Game.state) UB.UI.renderBoard(); }, 2050);
    return [];
  }

  async function capacitorDischarge(index, depth) {
    const center = UB.Board.rowCol(index);
    const targets = indicesInRadius(index, 2).filter(function (cell) { return blockAt(cell) && blockAt(cell).type === 'base'; });
    targets.sort(function (a, b) {
      const pa = UB.Board.rowCol(a); const pb = UB.Board.rowCol(b);
      return (Math.abs(pa.row - center.row) + Math.abs(pa.col - center.col)) - (Math.abs(pb.row - center.row) + Math.abs(pb.col - center.col));
    });
    state().lastAffected = targets.slice(0, 8);
    UB.UI.renderBoard();
    await UB.UI.playTelegraph(index, { symbol: 'F', kind: 'range', label: '전하 축적 후 방전' }, 1000);
    await removeBase(targets.slice(0, 8), depth);
    return [];
  }

  async function conductiveCross(index, depth) {
    const point = UB.Board.rowCol(index);
    const targets = [];
    for (let cell = 0; cell < boardSize(); cell += 1) {
      [UB.Board.toIndex(point.row, cell), UB.Board.toIndex(cell, point.col)].forEach(function (target) {
        if (target >= 0 && blockAt(target) && blockAt(target).type === 'base' && targets.indexOf(target) < 0) targets.push(target);
      });
    }
    await UB.UI.playTelegraph(index, { symbol: 'S', kind: 'range', label: '가로·세로 전도 경로' }, 900);
    await removeBase(targets.slice(0, 10), depth);
    return [];
  }

  async function inductionLoop(index, depth, ownId) {
    const center = UB.Board.rowCol(index);
    const loop = indicesInRadius(index, 2).filter(function (cell) {
      const point = UB.Board.rowCol(cell);
      return Math.max(Math.abs(point.row - center.row), Math.abs(point.col - center.col)) === 2;
    });
    const chains = impactedSpecials(loop, ownId);
    await UB.UI.playTelegraph(index, { symbol: 'H', kind: 'range', label: '5×5 유도 고리' }, 1000);
    await removeBase(loop, depth);
    return chains;
  }

  async function decayScatter(index, depth) {
    const targets = state().board.map(function (block, cell) { return block && block.type === 'base' ? cell : null; }).filter(function (cell) { return cell !== null; });
    targets.sort(function () { return Math.random() - 0.5; });
    await UB.UI.playTelegraph(index, { symbol: 'Bq', kind: 'range', label: '방사성 붕괴 전파' }, 850);
    await removeBase(targets.slice(0, 3), depth);
    return [];
  }

  async function absorbedDose(index, depth) {
    const center = UB.Board.rowCol(index);
    const targets = indicesInRadius(index, 2).filter(function (cell) { return blockAt(cell) && blockAt(cell).type === 'base'; });
    targets.sort(function (a, b) {
      const pa = UB.Board.rowCol(a); const pb = UB.Board.rowCol(b);
      return (Math.abs(pa.row - center.row) + Math.abs(pa.col - center.col)) - (Math.abs(pb.row - center.row) + Math.abs(pb.col - center.col));
    });
    await UB.UI.playTelegraph(index, { symbol: 'Gy', kind: 'range', label: '흡수 선량 전달' }, 950);
    await removeBase(targets.slice(0, 10), depth);
    return [];
  }

  async function equivalentDose(index, depth) {
    const area = indicesInRadius(index, 3).filter(function (cell) { return blockAt(cell) && blockAt(cell).type === 'base'; });
    const counts = area.reduce(function (map, cell) { const symbol = blockAt(cell).unit; map[symbol] = (map[symbol] || 0) + 1; return map; }, {});
    const weightedUnit = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
    const targets = weightedUnit ? area.filter(function (cell) { return blockAt(cell).unit === weightedUnit; }) : [];
    await UB.UI.playTelegraph(index, { symbol: 'Sv', kind: 'range', label: (weightedUnit || '') + ' 선량 가중' }, 950);
    await removeBase(targets, depth);
    return [];
  }

  async function catalyticReaction(index, depth) {
    const area = indicesInRadius(index, 2).filter(function (cell) { return blockAt(cell) && blockAt(cell).type === 'base'; });
    const counts = area.reduce(function (map, cell) { const symbol = blockAt(cell).unit; map[symbol] = (map[symbol] || 0) + 1; return map; }, {});
    const catalyst = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
    const targets = catalyst ? area.filter(function (cell) { return blockAt(cell).unit === catalyst; }).slice(0, 6) : [];
    await UB.UI.playTelegraph(index, { symbol: 'kat', kind: 'range', label: (catalyst || '') + ' 촉매 연쇄 반응' }, 900);
    await removeBase(targets, depth);
    return [];
  }

  const handlers = {
    vibrationWave: vibrationWave, pushLine: pushLine, pressurePull: pressurePull, areaBlast: areaBlast,
    pulseClear: pulseClear, chargeAttract: chargeAttract, electricPath: electricPath,
    resistanceLine: resistanceLine, fluxRotate: fluxRotate, magneticGather: magneticGather,
    revealLight: revealLight, illuminateArea: illuminateArea,
    capacitorDischarge: capacitorDischarge, conductiveCross: conductiveCross, inductionLoop: inductionLoop,
    decayScatter: decayScatter, absorbedDose: absorbedDose,
    equivalentDose: equivalentDose, catalyticReaction: catalyticReaction
  };

  async function activateMovementChain(candidate, chainDepth, activated) {
    if (!candidate || chainDepth > 10) return;
    const current = state();
    const unit = chooseChainUnit(candidate.group.units);
    const path = candidate.path.slice();
    const placement = path.find(function (cell) {
      const block = blockAt(cell);
      return block && candidate.movedIds.has(block.id);
    });
    const target = placement === undefined ? path[Math.floor(path.length / 2)] : placement;
    current.lastAffected = path.slice();
    UB.UI.renderBoard();
    UB.UI.toast(chainDepth + '연쇄 후보 · ' + unit.nameKo + '(' + unit.symbol + ') 자동 조합');
    await visualDelay(CHAIN_TIMING.candidate);
    const special = UB.Board.createSpecialBlock(unit);
    path.forEach(function (cell) { current.board[cell] = null; });
    current.board[target] = special;
    current.lastAffected = [];
    const reward = UB.Game.recordCraft(unit, path.length);
    if (!reward) UB.UI.toast(chainDepth + '연쇄 · ' + unit.nameKo + '(' + unit.symbol + ') 자동 제작');
    UB.UI.renderAll();
    await visualDelay(CHAIN_TIMING.crafted);
    await settle();
    await activateSpecial(special.id, chainDepth, activated);
  }

  async function activateSpecial(blockId, depth, seen) {
    const chainDepth = depth || 1;
    const activated = seen || new Set();
    if (chainDepth > 10 || activated.has(blockId)) return;
    let index = UB.Board.findBlockIndex(state().board, blockId);
    if (index < 0) return;
    const block = blockAt(index);
    if (!block || block.type !== 'special') return;
    activated.add(blockId);
    state().chainCount = chainDepth;
    state().maxChainCount = Math.max(state().maxChainCount, chainDepth);
    state().lastAbility = block.unit;
    UB.UI.showAbilityBanner(block.unit, chainDepth);
    UB.UI.updateStatus();
    await UB.UI.playTelegraph(index, {
      symbol: block.unit, kind: 'charge', label: chainDepth > 1 ? chainDepth + '연쇄 충전' : '특수 능력 충전'
    }, chainDepth > 1 ? CHAIN_TIMING.charge : 900);
    const beforePositions = captureBasePositions();
    const unit = Object.values(UB.DERIVED_UNITS).find(function (candidate) { return candidate.symbol === block.unit; });
    const handler = unit && handlers[unit.abilityId];
    let chainIds = handler ? await handler(index, chainDepth, blockId) : [];
    index = UB.Board.findBlockIndex(state().board, blockId);
    if (index >= 0) state().board[index] = null;
    await settle();
    const movementChain = chainDepth < 10 ? findMovementChain(beforePositions) : null;
    if (movementChain) {
      await visualDelay(CHAIN_TIMING.transition);
      await activateMovementChain(movementChain, chainDepth + 1, activated);
    }
    for (let i = 0; i < chainIds.length; i += 1) {
      if (!activated.has(chainIds[i])) await activateSpecial(chainIds[i], chainDepth + 1, activated);
    }
  }

  UB.Abilities = {
    activateSpecial: activateSpecial,
    automaticChainGroups: automaticChainGroups,
    captureBasePositions: captureBasePositions,
    chooseChainUnit: chooseChainUnit,
    findMovementChain: findMovementChain,
    planPushLine: planPushLine,
    removeBase: removeBase,
    settle: settle
  };
})(window.UnitBreaker = window.UnitBreaker || {});

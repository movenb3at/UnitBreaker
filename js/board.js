(function (UB) {
  'use strict';

  let blockSequence = 0;
  function resolveSize(boardOrSize) {
    if (typeof boardOrSize === 'number') return boardOrSize;
    if (Array.isArray(boardOrSize) && boardOrSize.length) return Math.round(Math.sqrt(boardOrSize.length));
    if (UB.Game && UB.Game.state && UB.Game.state.boardSize) return UB.Game.state.boardSize;
    return UB.BOARD_SIZE;
  }

  function randomId(prefix) {
    blockSequence += 1;
    return (prefix || 'block') + '-' + Date.now().toString(36) + '-' + blockSequence;
  }

  function createBaseBlock(unit) {
    return { id: randomId('base'), type: 'base', unit: unit, bonus: Math.random() < 0.04, revealed: false, removing: false, litStartedAt: 0, litUntil: 0 };
  }

  function createSpecialBlock(unit) {
    return { id: randomId('special'), type: 'special', unit: unit.symbol, unitId: unit.id, removing: false };
  }

  function weightedUnit() {
    let roll = Math.random() * 100;
    const symbols = Object.keys(UB.BASE_UNIT_WEIGHTS);
    for (let i = 0; i < symbols.length; i += 1) {
      roll -= UB.BASE_UNIT_WEIGHTS[symbols[i]];
      if (roll <= 0) return symbols[i];
    }
    return 'm';
  }

  function generateBoard(boardSize) {
    const size = resolveSize(boardSize);
    const board = Array.from({ length: size * size }, function () { return createBaseBlock(weightedUnit()); });
    const counts = countBaseUnits(board);
    const replaceable = board.map(function (_, index) { return index; });
    Object.keys(UB.BASE_UNITS).forEach(function (symbol) {
      while ((counts[symbol] || 0) < 3) {
        const eligible = replaceable.filter(function (index) {
          return board[index].unit !== symbol && counts[board[index].unit] > 3;
        });
        if (!eligible.length) break;
        const index = eligible[Math.floor(Math.random() * eligible.length)];
        replaceable.splice(replaceable.indexOf(index), 1);
        const old = board[index].unit;
        counts[old] -= 1;
        board[index] = createBaseBlock(symbol);
        counts[symbol] = (counts[symbol] || 0) + 1;
      }
    });
    return board;
  }

  function rowCol(index, boardSize) {
    const size = resolveSize(boardSize);
    return { row: Math.floor(index / size), col: index % size };
  }
  function toIndex(row, col, boardSize) {
    const size = resolveSize(boardSize);
    return row >= 0 && row < size && col >= 0 && col < size ? row * size + col : -1;
  }

  function squareRotationMap(centerIndex, sideLength, boardSize) {
    const size = resolveSize(boardSize);
    const side = Math.min(size, Math.max(1, Math.floor(sideLength || 5)));
    const center = rowCol(centerIndex, size);
    const offset = Math.floor(side / 2);
    const startRow = Math.max(0, Math.min(size - side, center.row - offset));
    const startCol = Math.max(0, Math.min(size - side, center.col - offset));
    const mapping = [];
    for (let row = 0; row < side; row += 1) {
      for (let col = 0; col < side; col += 1) {
        mapping.push({
          source: toIndex(startRow + row, startCol + col, size),
          destination: toIndex(startRow + col, startCol + side - 1 - row, size)
        });
      }
    }
    return mapping;
  }

  function neighbors(index, diagonal, boardSize) {
    const size = resolveSize(boardSize);
    const point = rowCol(index, size);
    const offsets = diagonal === false
      ? [[-1, 0], [1, 0], [0, -1], [0, 1]]
      : [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    return offsets.map(function (offset) { return toIndex(point.row + offset[0], point.col + offset[1], size); }).filter(function (value) { return value >= 0; });
  }

  function isAdjacent(a, b, boardSize) {
    const size = resolveSize(boardSize);
    const first = rowCol(a, size);
    const second = rowCol(b, size);
    return Math.max(Math.abs(first.row - second.row), Math.abs(first.col - second.col)) === 1;
  }

  function countBaseUnits(board) {
    return board.reduce(function (counts, block) {
      if (block && block.type === 'base') counts[block.unit] = (counts[block.unit] || 0) + 1;
      return counts;
    }, {});
  }

  function baseCount(board) {
    return board.reduce(function (total, block) { return total + (block && block.type === 'base' ? 1 : 0); }, 0);
  }

  function applyGravityDetailed(board) {
    const size = resolveSize(board);
    const movements = [];
    for (let col = 0; col < size; col += 1) {
      const columnBlocks = [];
      for (let row = size - 1; row >= 0; row -= 1) {
        const index = toIndex(row, col, size);
        if (board[index]) columnBlocks.push({ block: board[index], fromRow: row, fromIndex: index });
      }
      for (let row = size - 1, cursor = 0; row >= 0; row -= 1, cursor += 1) {
        const index = toIndex(row, col, size);
        const item = columnBlocks[cursor] || null;
        board[index] = item ? item.block : null;
        if (item && item.fromRow !== row) {
          movements.push({ id: item.block.id, fromIndex: item.fromIndex, toIndex: index, rows: row - item.fromRow });
        }
      }
    }
    return movements;
  }

  function applyGravity(board) {
    return applyGravityDetailed(board).length;
  }

  function shuffledCopy(items) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = copy[i]; copy[i] = copy[j]; copy[j] = temp;
    }
    return copy;
  }

  function shuffleRemaining(board) {
    const occupied = [];
    const blocks = [];
    board.forEach(function (block, index) { if (block) { occupied.push(index); blocks.push(block); } });
    const shuffled = shuffledCopy(blocks);
    occupied.forEach(function (index, order) { board[index] = shuffled[order]; });
    return board;
  }

  function pathForMaterials(board, materials) {
    const size = resolveSize(board);
    if (!materials.length) return null;
    const required = materials.reduce(function (counts, item) {
      const symbol = typeof item === 'string' ? item : item.unit;
      counts[symbol] = (counts[symbol] || 0) + 1;
      return counts;
    }, {});

    function search(index, remaining, path, used) {
      const block = board[index];
      if (!block || block.type !== 'base' || !remaining[block.unit] || used.has(index)) return null;
      const nextRemaining = Object.assign({}, remaining);
      nextRemaining[block.unit] -= 1;
      const nextPath = path.concat(index);
      const nextUsed = new Set(used); nextUsed.add(index);
      const left = Object.values(nextRemaining).reduce(function (sum, count) { return sum + count; }, 0);
      if (left === 0) return nextPath;
      const candidates = neighbors(index, true, size).filter(function (neighborIndex) {
        const neighbor = board[neighborIndex];
        return neighbor && neighbor.type === 'base' && nextRemaining[neighbor.unit] > 0 && !nextUsed.has(neighborIndex);
      });
      candidates.sort(function (a, b) { return nextRemaining[board[a].unit] - nextRemaining[board[b].unit]; });
      for (let i = 0; i < candidates.length; i += 1) {
        const result = search(candidates[i], nextRemaining, nextPath, nextUsed);
        if (result) return result;
      }
      return null;
    }

    for (let start = 0; start < board.length; start += 1) {
      const block = board[start];
      if (block && block.type === 'base' && required[block.unit]) {
        const path = search(start, required, [], new Set());
        if (path) return path;
      }
    }
    return null;
  }

  function findAvailableRecipe(board) {
    const units = Object.values(UB.DERIVED_UNITS).slice().sort(function (a, b) {
      return UB.UnitSystem.countRecipe(b.recipe) - UB.UnitSystem.countRecipe(a.recipe);
    });
    const candidates = [];
    let bestRecipeSize = null;
    for (let i = 0; i < units.length; i += 1) {
      const recipeSize = UB.UnitSystem.countRecipe(units[i].recipe);
      if (bestRecipeSize !== null && recipeSize < bestRecipeSize) break;
      const materials = UB.UnitSystem.recipeMaterials(units[i]);
      const path = pathForMaterials(board, materials);
      if (path) {
        bestRecipeSize = recipeSize;
        candidates.push({ unit: units[i], path: path, materials: materials });
      }
    }
    return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
  }

  function findBlockIndex(board, id) {
    return board.findIndex(function (block) { return block && block.id === id; });
  }

  UB.Board = {
    applyGravity: applyGravity,
    applyGravityDetailed: applyGravityDetailed,
    baseCount: baseCount,
    countBaseUnits: countBaseUnits,
    createBaseBlock: createBaseBlock,
    createSpecialBlock: createSpecialBlock,
    findAvailableRecipe: findAvailableRecipe,
    findBlockIndex: findBlockIndex,
    generateBoard: generateBoard,
    isAdjacent: isAdjacent,
    neighbors: neighbors,
    pathForMaterials: pathForMaterials,
    rowCol: rowCol,
    resolveSize: resolveSize,
    shuffleRemaining: shuffleRemaining,
    squareRotationMap: squareRotationMap,
    toIndex: toIndex
  };
})(window.UnitBreaker = window.UnitBreaker || {});

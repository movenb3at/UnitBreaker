(function (UB) {
  'use strict';

  const superscripts = { '-4': '⁻⁴', '-3': '⁻³', '-2': '⁻²', '-1': '⁻¹', '0': '', '1': '¹', '2': '²', '3': '³', '4': '⁴' };

  function countRecipe(recipe) {
    return ['numerator', 'denominator'].reduce(function (total, role) {
      return total + Object.values(recipe[role] || {}).reduce(function (sum, count) { return sum + count; }, 0);
    }, 0);
  }

  function calculateDimension(assignments) {
    return assignments.reduce(function (vector, item) {
      if (!item.role) return vector;
      const base = UB.BASE_UNITS[item.unit].dimension;
      const sign = item.role === 'numerator' ? 1 : -1;
      return vector.map(function (value, index) { return value + base[index] * sign; });
    }, [0, 0, 0, 0, 0, 0, 0]);
  }

  function countAssignments(assignments, role) {
    return assignments.filter(function (item) { return item.role === role; }).reduce(function (counts, item) {
      counts[item.unit] = (counts[item.unit] || 0) + 1;
      return counts;
    }, {});
  }

  function sameCounts(actual, expected) {
    return UB.DIMENSION_ORDER.every(function (unit) { return (actual[unit] || 0) === (expected[unit] || 0); });
  }

  function vectorsEqual(a, b) {
    return a.length === b.length && a.every(function (value, index) { return value === b[index]; });
  }

  function findMatchingUnits(assignments) {
    if (!assignments.length || assignments.some(function (item) { return !item.role; })) return [];
    const dimension = calculateDimension(assignments);
    const numerator = countAssignments(assignments, 'numerator');
    const denominator = countAssignments(assignments, 'denominator');
    return Object.values(UB.DERIVED_UNITS).filter(function (unit) {
      const dimensionMatches = unit.gameCost || vectorsEqual(dimension, unit.dimension);
      return dimensionMatches && assignments.length === countRecipe(unit.recipe) &&
        sameCounts(numerator, unit.recipe.numerator) &&
        sameCounts(denominator, unit.recipe.denominator);
    });
  }

  function findMatchingUnit(assignments) {
    return findMatchingUnits(assignments)[0] || null;
  }

  function compactCounts(items) {
    return items.reduce(function (counts, unit) { counts[unit] = (counts[unit] || 0) + 1; return counts; }, {});
  }

  function formatProduct(counts) {
    const terms = UB.DIMENSION_ORDER.filter(function (unit) { return counts[unit]; }).map(function (unit) {
      const count = counts[unit];
      return unit + (superscripts[String(count)] || ('^' + count));
    });
    return terms.length ? terms.join('·') : '1';
  }

  function formatAssignments(assignments, mode) {
    const numerator = compactCounts(assignments.filter(function (item) { return item.role === 'numerator'; }).map(function (item) { return item.unit; }));
    const denominator = compactCounts(assignments.filter(function (item) { return item.role === 'denominator'; }).map(function (item) { return item.unit; }));
    if (mode === 'fraction') {
      const denominatorText = formatProduct(denominator);
      return denominatorText === '1' ? formatProduct(numerator) : formatProduct(numerator) + ' / ' + denominatorText;
    }
    const vector = calculateDimension(assignments);
    const terms = [];
    UB.DIMENSION_ORDER.forEach(function (unit, index) {
      const exponent = vector[index];
      if (exponent !== 0) terms.push(unit + (superscripts[String(exponent)] || ('^' + exponent)));
    });
    return terms.length ? terms.join('·') : '1';
  }

  function recipeMaterials(unit) {
    const materials = [];
    ['numerator', 'denominator'].forEach(function (role) {
      Object.keys(unit.recipe[role]).forEach(function (symbol) {
        for (let i = 0; i < unit.recipe[role][symbol]; i += 1) materials.push({ unit: symbol, role: role });
      });
    });
    return materials;
  }

  UB.UnitSystem = {
    calculateDimension: calculateDimension,
    countRecipe: countRecipe,
    findMatchingUnit: findMatchingUnit,
    findMatchingUnits: findMatchingUnits,
    formatAssignments: formatAssignments,
    formatProduct: formatProduct,
    recipeMaterials: recipeMaterials,
    vectorsEqual: vectorsEqual
  };
})(window.UnitBreaker = window.UnitBreaker || {});

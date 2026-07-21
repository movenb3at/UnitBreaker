(function (UB) {
  'use strict';

  UB.BOARD_SIZE = 15;
  UB.DIMENSION_ORDER = ['kg', 'm', 's', 'A', 'K', 'mol', 'cd'];
  UB.DIFFICULTIES = {
    easy: { label: '쉬움', boardSize: 5, initialBlocks: 25, seconds: 600, hints: 7 },
    normal: { label: '보통', boardSize: 10, initialBlocks: 100, seconds: 480, hints: 5 },
    hard: { label: '어려움', boardSize: 15, initialBlocks: 225, seconds: 360, hints: 3 }
  };
  UB.DIFFICULTY_SECONDS = { easy: 600, normal: 480, hard: 360 };
  UB.bonusItemThreshold = function (term) {
    const n = Math.max(1, Math.floor(term || 1));
    return 3 + n * (n - 1);
  };
  UB.BASE_UNIT_WEIGHTS = { m: 24, s: 22, kg: 18, A: 12, K: 10, mol: 8, cd: 6 };

  UB.BASE_UNITS = {
    kg: { symbol: 'kg', unitName: '킬로그램', quantity: '질량', dimension: [1, 0, 0, 0, 0, 0, 0] },
    m: { symbol: 'm', unitName: '미터', quantity: '길이', dimension: [0, 1, 0, 0, 0, 0, 0] },
    s: { symbol: 's', unitName: '초', quantity: '시간', dimension: [0, 0, 1, 0, 0, 0, 0] },
    A: { symbol: 'A', unitName: '암페어', quantity: '전류', dimension: [0, 0, 0, 1, 0, 0, 0] },
    K: { symbol: 'K', unitName: '켈빈', quantity: '열역학적 온도', dimension: [0, 0, 0, 0, 1, 0, 0] },
    mol: { symbol: 'mol', unitName: '몰', quantity: '물질량', dimension: [0, 0, 0, 0, 0, 1, 0] },
    cd: { symbol: 'cd', unitName: '칸델라', quantity: '광도', dimension: [0, 0, 0, 0, 0, 0, 1] }
  };

  UB.DERIVED_UNITS = {
    Hz: {
      id: 'hertz', nameKo: '헤르츠', nameEn: 'hertz', symbol: 'Hz', quantity: '주파수',
      dimension: [0, 0, -1, 0, 0, 0, 0], recipe: { numerator: {}, denominator: { s: 1 } },
      abilityId: 'vibrationWave', description: '상하좌우 2칸으로 진동 파동을 보내며, 같은 단위가 이어지면 파동이 더 전파됩니다.',
      realUse: '소리의 진동수와 화면 주사율을 나타낼 때 사용합니다.'
    },
    N: {
      id: 'newton', nameKo: '뉴턴', nameEn: 'newton', symbol: 'N', quantity: '힘',
      dimension: [1, 1, -2, 0, 0, 0, 0], recipe: { numerator: { kg: 1, m: 1 }, denominator: { s: 2 } },
      abilityId: 'pushLine', description: '선택한 방향으로 최대 7칸의 블록을 밀어 경계의 블록을 제거합니다.',
      realUse: '물체에 작용하는 힘을 나타냅니다.'
    },
    Pa: {
      id: 'pascal', nameKo: '파스칼', nameEn: 'pascal', symbol: 'Pa', quantity: '압력',
      dimension: [1, -1, -2, 0, 0, 0, 0], recipe: { numerator: { kg: 1 }, denominator: { m: 1, s: 2 } },
      abilityId: 'pressurePull', description: '십자 방향 3칸의 블록을 중앙으로 압축하고 가까운 블록을 제거합니다.',
      realUse: '기체·액체의 압력과 재료의 응력을 나타냅니다.'
    },
    J: {
      id: 'joule', nameKo: '줄', nameEn: 'joule', symbol: 'J', quantity: '에너지',
      dimension: [1, 2, -2, 0, 0, 0, 0], recipe: { numerator: { kg: 1, m: 2 }, denominator: { s: 2 } },
      abilityId: 'areaBlast', description: '중심 3×3 범위의 기본단위 블록을 한꺼번에 제거합니다.',
      realUse: '일, 열, 에너지의 크기를 나타냅니다.'
    },
    W: {
      id: 'watt', nameKo: '와트', nameEn: 'watt', symbol: 'W', quantity: '전력·일률',
      dimension: [1, 2, -3, 0, 0, 0, 0], recipe: { numerator: { kg: 1, m: 2 }, denominator: { s: 3 } },
      abilityId: 'pulseClear', description: '3×3 범위에 0.4초 간격으로 세 번의 에너지 펄스를 보냅니다.',
      realUse: '단위 시간에 전달되는 에너지의 비율을 나타냅니다.'
    },
    C: {
      id: 'coulomb', nameKo: '쿨롬', nameEn: 'coulomb', symbol: 'C', quantity: '전하량',
      dimension: [0, 0, 1, 1, 0, 0, 0], recipe: { numerator: { A: 1, s: 1 }, denominator: {} },
      abilityId: 'chargeAttract', description: '가장 가까운 같은 종류의 블록을 최대 6개 끌어당깁니다.',
      realUse: '전하의 양을 나타냅니다.'
    },
    V: {
      id: 'volt', nameKo: '볼트', nameEn: 'volt', symbol: 'V', quantity: '전위·전압',
      dimension: [1, 2, -3, -1, 0, 0, 0], recipe: { numerator: { kg: 1, m: 2 }, denominator: { s: 3, A: 1 } },
      abilityId: 'electricPath', description: '두 번째 지점까지 꺾인 최단 전기 경로를 만들고 경로의 블록을 제거합니다.',
      realUse: '두 지점 사이의 전위차를 나타냅니다.'
    },
    F: {
      id: 'farad', nameKo: '패럿', nameEn: 'farad', symbol: 'F', quantity: '전기 용량',
      dimension: [-1, -2, 4, 2, 0, 0, 0], recipe: { numerator: { s: 4, A: 2 }, denominator: { kg: 1, m: 2 } },
      abilityId: 'capacitorDischarge', description: '5×5 범위에 전하를 축적한 뒤 최대 8개의 블록을 방전으로 제거합니다.',
      realUse: '커패시터가 저장할 수 있는 전하량을 나타냅니다.'
    },
    'Ω': {
      id: 'ohm', nameKo: '옴', nameEn: 'ohm', symbol: 'Ω', quantity: '전기 저항',
      dimension: [1, 2, -3, -2, 0, 0, 0], recipe: { numerator: { kg: 1, m: 2 }, denominator: { s: 3, A: 2 } },
      abilityId: 'resistanceLine', description: '행 또는 열을 골라 한 칸씩 건너뛰며 최대 8개를 제거합니다.',
      realUse: '전류의 흐름을 방해하는 전기 저항을 나타냅니다.'
    },
    S: {
      id: 'siemens', nameKo: '지멘스', nameEn: 'siemens', symbol: 'S', quantity: '전기 전도도',
      dimension: [-1, -2, 3, 2, 0, 0, 0], recipe: { numerator: { s: 3, A: 2 }, denominator: { kg: 1, m: 2 } },
      abilityId: 'conductiveCross', description: '가로·세로 전도 경로를 열어 최대 10개의 기본단위 블록을 제거합니다.',
      realUse: '전기가 얼마나 잘 흐르는지를 나타내며 옯의 역수입니다.'
    },
    Wb: {
      id: 'weber', nameKo: '웨버', nameEn: 'weber', symbol: 'Wb', quantity: '자기 선속',
      dimension: [1, 2, -2, -1, 0, 0, 0], recipe: { numerator: { kg: 1, m: 2 }, denominator: { s: 2, A: 1 } },
      abilityId: 'fluxRotate', description: '주변 5×5 블록을 회전시키고 4개 이상 연결된 같은 단위를 제거합니다.',
      realUse: '어떤 면을 통과하는 자기장의 총량을 나타냅니다.'
    },
    T: {
      id: 'tesla', nameKo: '테슬라', nameEn: 'tesla', symbol: 'T', quantity: '자기 선속 밀도',
      dimension: [1, 0, -2, -1, 0, 0, 0], recipe: { numerator: { kg: 1 }, denominator: { s: 2, A: 1 } },
      abilityId: 'magneticGather', description: '지정한 기본단위를 7×7 범위에서 모아 4개 이상이면 제거합니다.',
      realUse: '자기장의 세기를 나타내는 데 사용합니다.'
    },
    H: {
      id: 'henry', nameKo: '헨리', nameEn: 'henry', symbol: 'H', quantity: '인덕턴스',
      dimension: [1, 2, -2, -2, 0, 0, 0], recipe: { numerator: { kg: 1, m: 2 }, denominator: { s: 2, A: 2 } },
      abilityId: 'inductionLoop', description: '5×5 영역의 가장자리에 유도 고리를 만들어 루프 위 블록을 제거합니다.',
      realUse: '코일이 전류 변화에 맞서 유도 기전력을 만드는 정도를 나타냅니다.'
    },
    lm: {
      id: 'lumen', nameKo: '루멘', nameEn: 'lumen', symbol: 'lm', quantity: '광선속',
      dimension: [0, 0, 0, 0, 0, 0, 1], recipe: { numerator: { cd: 3 }, denominator: {} }, gameCost: true,
      abilityId: 'revealLight', description: '숨겨진 보너스를 공개하고 임의의 기본단위 블록 5개를 제거합니다.',
      realUse: '광원이 내보내는 가시광선의 총량을 나타냅니다.',
      scienceNote: '게임 균형을 위해 칸델라 3개를 제작 재료로 사용합니다. 루멘과 칸델라는 같은 물리량이 아니며, 루멘은 광선속의 단위입니다.'
    },
    lx: {
      id: 'lux', nameKo: '럭스', nameEn: 'lux', symbol: 'lx', quantity: '조도',
      dimension: [0, -2, 0, 0, 0, 0, 1], recipe: { numerator: { cd: 1 }, denominator: { m: 2 } },
      abilityId: 'illuminateArea', description: '5×5 영역의 블록을 50% 확률로 제거하고 생존 블록을 5초간 밝힙니다.',
      realUse: '어떤 면이 받는 빛의 밝기인 조도를 나타냅니다.'
    },
    Bq: {
      id: 'becquerel', nameKo: '베크렐', nameEn: 'becquerel', symbol: 'Bq', quantity: '방사성 핵종의 활성도',
      dimension: [0, 0, -1, 0, 0, 0, 0], recipe: { numerator: {}, denominator: { s: 1 } },
      abilityId: 'decayScatter', description: '방사성 붕괴를 일으켜 보드 전체의 임의 블록 3개를 순차적으로 제거합니다.',
      realUse: '방사성 핵종이 1초에 붕괴하는 횟수를 나타냅니다.'
    },
    Gy: {
      id: 'gray', nameKo: '그레이', nameEn: 'gray', symbol: 'Gy', quantity: '흡수 선량',
      dimension: [0, 2, -2, 0, 0, 0, 0], recipe: { numerator: { m: 2 }, denominator: { s: 2 } },
      abilityId: 'absorbedDose', description: '5×5 범위에 선량을 흡수시켜 중심에서 가까운 블록을 최대 10개 제거합니다.',
      realUse: '물질 1 kg이 흡수한 방사선 에너지를 나타냅니다.'
    },
    Sv: {
      id: 'sievert', nameKo: '시버트', nameEn: 'sievert', symbol: 'Sv', quantity: '선량 당량',
      dimension: [0, 2, -2, 0, 0, 0, 0], recipe: { numerator: { m: 2 }, denominator: { s: 2 } },
      abilityId: 'equivalentDose', description: '7×7 범위에서 가장 많은 종류의 기본단위 블록을 선량 가중치로 제거합니다.',
      realUse: '방사선의 종류와 인체 영향을 고려한 선량을 나타냅니다.'
    },
    kat: {
      id: 'katal', nameKo: '카탈', nameEn: 'katal', symbol: 'kat', quantity: '촉매 활성도',
      dimension: [0, 0, -1, 0, 0, 1, 0], recipe: { numerator: { mol: 1 }, denominator: { s: 1 } },
      abilityId: 'catalyticReaction', description: '주변에서 가장 많은 기본단위를 촉매로 연쇄 반응시켜 최대 6개 제거합니다.',
      realUse: '촉매가 1초에 변환하는 물질의 양을 나타냅니다.'
    }
  };
})(window.UnitBreaker = window.UnitBreaker || {});

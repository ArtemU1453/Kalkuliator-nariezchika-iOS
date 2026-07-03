const MAX_BIG_ROLL_LENGTH_M = 22000;
const RANGE_MATERIAL_WIDTH = [550, 910] as const;
const RANGE_ROLL_WIDTH = [20, 310] as const;
const RANGE_ROLL_LENGTH = [30, 1100] as const;
const MAX_ROLL_WIDTH_REDUCTION = 0.03;
const SETUP_LENGTH_M = 10;

function _cycles_per_hour_by_width(roll_width_mm: number) {
  if (roll_width_mm >= 25 && roll_width_mm < 45) return 11;
  if (roll_width_mm >= 45 && roll_width_mm <= 150) return 12;
  return null;
}

function _cycles_per_hour_by_length(roll_length_m: number) {
  if (roll_length_m <= 300) return 12;
  if (roll_length_m <= 450) return 11;
  if (roll_length_m <= 600) return 10;
  return 8;
}

function _apply_roll_width_adjustment(useful_width_mm: number, roll_width_mm: number) {
  let main_count = Math.floor(useful_width_mm / roll_width_mm);
  let remaining_width = useful_width_mm - main_count * roll_width_mm;

  if (remaining_width < RANGE_ROLL_WIDTH[0] || remaining_width > RANGE_ROLL_WIDTH[1]) {
    return { roll_width_mm, main_count, remaining_width, was_adjusted: false };
  }

  if (main_count < 1) {
    return { roll_width_mm, main_count, remaining_width, was_adjusted: false };
  }

  const min_width = roll_width_mm * (1 - MAX_ROLL_WIDTH_REDUCTION);
  const width_needed = useful_width_mm / (main_count + 1);

  if (width_needed >= min_width && width_needed >= RANGE_ROLL_WIDTH[0] && width_needed <= RANGE_ROLL_WIDTH[1]) {
    const adjusted_width = Math.round(width_needed * 10) / 10;
    if (adjusted_width < min_width) {
      return { roll_width_mm, main_count, remaining_width, was_adjusted: false };
    }
    const adjusted_count = main_count + 1;
    let adjusted_remaining = useful_width_mm - adjusted_count * adjusted_width;
    if (Math.abs(adjusted_remaining) < 1e-6) {
      adjusted_remaining = 0;
    }
    return { roll_width_mm: adjusted_width, main_count: adjusted_count, remaining_width: adjusted_remaining, was_adjusted: true };
  }

  return { roll_width_mm, main_count, remaining_width, was_adjusted: false };
}

function _validate_inputs(
  material_width_mm: number,
  useful_width_mm: number,
  roll_width_mm: number,
  roll_length_m: number,
  big_roll_length_m: number,
) {
  if (material_width_mm < RANGE_MATERIAL_WIDTH[0] || material_width_mm > RANGE_MATERIAL_WIDTH[1]) {
    throw new Error("Ширина материала должна быть от 550 до 910 мм.");
  }
  if (useful_width_mm > material_width_mm) {
    throw new Error("Полезная ширина не может быть больше общей.");
  }
  if (roll_width_mm < RANGE_ROLL_WIDTH[0] || roll_width_mm > RANGE_ROLL_WIDTH[1]) {
    throw new Error("Ширина рулона должна быть от 20 до 310 мм.");
  }
  if (roll_length_m < RANGE_ROLL_LENGTH[0] || roll_length_m > RANGE_ROLL_LENGTH[1]) {
    throw new Error("Длина рулона должна быть от 30 до 1100 м.");
  }
  if (big_roll_length_m <= 0 || big_roll_length_m > MAX_BIG_ROLL_LENGTH_M) {
    throw new Error("Намотка Джамба должна быть от 1 до 22000 м.");
  }
  if (big_roll_length_m < roll_length_m) {
    throw new Error("Намотка Джамба должна быть не меньше длины рулона.");
  }
}

export type CalcResult = {
  material_width_mm: number;
  useful_width_mm: number;
  roll_width_input_mm: number;
  roll_width_mm: number;
  roll_length_m: number;
  big_roll_length_m: number;
  order_rolls: number;
  main_count: number;
  remaining_width_mm: number;
  additional_width_mm: number | null;
  was_adjusted: boolean;
  rolls_per_cycle: number;
  cycles_needed: number;
  cycles_used: number;
  cycles_per_hour: number | null;
  estimated_hours: number | null;
  used_length_m: number;
  length_count: number;
  length_waste_m: number;
  total_main_rolls: number;
  total_additional_rolls: number;
  total_rolls: number;
  surplus_rolls: number;
  surplus_main_rolls: number;
  surplus_additional_rolls: number;
  shortage_rolls: number;
  total_area_m2: number;
  useful_area_m2: number;
  waste_area_m2: number;
  waste_percent: number;
  waste_per_side_mm: number;
  inner_waste_mm: number;
  remaining_jumbo_m: number;
  shortage_cycles: number;
  shortage_length_m: number;
};

export function calculate(
  material_width_mm: number,
  useful_width_mm: number,
  roll_width_mm: number,
  roll_length_m: number,
  big_roll_length_m: number,
  order_rolls: number,
  additional_width_mm: number | null = null,
): CalcResult {
  _validate_inputs(
    material_width_mm,
    useful_width_mm,
    roll_width_mm,
    roll_length_m,
    big_roll_length_m,
  );

  if (!order_rolls || order_rolls <= 0) {
    throw new Error("Количество рулонов в заказе должно быть больше нуля.");
  }
  order_rolls = Math.floor(order_rolls);

  const roll_width_input_mm = roll_width_mm;
  let additional_width_override: number | null = null;
  if (additional_width_mm !== null) {
    additional_width_override = Number(additional_width_mm);
    if (isNaN(additional_width_override)) {
      throw new Error("Некорректный доп. размер.");
    }
    if (additional_width_override <= 0) {
      additional_width_override = null;
    } else if (additional_width_override < RANGE_ROLL_WIDTH[0] || additional_width_override > RANGE_ROLL_WIDTH[1]) {
      throw new Error("Доп. размер должен быть от 20 до 310 мм.");
    }
  }

  let main_count = 0;
  let remaining_width = 0;
  let was_adjusted = false;

  if (additional_width_override === null) {
    const adj = _apply_roll_width_adjustment(useful_width_mm, roll_width_mm);
    roll_width_mm = adj.roll_width_mm;
    main_count = adj.main_count;
    remaining_width = adj.remaining_width;
    was_adjusted = adj.was_adjusted;
  } else {
    main_count = Math.floor(useful_width_mm / roll_width_mm);
    remaining_width = useful_width_mm - main_count * roll_width_mm;
    was_adjusted = false;
  }

  let additional_width: number | null = null;
  if (additional_width_override !== null) {
    if (additional_width_override - remaining_width > 1e-6) {
      throw new Error(
        `Доп. размер ${additional_width_override.toFixed(1)} мм больше остатка ${remaining_width.toFixed(1)} мм.`
      );
    }
    additional_width = additional_width_override;
  } else if (!was_adjusted && remaining_width >= RANGE_ROLL_WIDTH[0] && remaining_width <= RANGE_ROLL_WIDTH[1]) {
    additional_width = remaining_width;
  }

  const available_length_m = big_roll_length_m - SETUP_LENGTH_M;
  if (available_length_m < roll_length_m) {
    throw new Error("Недостаточная длина большого рулона с учетом 10 м расхода.");
  }

  const length_count = Math.floor(available_length_m / roll_length_m);
  const length_waste_m = available_length_m - length_count * roll_length_m;

  if (main_count <= 0) {
    throw new Error("Недостаточно ширины для нарезки рулонов.");
  }

  const rolls_per_cycle = main_count;
  const cycles_needed = Math.ceil(order_rolls / main_count);
  const cycles_used = Math.min(cycles_needed, length_count);

  const width_rate = _cycles_per_hour_by_width(roll_width_mm);
  const length_rate = _cycles_per_hour_by_length(roll_length_m);
  
  let cycles_per_hour: number | null = null;
  if (width_rate === null) {
    cycles_per_hour = length_rate;
  } else {
    cycles_per_hour = Math.min(width_rate, length_rate);
  }
  
  const estimated_hours = cycles_per_hour ? cycles_needed / cycles_per_hour : null;

  const total_main_rolls = main_count * cycles_used;
  const total_additional_rolls = additional_width ? cycles_used : 0;
  const total_rolls = total_main_rolls + total_additional_rolls;

  const surplus_main_rolls = Math.max(0, total_main_rolls - order_rolls);
  const surplus_additional_rolls = additional_width ? total_additional_rolls : 0;
  const surplus_rolls = surplus_main_rolls + surplus_additional_rolls;
  const shortage_rolls = Math.max(0, order_rolls - total_main_rolls);

  let used_length_m = cycles_used * roll_length_m + SETUP_LENGTH_M;
  
  // Calculate exact remaining jumbo before shortage logic overwrites used_length_m
  const remaining_jumbo_m = Math.max(0, big_roll_length_m - used_length_m);
  const shortage_cycles = Math.max(0, cycles_needed - cycles_used);
  const shortage_length_m = shortage_cycles * roll_length_m;

  if (shortage_rolls > 0) {
    used_length_m = big_roll_length_m;
  }

  const total_area_m2 = (material_width_mm / 1000) * used_length_m;
  const useful_width_sum_mm = main_count * roll_width_mm + (additional_width || 0);
  const useful_area_m2 = (useful_width_sum_mm / 1000) * (cycles_used * roll_length_m);
  const waste_area_m2 = total_area_m2 - useful_area_m2;
  const waste_percent = total_area_m2 > 0 ? (waste_area_m2 / total_area_m2) * 100 : 0;

  // Истинный физический отход по кромкам (неиспользованная ширина делится пополам)
  const total_waste_width_mm = material_width_mm - useful_width_sum_mm;
  const waste_per_side_mm = total_waste_width_mm > 0 ? total_waste_width_mm / 2 : 0;
  
  const inner_waste_mm = 0; // Внутренний отход поглощается кромками при центровке

  return {
    material_width_mm,
    useful_width_mm,
    roll_width_input_mm,
    roll_width_mm,
    roll_length_m,
    big_roll_length_m,
    order_rolls,
    main_count,
    remaining_width_mm: remaining_width,
    additional_width_mm: additional_width,
    was_adjusted,
    rolls_per_cycle,
    cycles_needed,
    cycles_used,
    cycles_per_hour,
    estimated_hours,
    used_length_m,
    length_count,
    length_waste_m,
    total_main_rolls,
    total_additional_rolls,
    total_rolls,
    surplus_rolls,
    surplus_main_rolls,
    surplus_additional_rolls,
    shortage_rolls,
    total_area_m2: Math.round(total_area_m2 * 10) / 10,
    useful_area_m2: Math.round(useful_area_m2 * 10) / 10,
    waste_area_m2: Math.round(waste_area_m2 * 10) / 10,
    waste_percent: Math.round(waste_percent * 10) / 10,
    waste_per_side_mm,
    inner_waste_mm: Math.round(inner_waste_mm * 10) / 10,
    remaining_jumbo_m,
    shortage_cycles,
    shortage_length_m,
  };
}

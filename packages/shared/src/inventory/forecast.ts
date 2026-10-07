export interface DemandDay {
  date: string;
  quantity: number;
}
const DAY = 86_400_000;
const dateOf = (date: Date) => date.toISOString().slice(0, 10);

/** Calendar-day zeros count toward demand. Input dates are business dates, not UTC timestamps. */
export function forecastDemand(
  history: DemandDay[],
  asOf: string,
  horizon: number,
) {
  if (![7, 14, 30].includes(horizon))
    throw new Error('Unsupported forecast horizon');
  const today = new Date(asOf + 'T00:00:00Z');
  if (!Number.isFinite(today.getTime()))
    throw new Error('Invalid business date');
  const valid = history.filter(
    (row) =>
      row.date < asOf && Number.isFinite(row.quantity) && row.quantity >= 0,
  );
  const earliest = valid.map((row) => row.date).sort()[0];
  const historyDays = earliest
    ? Math.min(
        56,
        Math.max(
          0,
          Math.round(
            (today.getTime() - Date.parse(earliest + 'T00:00:00Z')) / DAY,
          ),
        ),
      )
    : 0;
  const quantities = new Map<string, number>();
  valid.forEach((row) =>
    quantities.set(row.date, (quantities.get(row.date) ?? 0) + row.quantity),
  );
  const method = historyDays >= 28 ? 'weekday_8_weeks' : 'trailing_14_days';
  const samples = Array.from(
    { length: method === 'weekday_8_weeks' ? Math.min(historyDays, 56) : 14 },
    (_, index) => {
      const date = new Date(today.getTime() - (index + 1) * DAY);
      return {
        weekday: date.getUTCDay(),
        quantity: quantities.get(dateOf(date)) ?? 0,
      };
    },
  );
  const mean = samples.length
    ? samples.reduce((sum, row) => sum + row.quantity, 0) / samples.length
    : 0;
  const daily = Array.from({ length: horizon }, (_, index) => {
    const date = new Date(today.getTime() + (index + 1) * DAY);
    const matches = samples.filter((row) => row.weekday === date.getUTCDay());
    return {
      date: dateOf(date),
      quantity:
        method === 'weekday_8_weeks' && matches.length
          ? matches.reduce((sum, row) => sum + row.quantity, 0) / matches.length
          : mean,
    };
  });
  return {
    demand: daily.reduce((sum, row) => sum + row.quantity, 0),
    daily,
    method,
    historyDays,
    sparse: historyDays < 28,
  };
}

export function replenishment(input: {
  dailyDemand: number;
  available: number;
  incoming: number;
  minStock: number;
  maxStock?: number | null;
  leadDays: number;
  safetyDays: number;
  reviewDays: number;
  packSize: number;
  minPacks: number;
}) {
  if (
    Object.values(input).some(
      (value) =>
        typeof value === 'number' && (!Number.isFinite(value) || value < 0),
    )
  )
    throw new Error('Invalid replenishment settings');
  if (input.packSize <= 0) throw new Error('Pack size must be positive');
  const point = Math.max(
    input.minStock,
    input.dailyDemand * (input.leadDays + input.safetyDays),
  );
  const target = Math.max(
    point,
    input.dailyDemand * (input.leadDays + input.safetyDays + input.reviewDays),
  );
  const position = input.available + input.incoming;
  const packs =
    position <= point
      ? Math.max(
          input.minPacks,
          Math.ceil(Math.max(0, target - position) / input.packSize),
        )
      : 0;
  return {
    reorder: target > position ? packs * input.packSize : 0,
    excess: Math.max(0, position - (input.maxStock ?? target)),
    point,
    target,
  };
}

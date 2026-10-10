/**
 * A minimal 5-field cron expression parser (minute hour day-of-month month
 * day-of-week), supporting star, stepped-star, lists (a,b), ranges (a-b) and
 * stepped ranges (a-b/n). Semantic quirks are kept simple on purpose:
 * day-of-month and day-of-week combine as a union when both are restricted
 * (the common vixie-cron reading), and next-fire search is a bounded minute
 * walk from now.
 *
 * @module qwen-loop/cron
 */

export interface ParsedCron {
  readonly minutes: ReadonlySet<number>
  readonly hours: ReadonlySet<number>
  readonly daysOfMonth: ReadonlySet<number>
  readonly months: ReadonlySet<number>
  readonly daysOfWeek: ReadonlySet<number>
  readonly dayOfMonthRestricted: boolean
  readonly dayOfWeekRestricted: boolean
}

const parseField = (field: string, min: number, max: number): Set<number> => {
  const values = new Set<number>()
  for (const part of field.split(',')) {
    const [rangePart, stepPart] = part.split('/')
    const step = stepPart === undefined ? 1 : Number(stepPart)
    if (!Number.isInteger(step) || step < 1) throw new Error(`非法步长 "${part}"`)
    let lo = min
    let hi = max
    if (rangePart !== undefined && rangePart !== '*') {
      const dash = rangePart.indexOf('-')
      if (dash >= 0) {
        lo = Number(rangePart.slice(0, dash))
        hi = Number(rangePart.slice(dash + 1))
      } else {
        lo = Number(rangePart)
        hi = stepPart === undefined ? lo : max
      }
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) {
      throw new Error(`字段值越界 "${part}"`)
    }
    for (let value = lo; value <= hi; value += step) values.add(value)
  }
  if (values.size === 0) throw new Error(`字段为空`)
  return values
}

/** Parse and validate a cron expression; throws with a readable message. */
export function parseCron(expression: string): ParsedCron {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) throw new Error('cron 表达式需要 5 个字段（分 时 日 月 周）')
  const minutes = parseField(fields[0]!, 0, 59)
  const hours = parseField(fields[1]!, 0, 23)
  const daysOfMonth = parseField(fields[2]!, 1, 31)
  const months = parseField(fields[3]!, 1, 12)
  // vixie-cron: 0 and 7 both name Sunday.
  const daysOfWeek = new Set<number>([...parseField(fields[4]!, 0, 7)].map(day => day % 7))
  return {
    minutes, hours, daysOfMonth, months, daysOfWeek,
    dayOfMonthRestricted: fields[2] !== '*',
    dayOfWeekRestricted: fields[4] !== '*',
  }
}

/**
 * The next fire time strictly after `after`, minute-resolution. Returns
 * `null` when no matching minute exists within 366 days (an impossible
 * expression like Feb 30).
 */
export function nextFire(cron: ParsedCron, after: number): number | null {
  const cursor = new Date(after)
  cursor.setSeconds(0, 0)
  cursor.setMinutes(cursor.getMinutes() + 1)
  for (let step = 0; step < 366 * 24 * 60; step++) {
    if (!cron.months.has(cursor.getMonth() + 1)) {
      // Jump to the first day of the next month, minute zero.
      cursor.setMonth(cursor.getMonth() + 1, 1)
      cursor.setHours(0, 0, 0, 0)
      continue
    }
    const dateOk = cron.daysOfMonth.has(cursor.getDate())
    const weekOk = cron.daysOfWeek.has(cursor.getDay())
    const dayOk = cron.dayOfMonthRestricted && cron.dayOfWeekRestricted
      ? dateOk || weekOk
      : cron.dayOfMonthRestricted ? dateOk : cron.dayOfWeekRestricted ? weekOk : true
    if (dayOk && cron.hours.has(cursor.getHours()) && cron.minutes.has(cursor.getMinutes())) {
      return cursor.getTime()
    }
    cursor.setMinutes(cursor.getMinutes() + 1)
  }
  return null
}

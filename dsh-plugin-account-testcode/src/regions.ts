/**
 * The 「可用国家与地区」 catalog and the exit-region probe behind the
 * sign-in geo gate.
 *
 * The dropdown offers every sovereign state plus the one separately listed
 * region written in the 「所属/地区」 convention (`中国/台湾`). Mainland China
 * and the two special administrative regions are deliberately NOT selectable
 * (`中国` / `中国/香港` / `中国/澳门`), so an exit inside any of them matches
 * nothing and every sign-in is refused. Options are keyed by ISO 3166-1
 * alpha-2, and the probe compares the very same codes — no name-drift between
 * what the service answers and what the list shows.
 *
 * The probe asks a public IP-echo service what the outside world sees as this
 * machine's exit: ip-api.com first (answers `countryCode`, free tier), then
 * ipapi.co as the fallback. Detection happens once per plugin load; a failed
 * probe leaves the gate open (nothing to compare against) and the status line
 * says so.
 */

/** One dropdown choice: the stored ISO code and its visible Chinese label. */
export interface RegionOption {
  value: string
  label: string
}

/** The selectable catalog, in ISO code order — mainline China and the two
 *  SARs excluded on purpose (see the module docblock). */
export const REGIONS: readonly RegionOption[] = [
  { value: 'AD', label: '安道尔' },
  { value: 'AE', label: '阿联酋' },
  { value: 'AF', label: '阿富汗' },
  { value: 'AG', label: '安提瓜和巴布达' },
  { value: 'AL', label: '阿尔巴尼亚' },
  { value: 'AM', label: '亚美尼亚' },
  { value: 'AO', label: '安哥拉' },
  { value: 'AR', label: '阿根廷' },
  { value: 'AT', label: '奥地利' },
  { value: 'AU', label: '澳大利亚' },
  { value: 'AZ', label: '阿塞拜疆' },
  { value: 'BA', label: '波黑' },
  { value: 'BB', label: '巴巴多斯' },
  { value: 'BD', label: '孟加拉国' },
  { value: 'BE', label: '比利时' },
  { value: 'BF', label: '布基纳法索' },
  { value: 'BG', label: '保加利亚' },
  { value: 'BH', label: '巴林' },
  { value: 'BI', label: '布隆迪' },
  { value: 'BJ', label: '贝宁' },
  { value: 'BN', label: '文莱' },
  { value: 'BO', label: '玻利维亚' },
  { value: 'BR', label: '巴西' },
  { value: 'BS', label: '巴哈马' },
  { value: 'BT', label: '不丹' },
  { value: 'BW', label: '博茨瓦纳' },
  { value: 'BY', label: '白俄罗斯' },
  { value: 'BZ', label: '伯利兹' },
  { value: 'CA', label: '加拿大' },
  { value: 'CD', label: '刚果（金）' },
  { value: 'CF', label: '中非' },
  { value: 'CG', label: '刚果（布）' },
  { value: 'CH', label: '瑞士' },
  { value: 'CI', label: '科特迪瓦' },
  { value: 'CL', label: '智利' },
  { value: 'CM', label: '喀麦隆' },
  { value: 'CO', label: '哥伦比亚' },
  { value: 'CR', label: '哥斯达黎加' },
  { value: 'CU', label: '古巴' },
  { value: 'CV', label: '佛得角' },
  { value: 'CY', label: '塞浦路斯' },
  { value: 'CZ', label: '捷克' },
  { value: 'DE', label: '德国' },
  { value: 'DJ', label: '吉布提' },
  { value: 'DK', label: '丹麦' },
  { value: 'DM', label: '多米尼克' },
  { value: 'DO', label: '多米尼加' },
  { value: 'DZ', label: '阿尔及利亚' },
  { value: 'EC', label: '厄瓜多尔' },
  { value: 'EE', label: '爱沙尼亚' },
  { value: 'EG', label: '埃及' },
  { value: 'ER', label: '厄立特里亚' },
  { value: 'ES', label: '西班牙' },
  { value: 'ET', label: '埃塞俄比亚' },
  { value: 'FI', label: '芬兰' },
  { value: 'FJ', label: '斐济' },
  { value: 'FM', label: '密克罗尼西亚联邦' },
  { value: 'FR', label: '法国' },
  { value: 'GA', label: '加蓬' },
  { value: 'GB', label: '英国' },
  { value: 'GD', label: '格林纳达' },
  { value: 'GE', label: '格鲁吉亚' },
  { value: 'GH', label: '加纳' },
  { value: 'GM', label: '冈比亚' },
  { value: 'GN', label: '几内亚' },
  { value: 'GQ', label: '赤道几内亚' },
  { value: 'GR', label: '希腊' },
  { value: 'GT', label: '危地马拉' },
  { value: 'GW', label: '几内亚比绍' },
  { value: 'GY', label: '圭亚那' },
  { value: 'HN', label: '洪都拉斯' },
  { value: 'HR', label: '克罗地亚' },
  { value: 'HT', label: '海地' },
  { value: 'HU', label: '匈牙利' },
  { value: 'ID', label: '印度尼西亚' },
  { value: 'IE', label: '爱尔兰' },
  { value: 'IL', label: '以色列' },
  { value: 'IN', label: '印度' },
  { value: 'IQ', label: '伊拉克' },
  { value: 'IR', label: '伊朗' },
  { value: 'IS', label: '冰岛' },
  { value: 'IT', label: '意大利' },
  { value: 'JM', label: '牙买加' },
  { value: 'JO', label: '约旦' },
  { value: 'JP', label: '日本' },
  { value: 'KE', label: '肯尼亚' },
  { value: 'KG', label: '吉尔吉斯斯坦' },
  { value: 'KH', label: '柬埔寨' },
  { value: 'KI', label: '基里巴斯' },
  { value: 'KM', label: '科摩罗' },
  { value: 'KN', label: '圣基茨和尼维斯' },
  { value: 'KP', label: '朝鲜' },
  { value: 'KR', label: '韩国' },
  { value: 'KW', label: '科威特' },
  { value: 'KZ', label: '哈萨克斯坦' },
  { value: 'LA', label: '老挝' },
  { value: 'LB', label: '黎巴嫩' },
  { value: 'LC', label: '圣卢西亚' },
  { value: 'LI', label: '列支敦士登' },
  { value: 'LK', label: '斯里兰卡' },
  { value: 'LR', label: '利比里亚' },
  { value: 'LS', label: '莱索托' },
  { value: 'LT', label: '立陶宛' },
  { value: 'LU', label: '卢森堡' },
  { value: 'LV', label: '拉脱维亚' },
  { value: 'LY', label: '利比亚' },
  { value: 'MA', label: '摩洛哥' },
  { value: 'MC', label: '摩纳哥' },
  { value: 'MD', label: '摩尔多瓦' },
  { value: 'ME', label: '黑山' },
  { value: 'MG', label: '马达加斯加' },
  { value: 'MH', label: '马绍尔群岛' },
  { value: 'MK', label: '北马其顿' },
  { value: 'ML', label: '马里' },
  { value: 'MM', label: '缅甸' },
  { value: 'MN', label: '蒙古' },
  { value: 'MR', label: '毛里塔尼亚' },
  { value: 'MT', label: '马耳他' },
  { value: 'MU', label: '毛里求斯' },
  { value: 'MV', label: '马尔代夫' },
  { value: 'MW', label: '马拉维' },
  { value: 'MX', label: '墨西哥' },
  { value: 'MY', label: '马来西亚' },
  { value: 'MZ', label: '莫桑比克' },
  { value: 'NA', label: '纳米比亚' },
  { value: 'NE', label: '尼日尔' },
  { value: 'NG', label: '尼日利亚' },
  { value: 'NI', label: '尼加拉瓜' },
  { value: 'NL', label: '荷兰' },
  { value: 'NO', label: '挪威' },
  { value: 'NP', label: '尼泊尔' },
  { value: 'NR', label: '瑙鲁' },
  { value: 'NZ', label: '新西兰' },
  { value: 'OM', label: '阿曼' },
  { value: 'PA', label: '巴拿马' },
  { value: 'PE', label: '秘鲁' },
  { value: 'PG', label: '巴布亚新几内亚' },
  { value: 'PH', label: '菲律宾' },
  { value: 'PK', label: '巴基斯坦' },
  { value: 'PL', label: '波兰' },
  { value: 'PS', label: '巴勒斯坦' },
  { value: 'PT', label: '葡萄牙' },
  { value: 'PW', label: '帕劳' },
  { value: 'PY', label: '巴拉圭' },
  { value: 'QA', label: '卡塔尔' },
  { value: 'RO', label: '罗马尼亚' },
  { value: 'RS', label: '塞尔维亚' },
  { value: 'RU', label: '俄罗斯' },
  { value: 'RW', label: '卢旺达' },
  { value: 'SA', label: '沙特阿拉伯' },
  { value: 'SB', label: '所罗门群岛' },
  { value: 'SC', label: '塞舌尔' },
  { value: 'SD', label: '苏丹' },
  { value: 'SE', label: '瑞典' },
  { value: 'SG', label: '新加坡' },
  { value: 'SI', label: '斯洛文尼亚' },
  { value: 'SK', label: '斯洛伐克' },
  { value: 'SL', label: '塞拉利昂' },
  { value: 'SM', label: '圣马力诺' },
  { value: 'SN', label: '塞内加尔' },
  { value: 'SO', label: '索马里' },
  { value: 'SR', label: '苏里南' },
  { value: 'SS', label: '南苏丹' },
  { value: 'ST', label: '圣多美和普林西比' },
  { value: 'SV', label: '萨尔瓦多' },
  { value: 'SY', label: '叙利亚' },
  { value: 'SZ', label: '斯威士兰' },
  { value: 'TD', label: '乍得' },
  { value: 'TG', label: '多哥' },
  { value: 'TH', label: '泰国' },
  { value: 'TJ', label: '塔吉克斯坦' },
  { value: 'TL', label: '东帝汶' },
  { value: 'TM', label: '土库曼斯坦' },
  { value: 'TN', label: '突尼斯' },
  { value: 'TO', label: '汤加' },
  { value: 'TR', label: '土耳其' },
  { value: 'TT', label: '特立尼达和多巴哥' },
  { value: 'TV', label: '图瓦卢' },
  { value: 'TW', label: '中国/台湾' },
  { value: 'TZ', label: '坦桑尼亚' },
  { value: 'UA', label: '乌克兰' },
  { value: 'UG', label: '乌干达' },
  { value: 'US', label: '美国' },
  { value: 'UY', label: '乌拉圭' },
  { value: 'UZ', label: '乌兹别克斯坦' },
  { value: 'VA', label: '梵蒂冈' },
  { value: 'VC', label: '圣文森特和格林纳丁斯' },
  { value: 'VE', label: '委内瑞拉' },
  { value: 'VN', label: '越南' },
  { value: 'VU', label: '瓦努阿图' },
  { value: 'WS', label: '萨摩亚' },
  { value: 'YE', label: '也门' },
  { value: 'ZA', label: '南非' },
  { value: 'ZM', label: '赞比亚' },
  { value: 'ZW', label: '津巴布韦' },
]

/** Labels for codes that exist for status display but are not selectable. */
const UNSELECTABLE_LABELS: Readonly<Record<string, string>> = {
  CN: '中国',
  HK: '中国/香港',
  MO: '中国/澳门',
}

const LABEL_BY_CODE: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(REGIONS.map(region => [region.value, region.label])),
  ...UNSELECTABLE_LABELS,
})

/** The visible name for an ISO code; unknown codes fall back to the code. */
export function regionLabel(code: string): string {
  return LABEL_BY_CODE[code] ?? code
}

/** What the outside world sees as this machine's exit, as far as the probe
 *  could tell: the echoed IP, its ISO country code, and the display label. */
export interface ExitRegion {
  ip: string
  code: string
  label: string
}

const PROBE_TIMEOUT_MS = 8_000

/** Primary probe: ip-api.com's free endpoint (HTTP only on the free tier,
 *  which is fine — this runs host-side in Node, not in the renderer). */
async function probeIpApi(): Promise<ExitRegion | undefined> {
  try {
    const response = await fetch(
      'http://ip-api.com/json/?lang=zh-CN&fields=status,query,country,countryCode',
      { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    const body = await response.json() as Record<string, unknown>
    if (body['status'] !== 'success') return undefined
    const ip = body['query']
    const code = body['countryCode']
    const country = body['country']
    if (typeof ip !== 'string' || ip === '' || typeof code !== 'string' || code === '') return undefined
    return {
      ip,
      code,
      label: LABEL_BY_CODE[code] ?? (typeof country === 'string' && country !== '' ? country : code),
    }
  } catch {
    return undefined
  }
}

/** Fallback probe: ipapi.co (HTTPS, keyless, ISO `country_code`). */
async function probeIpapiCo(): Promise<ExitRegion | undefined> {
  try {
    const response = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    const body = await response.json() as Record<string, unknown>
    const ip = body['ip']
    const code = body['country_code']
    if (typeof ip !== 'string' || ip === '' || typeof code !== 'string' || code === '') return undefined
    return { ip, code, label: LABEL_BY_CODE[code] ?? code }
  } catch {
    return undefined
  }
}

/** Detect the exit region once per plugin load; `undefined` when every probe
 *  failed (the geo gate stays open — there is nothing to compare against). */
export async function detectExitRegion(): Promise<ExitRegion | undefined> {
  return await probeIpApi() ?? await probeIpapiCo()
}

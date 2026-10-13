/*
 * mapping.js — ядро конвертера ТТ (трансформационная таблица КМГ/КМТФ) → формы СУО 2R / R3 / 4R.
 *
 * Модуль не зависит от DOM: работает и в браузере (window.SUO), и в Node (module.exports)
 * — это позволяет тестировать правила маппинга без интерфейса.
 *
 * Принципы:
 *  - строки ТТ идентифицируются по коду счёта (колонка «Счёт», напр. "AC sum AC-TT-5077"),
 *    коду валюты ("CT=USD") и коду раскрытия ("DC=DC47.001"), а не по номерам строк —
 *    поэтому маппинг устойчив к сдвигам строк между версиями ТТ;
 *  - берётся консолидированная колонка «Итого» (после корректировок), опционально — «Package sum»;
 *  - по каждой строке формы считается контроль: сумма разнесённых по валютам сумм сравнивается
 *    со строкой баланса ТТ. Расхождения попадают в журнал (log) и показываются в интерфейсе;
 *  - суммы без валютного раскрытия (немонетарные статьи, статьи без разреза валют) относятся
 *    в тенге и помечаются в журнале как «без раскрытия по валютам».
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SUO = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Справочники
  // ---------------------------------------------------------------------------

  /** Валюты формы R3 и соответствующие колонки шаблона. */
  const R3_CURS = ['USD', 'EUR', 'RUB', 'CNY', 'JPY', 'CHF', 'XDR', 'OTHER', 'KZT'];
  const R3_CUR_COL = { USD: 'C', EUR: 'D', RUB: 'E', CNY: 'F', JPY: 'G', CHF: 'H', XDR: 'I', OTHER: 'J', KZT: 'L' };
  const R3_PREV_COL = { USD: 'P', EUR: 'Q', RUB: 'R', CNY: 'S', JPY: 'T', CHF: 'U', XDR: 'V', OTHER: 'W', KZT: 'Y' };
  const CUR_LABEL = { USD: 'Доллар США', EUR: 'Евро', RUB: 'Российский рубль', CNY: 'Китайский юань', JPY: 'Японская йена', CHF: 'Швейцарский франк', XDR: 'СДР', OTHER: 'Прочие', KZT: 'Тенге' };

  /** Строки формы R3 (валютный риск). Коды счетов ТТ приведены к нормализованному виду (без пробелов). */
  const R3_LINES = [
    // ---- Краткосрочные активы ----
    { row: 25, key: 'cash', side: 'A', group: 'ST', name: 'Денежные средства',
      cur: ['AC=A10501010000', 'ACSUMAC-TT-5077'],
      plain: ['AC=A10101000000', 'AC=A10602010000', 'AC=A10201010000', 'AC=A10401010000', 'AC=A10401030000', 'AC=A10401040000', 'AC=A10401050000', 'AC=A10601010000', 'ACSUMAC-TT-5088'],
      control: ['ACSUMAC-TTBS-41'] },
    { row: 26, key: 'loansST', side: 'A', group: 'ST', name: 'Займы выданные - текущая часть',
      cur: ['ACSUMAC-EER19-10', 'ACSUMAC-EER21-7'],
      control: ['ACSUMAC-TTBS-39', 'ACSUMAC-TTBS-95'] },
    { row: 27, key: 'depST', side: 'A', group: 'ST', name: 'Средства в кредитных учреждениях - текущая часть',
      cur: ['AC=A11999010100', 'AC=A11999010200'],
      control: ['ACSUMAC-TTBS-FB'] },
    { row: 28, key: 'derivST', side: 'A', group: 'ST', name: 'Производные финансовые инструменты - краткосрочные активы',
      plain: ['ACSUMAC-TTBS-33'], control: ['ACSUMAC-TTBS-33'] },
    { row: 29, key: 'finST', side: 'A', group: 'ST', name: 'Краткосрочные финансовые активы',
      cur: ['AC=A11203100100', 'ACSUMAC-TT36-4929', '{AC=A11201100100}+{AC=A11201100200}*', 'ACSUMAC-TT-4908.2'],
      control: ['ACSUMAC-TTBS-34', 'ACSUMAC-TTBS-35', 'ACSUMAC-TTBS-40F1'] },
    { row: 30, key: 'recST', side: 'A', group: 'ST', name: 'Краткосрочная дебиторская задолженность',
      cur: ['ACSUMAC-TT-4820', 'ACSUMAC-TT-4873', '{AC=A12401000000}+{AC=A12902010000}'],
      plain: ['AC=A16910000000'],
      control: ['ACSUMAC-TTBS-AP2', 'ACSUMAC-TTBS-AG', 'ACSUMAC-TTBS-KAP', 'AC=A16910000000'] },
    { row: 31, key: 'otherST', side: 'A', group: 'ST', name: 'Прочие краткосрочные активы',
      cur: ['ACSUMAC-TT36-4939'],
      plain: ['ACSUMAC-TTBS-IM', 'ACSUMAC-TTBS-36', 'ACSUMAC-TTBS-NDS', 'ACSUMAC-TTBS-38-1', 'ACSUMAC-TTBS-42'],
      control: ['ACSUMAC-TTBS-IM', 'ACSUMAC-TTBS-36', 'ACSUMAC-TTBS-NDS', 'ACSUMAC-TTBS-38-1', 'ACSUMAC-TTBS-42', 'ACSUMAC-TTBS-40F2'] },
    // ---- Долгосрочные активы ----
    { row: 33, key: 'loansLT', side: 'A', group: 'LT', name: 'Займы выданные - долгосрочная часть',
      cur: ['ACSUMAC-EER19-5', 'ACSUMAC-EER21-3'],
      control: ['ACSUMAC-TTBS-LA', 'ACSUMAC-TTBS-LRM'] },
    { row: 34, key: 'depLT', side: 'A', group: 'LT', name: 'Средства в кредитных учреждениях - долгосрочная часть',
      cur: ['AC=A20902010000', '{AC=A20902030000}+{AC=A20902040000}'],
      control: ['ACSUMAC-TTBS-LT'] },
    { row: 35, key: 'derivLT', side: 'A', group: 'LT', name: 'Производные финансовые инструменты - долгосрочные активы',
      plain: ['ACSUMAC-TTBS-12'], control: ['ACSUMAC-TTBS-12'] },
    { row: 36, key: 'finLT', side: 'A', group: 'LT', name: 'Долгосрочные финансовые активы',
      cur: ['AC=A20203100100', 'ACSUMAC-TT-PR4', '{AC=A20202100100}+{AC=A20202100200}*', 'ACSUMAC-TT-PR'],
      control: ['ACSUMAC-TTBS-13', 'ACSUMAC-TTBS-FA', 'ACSUMAC-TTBS-OAF1'] },
    { row: 37, key: 'recLT', side: 'A', group: 'LT', name: 'Долгосрочная дебиторская задолженность',
      cur: ['ACSUMAC-TT-4780', '{AC=A29101010000}+{AC=A29102010000}*', '{AC=A21401000000}+{AC=A21903010000}'],
      control: ['ACSUMAC-TTBS-AR', 'ACSUMAC-TTBS-AA', 'ACSUMAC-TTBS-DAP'] },
    { row: 38, key: 'otherLT', side: 'A', group: 'LT', name: 'Прочие долгосрочные активы',
      cur: ['ACSUMAC-TT-PR5'],
      plain: ['ACSUMAC-TTBS-TA', 'ACSUMAC-TTBS-RU', 'ACSUMAC-TTBS-IP', 'ACSUMAC-TTBS-EA', 'ACSUMAC-TTBS-GA', 'ACSUMAC-TTBS-IA', 'ACSUMAC-TTBS-AK', 'ACSUMAC-TTBS-SC', 'ACSUMAC-TTBS-DO', 'ACSUMAC-TTBS-PT', 'ACSUMAC-TTBS-NDS2'],
      control: ['ACSUMAC-TTBS-TA', 'ACSUMAC-TTBS-RU', 'ACSUMAC-TTBS-IP', 'ACSUMAC-TTBS-EA', 'ACSUMAC-TTBS-GA', 'ACSUMAC-TTBS-IA', 'ACSUMAC-TTBS-AK', 'ACSUMAC-TTBS-SC', 'ACSUMAC-TTBS-DO', 'ACSUMAC-TTBS-PT', 'ACSUMAC-TTBS-NDS2', 'ACSUMAC-TTBS-OAF2'] },
    // ---- Краткосрочные обязательства ----
    { row: 41, key: 'loansRecST', side: 'L', group: 'ST', name: 'Займы полученные - текущая часть',
      cur: [{ ac: 'ACSUMAC-TT-5678', prorate: [['ACSUMAC-TTBS-79'], ['ACSUMAC-TTBS-79', 'ACSUMAC-TTBS-64']] },
            { ac: 'ACSUMAC-TT-5655', prorate: [['ACSUMAC-TTBS-80'], ['ACSUMAC-TTBS-80', 'ACSUMAC-TTBS-65']] }],
      control: ['ACSUMAC-TTBS-79', 'ACSUMAC-TTBS-80'] },
    { row: 42, key: 'clientsST', side: 'L', group: 'ST', name: 'Привлеченные средства клиентов - текущая часть', control: [] },
    { row: 43, key: 'derivLST', side: 'L', group: 'ST', name: 'Производные финансовые инструменты - краткосрочные обязательства',
      plain: ['ACSUMAC-TTBS-81'], control: ['ACSUMAC-TTBS-81'] },
    { row: 44, key: 'govST', side: 'L', group: 'ST', name: 'Средства Правительства РК и Национальных банков - текущая часть',
      cur: ['ACSUMAC-TTBS-92'], control: ['ACSUMAC-TTBS-92'] },
    { row: 45, key: 'leaseST', side: 'L', group: 'ST', name: 'Обязательства по финансовой аренде',
      plain: ['AC=L33702010000'], control: ['AC=L33702010000'] },
    { row: 46, key: 'payST', side: 'L', group: 'ST', name: 'Краткосрочная кредиторская задолженность',
      cur: ['{AC=L33101000000}+{AC=L41101000000}', 'AC=L33401000000'],
      plain: ['ACSUMAC-TTBS-83', 'AC=L33905000000'],
      control: ['ACSUMAC-TTBS-82', 'ACSUMAC-TTBS-83', 'AC=L33905000000', 'AC=L33401000000'] },
    { row: 47, key: 'empST', side: 'L', group: 'ST', name: 'Обязательства по вознаграждениям работникам',
      plain: ['AC=L34003000000'], control: ['AC=L34003000000'] },
    { row: 48, key: 'otherLST', side: 'L', group: 'ST', name: 'Прочие краткосрочные обязательства',
      cur: ['ACSUMAC-EER86-12Q', 'ACSUMAC-EER86-15', 'ACSUMAC-TT-861', 'AC=L32104000000'],
      plain: ['ACSUMAC-TTBS-85', 'ACSUMAC-TTBS-86', 'ACSUMAC-TTBS-88', 'AC=L39001000000'],
      control: ['ACSUMAC-TTBS-85', 'ACSUMAC-TTBS-86', 'ACSUMAC-TTBS-88', 'AC=L39001000000', 'ACSUMAC-TTBS-90'] },
    // ---- Долгосрочные обязательства ----
    { row: 50, key: 'loansRecLT', side: 'L', group: 'LT', name: 'Займы полученные - долгосрочная часть',
      cur: [{ ac: 'ACSUMAC-TT-5678', prorate: [['ACSUMAC-TTBS-64'], ['ACSUMAC-TTBS-79', 'ACSUMAC-TTBS-64']] },
            { ac: 'ACSUMAC-TT-5655', prorate: [['ACSUMAC-TTBS-65'], ['ACSUMAC-TTBS-80', 'ACSUMAC-TTBS-65']] }],
      control: ['ACSUMAC-TTBS-64', 'ACSUMAC-TTBS-65'] },
    { row: 51, key: 'clientsLT', side: 'L', group: 'LT', name: 'Привлеченные средства клиентов - долгосрочная часть', control: [] },
    { row: 52, key: 'derivLLT', side: 'L', group: 'LT', name: 'Производные финансовые инструменты - долгосрочные обязательства',
      plain: ['ACSUMAC-TTBS-68'], control: ['ACSUMAC-TTBS-68'] },
    { row: 53, key: 'govLT', side: 'L', group: 'LT', name: 'Средства Правительства РК и Национальных банков - долгосрочная часть',
      cur: ['ACSUMAC-TTBS-74'], control: ['ACSUMAC-TTBS-74'] },
    { row: 54, key: 'leaseLT', side: 'L', group: 'LT', name: 'Обязательства по финансовой аренде (долгосрочные)',
      plain: ['ACSUMAC-TTBS-66'], control: ['ACSUMAC-TTBS-66'] },
    { row: 55, key: 'payLT', side: 'L', group: 'LT', name: 'Долгосрочная кредиторская задолженность',
      cur: ['AC=L41401000000'],
      plain: ['AC=L44009050300'],
      control: ['AC=L41101000000', 'AC=L41401000000', 'AC=L44009050300'] },
    { row: 56, key: 'empLT', side: 'L', group: 'LT', name: 'Обязательства по вознаграждениям работникам (долгосрочные)',
      plain: ['AC=L42003000000'], control: ['AC=L42003000000'] },
    { row: 57, key: 'otherLLT', side: 'L', group: 'LT', name: 'Прочие долгосрочные обязательства',
      cur: ['ACSUMAC-TT-NO4441', 'ACSUMAC-TT-L44-41'],
      plain: ['ACSUMAC-TTBS-70', 'ACSUMAC-TTBS-72', 'AC=L40901000000'],
      control: ['ACSUMAC-TTBS-70', 'ACSUMAC-TTBS-72', 'AC=L40901000000', 'ACSUMAC-TTBS-75'] },
  ];

  /** Временные интервалы формы 4R и колонки шаблона. */
  const R4_BUCKETS = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];
  const R4_BUCKET_COL = { b1: 'C', b2: 'D', b3: 'E', b4: 'F', b5: 'G', b6: 'H' };
  const R4_BUCKET_LABEL = { b1: 'до 1 мес.', b2: 'от 1 до 3 мес.', b3: 'от 3 до 12 мес.', b4: 'от 1 до 5 лет', b5: 'свыше 5 лет', b6: 'без срока' };
  const R4_CURS = ['KZT', 'USD', 'OTHER'];

  /** Категории формы 4R: строки шаблона для тенге / доллар / прочие. */
  const R4_CATS = [
    { key: 'loansGiven', side: 'A', name: 'Займы выданные', rows: { KZT: 12, USD: 13, OTHER: 14 }, groupRow: 11 },
    { key: 'deposits', side: 'A', name: 'Средства в кредитных учреждениях', rows: { KZT: 16, USD: 17, OTHER: 18 }, groupRow: 15 },
    { key: 'derivA', side: 'A', name: 'Производные финансовые инструменты (активы)', rows: { KZT: 20, USD: 21, OTHER: 22 }, groupRow: 19 },
    { key: 'finAssets', side: 'A', name: 'Финансовые активы', rows: { KZT: 24, USD: 25, OTHER: 26 }, groupRow: 23 },
    { key: 'receivables', side: 'A', name: 'Дебиторская задолженность', rows: { KZT: 28, USD: 29, OTHER: 30 }, groupRow: 27 },
    { key: 'otherA', side: 'A', name: 'Прочие активы', rows: { KZT: 32, USD: 33, OTHER: 34 }, groupRow: 31 },
    { key: 'loans', side: 'L', name: 'Займы полученные', rows: { KZT: 38, USD: 39, OTHER: 40 }, groupRow: 37 },
    { key: 'clients', side: 'L', name: 'Привлеченные средства клиентов', rows: { KZT: 42, USD: 43, OTHER: 44 }, groupRow: 41 },
    { key: 'derivL', side: 'L', name: 'Производные финансовые инструменты (обязательства)', rows: { KZT: 46, USD: 47, OTHER: 48 }, groupRow: 45 },
    { key: 'gov', side: 'L', name: 'Средства Правительства РК и Национальных банков', rows: { KZT: 50, USD: 51, OTHER: 52 }, groupRow: 49 },
    { key: 'lease', side: 'L', name: 'Обязательства по финансовой аренде', rows: { KZT: 54, USD: 55, OTHER: 56 }, groupRow: 53 },
    { key: 'payables', side: 'L', name: 'Кредиторская задолженность', rows: { KZT: 58, USD: 59, OTHER: 60 }, groupRow: 57 },
    { key: 'employee', side: 'L', name: 'Обязательства по вознаграждениям работникам', rows: { KZT: 62, USD: 63, OTHER: 64 }, groupRow: 61 },
    { key: 'otherL', side: 'L', name: 'Прочие обязательства', rows: { KZT: 66, USD: 67, OTHER: 68 }, groupRow: 65 },
  ];

  /** Коэффициенты чувствительности к процентной ставке по умолчанию (доля позиции, относимая в 4R). */
  const DEFAULT_SENS = {
    loansGiven: 0, deposits: 0, derivA: 1, finAssets: 0, receivables: 0, otherA: 0,
    loans: 'auto', clients: 0, derivL: 1, gov: 1, lease: 0, payables: 0, employee: 0, otherL: 0,
  };

  /** Колонки формы 2R. */
  const R2_COLS = ['C', 'D', 'E', 'F', 'G', 'H', 'I'];
  const R2_COL_LABEL = { C: 'Гарантии', D: 'Аккредитивы', E: 'Текущие/корр. счета и депозиты', F: 'Займы выданные', G: 'Ценные бумаги', H: 'Торговая ДЗ / авансы выданные', I: 'Прочее' };

  /** Сопоставление названий банков/стран из ТТ с названиями стран в справочнике формы 2R. Порядок важен. */
  const COUNTRY_RULES = [
    [/казахстан|kazakhstan|\bРК\b|народный банк|halyk|kaspi|каспий|forte|jysan|alatau city|altyn|евразийск|центр ?кредит|\bRBK\b|нурбанк|нур ?банк|kassa nova|al hilal|темир|экспокредит|депозитарий|национальный банк рк|банк развития казахстана|казкоммерц|бта банк|атф ?банк|казинвест|delta bank|qazaq|азиякредит|хоум кредит|^дб\s|\bдб\b/i, 'КАЗАХСТАН'],
    [/лондон|london|великобритан|britain|united kingdom|\bUK\b|barclays|hsbc/i, 'СОЕДИНЕННОЕ КОРОЛЕВСТВО ВЕЛИКОБРИТАНИИ'],
    [/эмират|\bUAE\b|united arab|dubai|abu dhabi|adgm|difc/i, 'ОБЪЕДИНЕННЫЕ АРАБСКИЕ ЭМИРАТЫ'],
    [/швейцар|switzerland|\bUBS\b|credit suisse|sondrio/i, 'ШВЕЙЦАРИЯ'],
    [/румын|romania|\bBRD\b|cec bank|trezoreria|unicredit tiriac|transilvania|\bBCR\b|bancpost|piraeus/i, 'РУМЫНИЯ'],
    [/болгар|bulgaria|\bDSK\b|\bUBB\b/i, 'БОЛГАРИЯ'],
    [/молдов|moldova|\bMAIB\b/i, 'МОЛДОВА, РЕСПУБЛИКА'],
    [/груз|georgia|\bBOG\b|\bTBC\b|cartu|basis bank|procredit/i, 'ГРУЗИЯ'],
    [/нидерланд|netherlands|holland|\bING\b|abn amro|\bRBS\b/i, 'НИДЕРЛАНДЫ'],
    [/герман|germany|deutsche|дойче|berenberg/i, 'ГЕРМАНИЯ'],
    [/росси(я|и|йск)|russia|сбербанк|альфа-?банк|\bвтб\b/i, 'РОССИЯ'],
    [/кирги|kyrgyz/i, 'КИРГИЗИЯ'],
    [/гонконг|hong ?kong/i, 'ГОНКОНГ'],
    [/кита(й|е|йск)|china/i, 'КИТАЙ'],
    [/кипр|cyprus/i, 'КИПР'],
    [/испан|spain|bilbao|caixa|caja madrid|banco popular|natexis/i, 'ИСПАНИЯ'],
    [/франц|france|bnp paribas|credit agricole|crédit agricole|societe generale|société générale|natixis|lyonnais|bankinter|banesto/i, 'ФРАНЦИЯ'],
    [/украин|ukraine|петрокоммерц/i, 'УКРАИНА'],
    [/турц|turkey|türkiye|garanti/i, 'ТУРЦИЯ'],
    [/мальт|malta/i, 'МАЛЬТА'],
    [/сингапур|singapore/i, 'СИНГАПУР'],
    [/\bливи(я|и|йск)|libya|tripoli/i, 'ЛИВИЯ'],
    [/ирак|iraq/i, 'ИРАК'],
    [/\bсша\b|\bUSA\b|united states/i, 'СОЕДИНЕННЫЕ ШТАТЫ'],
    [/япон|japan|tokyo|mitsubishi|mizuho|sumitomo/i, 'ЯПОНИЯ'],
    [/австри|austria|raiffeisen/i, 'АВСТРИЯ'],
    [/итал|ital/i, 'ИТАЛИЯ'],
    [/грец|greece/i, 'ГРЕЦИЯ'],
    [/виргинск.*брит|british virgin/i, 'ВИРГИНСКИЕ ОСТРОВА, БРИТАНСКИЕ'],
    [/люксембург|luxembourg/i, 'ЛЮКСЕМБУРГ'],
    [/узбек|uzbek/i, 'УЗБЕКИСТАН'],
    [/азербайдж|azerbaijan/i, 'АЗЕРБАЙДЖАН'],
    [/армени|armenia/i, 'АРМЕНИЯ'],
    [/беларус|белорус|belarus/i, 'БЕЛАРУСЬ'],
    [/польш|poland/i, 'ПОЛЬША'],
    [/латви|latvia/i, 'ЛАТВИЯ'],
    [/литв|lithuania/i, 'ЛИТВА'],
    [/эстон|estonia/i, 'ЭСТОНИЯ'],
    [/корея|korea/i, 'КОРЕЯ, РЕСПУБЛИКА'],
    [/инди(я|и|йск)|india/i, 'ИНДИЯ'],
    [/иран/i, 'ИРАН, ИСЛАМСКАЯ РЕСПУБЛИКА'],
    [/бельги|belgi/i, 'БЕЛЬГИЯ'],
    [/канад|canada/i, 'КАНАДА'],
    [/ирланд|ireland/i, 'ИРЛАНДИЯ'],
    [/швеци|sweden/i, 'ШВЕЦИЯ'],
    [/норвег|norway/i, 'НОРВЕГИЯ'],
    [/дани(я|и|йск)|denmark/i, 'ДАНИЯ'],
    [/финлянд|finland/i, 'ФИНЛЯНДИЯ'],
    [/чехи|czech/i, 'ЧЕХИЯ'],
    [/венгр|hungar/i, 'ВЕНГРИЯ'],
    [/монгол|mongol/i, 'МОНГОЛИЯ'],
    [/таджик|tajik/i, 'ТАДЖИКИСТАН'],
    [/туркмен|turkmen/i, 'ТУРКМЕНИСТАН'],
    [/египет|egypt/i, 'ЕГИПЕТ'],
    [/израил|israel/i, 'ИЗРАИЛЬ'],
    [/катар|qatar/i, 'КАТАР'],
    [/саудов|saudi/i, 'САУДОВСКАЯ АРАВИЯ'],
    [/оман|oman/i, 'ОМАН'],
    [/панам|panama/i, 'ПАНАМА'],
    [/маршалл|marshall/i, 'МАРШАЛЛОВЫ ОСТРОВА'],
    [/либери|liberia/i, 'ЛИБЕРИЯ'],
    [/мальдив|maldives/i, 'МАЛЬДИВЫ'],
    [/бахрейн|bahrain/i, 'БАХРЕЙН'],
    [/австрал|australia/i, 'АВСТРАЛИЯ'],
    [/бразил|brazil/i, 'БРАЗИЛИЯ'],
    [/аргентин|argentin/i, 'АРГЕНТИНА'],
    [/мексик|mexic/i, 'МЕКСИКА'],
    [/португал|portug/i, 'ПОРТУГАЛИЯ'],
    [/хорват|croat/i, 'ХОРВАТИЯ'],
    [/серби|serbia/i, 'СЕРБИЯ'],
    [/словак|slovak/i, 'СЛОВАКИЯ'],
    [/словен|sloven/i, 'СЛОВЕНИЯ'],
    [/малайз|malays/i, 'МАЛАЙЗИЯ'],
    [/индонез|indones/i, 'ИНДОНЕЗИЯ'],
    [/вьетнам|vietnam/i, 'ВЬЕТНАМ'],
    [/таиланд|thailand/i, 'ТАИЛАНД'],
    [/пакистан|pakistan/i, 'ПАКИСТАН'],
    [/афган|afghan/i, 'АФГАНИСТАН'],
    [/южн.*африк|south africa/i, 'ЮЖНАЯ АФРИКА'],
    [/нигери|nigeria/i, 'НИГЕРИЯ'],
    [/кени|kenya/i, 'КЕНИЯ'],
    [/марокк|morocc/i, 'МАРОККО'],
    [/алжир|algeri/i, 'АЛЖИР'],
    [/тунис|tunis/i, 'ТУНИС'],
  ];

  // ---------------------------------------------------------------------------
  // Утилиты
  // ---------------------------------------------------------------------------

  function cellVal(c) {
    if (!c) return null;
    let v = c.value;
    if (v == null) return null;
    if (typeof v === 'object') {
      if (v instanceof Date) return v;
      if ('result' in v) v = v.result;
      else if ('richText' in v) v = v.richText.map(t => t.text).join('');
      else if ('text' in v) v = v.text;
      else if ('error' in v) return null;
      else if ('hyperlink' in v) v = v.text;
    }
    if (v && typeof v === 'object' && 'error' in v) return null;
    return v;
  }
  function str(v) { return v == null ? '' : String(v); }
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (typeof v === 'string') {
      const s = v.replace(/\s| /g, '').replace(',', '.');
      if (s === '' || s === '-') return 0;
      const n = parseFloat(s);
      return isNaN(n) ? 0 : n;
    }
    return 0;
  }
  /** Значение периода из титула: строка " 2026.09", либо число 2026.09, либо Date (если формат ячейки — дата). */
  function dpString(v) {
    if (v instanceof Date) { const serial = (v.getTime() - Date.UTC(1899, 11, 30)) / 86400000; return serial.toFixed(2); }
    if (typeof v === 'number') return v.toFixed(2);
    return str(v).trim();
  }
  function normAC(s) { return str(s).replace(/\s+/g, '').toUpperCase(); }
  function normCur(tc) {
    const s = normAC(tc);
    if (!s) return null;
    let m = s.match(/^CT=([A-Z]{3})$/);
    if (m) return mapCur(m[1]);
    if (/^CTSUMCU-/.test(s)) return 'OTHER';
    return null; // 'CT sum [All values]' и пр. — без валютного разреза
  }
  function mapCur(c) {
    if (c === 'SDR') return 'XDR';
    if (R3_CURS.indexOf(c) >= 0) return c;
    return 'OTHER';
  }
  function r4Cur(c) { return c === 'KZT' ? 'KZT' : c === 'USD' ? 'USD' : 'OTHER'; }
  function emptyCur() { const o = {}; R3_CURS.forEach(c => (o[c] = 0)); return o; }
  function sumObj(o) { let s = 0; for (const k in o) s += o[k] || 0; return s; }
  function round2(x) { return Math.round(x * 100) / 100; }
  function acMatch(acN, sel) {
    if (sel.endsWith('*')) return acN.startsWith(sel.slice(0, -1));
    return acN === sel;
  }

  /** Нормализованное название периода: "2026.09" → { label: 'Q3 2026', year, month, quarter, sortKey }. */
  function periodFromDP(dp) {
    const m = str(dp).match(/(\d{4})\D+(\d{1,2})/);
    if (!m) return null;
    const year = +m[1], month = +m[2];
    const quarter = Math.ceil(month / 3);
    return { year, month, quarter, label: 'Q' + quarter + ' ' + year, sortKey: year * 100 + month };
  }
  function periodFromLabel(label) {
    const m = str(label).match(/Q([1-4])\D*(\d{4})/i) || str(label).match(/(\d{4})\D*Q([1-4])/i);
    if (!m) return null;
    const quarter = m[0].toUpperCase().indexOf('Q') === 0 ? +m[1] : +m[2];
    const year = m[0].toUpperCase().indexOf('Q') === 0 ? +m[2] : +m[1];
    return { year, quarter, month: quarter * 3, label: 'Q' + quarter + ' ' + year, sortKey: year * 100 + quarter * 3 };
  }

  // ---------------------------------------------------------------------------
  // Разбор ТТ
  // ---------------------------------------------------------------------------

  /**
   * Читает книгу ExcelJS с ТТ и возвращает модель строк.
   * @param {ExcelJS.Workbook} wb
   * @param {{useColumn?: 'total'|'pkg'}} opts
   */
  function parseTT(wb, opts) {
    opts = opts || {};
    const ws = wb.getWorksheet('TT') || wb.getWorksheet('audit_TT') || wb.worksheets.find(w => /^(audit_)?TT$/i.test(w.name));
    if (!ws) throw new Error('В файле не найден лист «TT» (или «audit_TT»). Проверьте, что загружен файл трансформационной таблицы.');
    const info = { sheet: ws.name, company: '', dp: '', period: null, totalCol: null, pkgCol: null, nameCol: 9, descrCol: 8 };

    // Титульный лист
    const titul = wb.getWorksheet('Titul');
    if (titul) {
      titul.eachRow((row) => {
        row.eachCell((c) => {
          const v = str(cellVal(c)).trim();
          if (/^Период:?$/i.test(v)) info.titulPeriod = dpString(cellVal(row.getCell(c.col + 1)));
        });
      });
      for (let r = 1; r <= Math.min(titul.rowCount, 40); r++) {
        const v = str(cellVal(titul.getRow(r).getCell(1))).trim();
        if (v && !/трансформационная/i.test(v) && !info.company && r > 10) info.company = v;
      }
    }
    // Заголовки ТТ
    let headerRow = 0, startRow = 0;
    for (let r = 1; r <= Math.min(ws.rowCount, 40); r++) {
      const row = ws.getRow(r);
      const a = str(cellVal(row.getCell(1))).trim();
      if (!info.dp && /^DP\s*=/i.test(a)) info.dp = a.replace(/^DP\s*=/i, '').trim();
      if (!info.dp && r === 5) { const d = dpString(cellVal(row.getCell(1))); if (/^DP/i.test(d)) info.dp = d.replace(/^DP\s*=/i, '').trim(); }
      if (/^Счёт$|^Счет$/i.test(a)) headerRow = r;
      row.eachCell((c) => {
        const v = str(cellVal(c)).trim();
        if (v === 'Итого' && !info.totalCol && r < 15) info.totalCol = c.col;
        if (/^Package sum$/i.test(v) && !info.pkgCol) info.pkgCol = c.col;
        if (/^Статьи$/i.test(v)) { info.nameCol = c.col; startRow = r + 1; }
        if (/^Description$/i.test(v)) info.descrCol = c.col;
      });
    }
    if (!info.totalCol) throw new Error('Не найдена колонка «Итого» в шапке листа TT.');
    if (!startRow) startRow = headerRow ? headerRow + 6 : 13;
    if (!periodFromDP(info.dp) && info.titulPeriod) info.dp = info.titulPeriod;
    info.period = periodFromDP(info.dp);
    const valCol = opts.useColumn === 'pkg' && info.pkgCol ? info.pkgCol : info.totalCol;
    info.valueColumn = valCol === info.pkgCol ? 'Package sum' : 'Итого';

    const rows = [];
    for (let r = startRow; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const ac = str(cellVal(row.getCell(1))).trim();
      const fl = str(cellVal(row.getCell(2))).trim();
      const pa = str(cellVal(row.getCell(3))).trim();
      const tc = str(cellVal(row.getCell(4))).trim();
      const dc = str(cellVal(row.getCell(5))).trim();
      const name = str(cellVal(row.getCell(info.nameCol))).trim();
      const descr = str(cellVal(row.getCell(info.descrCol))).trim();
      if (!ac && !name && !descr) continue;
      const tv = cellVal(row.getCell(valCol));
      rows.push({
        r, ac, acN: normAC(ac), fl: normAC(fl), pa, tc, cur: normCur(tc), dc: normAC(dc), name, nameN: name.replace(/\s+/g, ' ').trim().toUpperCase(), descr,
        total: num(tv), pkg: info.pkgCol ? num(cellVal(row.getCell(info.pkgCol))) : 0, cons: num(cellVal(row.getCell(info.totalCol))),
      });
    }
    return { info, rows };
  }

  // ---------------------------------------------------------------------------
  // Выборки по модели ТТ
  // ---------------------------------------------------------------------------

  function makeIndex(tt) {
    const rows = tt.rows;
    // Допустимые виды движения для остатков: F99 (сальдо на конец), Y99 (итог за период) или пусто.
    const isF99 = (x) => !x.fl || /^FL=(F99|Y99)$/.test(x.fl);
    const api = {
      rows,
      /** Строки с валютным разрезом по коду счёта. */
      curRows(sel) { return rows.filter(x => x.cur && !x.dc && acMatch(x.acN, sel) && !/СТАВК/i.test(x.name) && isF99(x)); },
      /** Первая строка без валютного/срочного разреза по коду счёта (как правило — строка баланса). */
      plainRow(sel) { return rows.find(x => !x.cur && !x.dc && acMatch(x.acN, sel) && isF99(x) && !/^CTSUM/.test(normAC(x.tc)) ) || rows.find(x => !x.cur && !x.dc && acMatch(x.acN, sel) && isF99(x)) || null; },
      plainVal(sel) { const r = api.plainRow(sel); return r ? r.total : 0; },
      sumPlain(sels) { return (sels || []).reduce((s, sel) => s + api.plainVal(sel), 0); },
      /** Строка баланса по названию статьи (например «Итого капитал»). */
      byName(re) { return rows.find(x => !x.ac && re.test(x.name)) || rows.find(x => re.test(x.name)) || null; },
      byNameVal(re) { const r = api.byName(re); return r ? r.total : 0; },
    };
    return api;
  }

  // ---------------------------------------------------------------------------
  // Форма R3 — валютный риск
  // ---------------------------------------------------------------------------

  function computeR3(tt, settings, log) {
    const ix = makeIndex(tt);
    const lines = {};
    const detail = {};
    for (const L of R3_LINES) {
      const cur = emptyCur();
      const det = [];
      for (const src of (L.cur || [])) {
        const sel = typeof src === 'string' ? src : src.ac;
        const rs = ix.curRows(sel);
        let factor = 1;
        if (typeof src === 'object' && src.prorate) {
          const numer = ix.sumPlain(src.prorate[0]);
          const denom = ix.sumPlain(src.prorate[1]);
          factor = denom ? numer / denom : 0;
          if (rs.length && denom) log.push({ level: 'info', form: 'R3', row: L.row, msg: `${L.name}: валютный разрез «${sel}» распределён пропорционально (${(factor * 100).toFixed(1)}% от общей суммы по балансу).` });
        }
        if (!rs.length) { det.push({ sel, found: false }); continue; }
        for (const x of rs) {
          const v = x.total * factor;
          cur[x.cur] += v;
          det.push({ sel, row: x.r, name: x.name, cur: x.cur, value: v });
        }
      }
      for (const sel of (L.plain || [])) {
        const x = ix.plainRow(sel);
        if (!x) { det.push({ sel, found: false }); continue; }
        if (x.total) {
          cur.KZT += x.total;
          det.push({ sel, row: x.r, name: x.name, cur: 'KZT', value: x.total, unallocated: true });
          log.push({ level: 'note', form: 'R3', row: L.row, msg: `${L.name}: «${x.name.trim()}» (${fmt(x.total)}) отнесено в тенге — в ТТ нет раскрытия по валютам.` });
        }
      }
      const control = ix.sumPlain(L.control || []);
      const total = sumObj(cur);
      const diff = round2(total - control);
      if (Math.abs(diff) > 1) {
        log.push({ level: 'warn', form: 'R3', row: L.row, msg: `${L.name}: сумма по валютам ${fmt(total)} ≠ строка баланса ${fmt(control)} (расхождение ${fmt(diff)}).` });
      }
      const missing = det.filter(d => d.found === false).map(d => d.sel);
      if (missing.length && !total && !control) {
        // тихо: статьи нет в этой версии ТТ и она нулевая
      } else if (missing.length) {
        log.push({ level: 'info', form: 'R3', row: L.row, msg: `${L.name}: в ТТ не найдены коды ${missing.join(', ')} (возможно, другая версия ТТ).` });
      }
      lines[L.row] = { cur: roundCur(cur), total: round2(total), control: round2(control), diff };
      detail[L.row] = det;
    }
    const bs = {
      assets: ix.byNameVal(/^Итого активы/i),
      liabilities: ix.byNameVal(/^Итого обязательства/i),
      equity: ix.byNameVal(/^Итого капитал$/i) || ix.byNameVal(/^Итого капитал/i),
    };
    const totals = r3Totals(lines);
    if (Math.abs(totals.assets.total - bs.assets) > 1) log.push({ level: 'warn', form: 'R3', msg: `Итого активы по форме ${fmt(totals.assets.total)} ≠ балансу ТТ ${fmt(bs.assets)} (${fmt(totals.assets.total - bs.assets)}).` });
    if (Math.abs(totals.liabilities.total - bs.liabilities) > 1) log.push({ level: 'warn', form: 'R3', msg: `Итого обязательства по форме ${fmt(totals.liabilities.total)} ≠ балансу ТТ ${fmt(bs.liabilities)} (${fmt(totals.liabilities.total - bs.liabilities)}).` });
    return { lines, detail, bs, equity: bs.equity };
  }

  function roundCur(c) { const o = {}; for (const k in c) o[k] = round2(c[k]); return o; }

  /** Итоги R3 из значений строк (с учётом ручных правок). */
  function r3Totals(lines) {
    const agg = (rows) => { const c = emptyCur(); rows.forEach(r => { const l = lines[r]; if (l) R3_CURS.forEach(k => (c[k] += l.cur[k] || 0)); }); return { cur: c, total: sumObj(c), fx: sumObj(c) - c.KZT }; };
    const stA = agg([25, 26, 27, 28, 29, 30, 31]);
    const ltA = agg([33, 34, 35, 36, 37, 38]);
    const stL = agg([41, 42, 43, 44, 45, 46, 47, 48]);
    const ltL = agg([50, 51, 52, 53, 54, 55, 56, 57]);
    const assets = agg([25, 26, 27, 28, 29, 30, 31, 33, 34, 35, 36, 37, 38]);
    const liabilities = agg([41, 42, 43, 44, 45, 46, 47, 48, 50, 51, 52, 53, 54, 55, 56, 57]);
    const nfp = emptyCur(); R3_CURS.forEach(k => (nfp[k] = assets.cur[k] - liabilities.cur[k]));
    return { stA, ltA, stL, ltL, assets, liabilities, nfp: { cur: nfp, total: sumObj(nfp), fx: sumObj(nfp) - nfp.KZT } };
  }

  // ---------------------------------------------------------------------------
  // Форма 2R — страновой риск
  // ---------------------------------------------------------------------------

  function countryFor(name, overrides) {
    const n = str(name).trim();
    if (overrides && overrides[n] !== undefined && overrides[n] !== '') return { country: overrides[n], how: 'override' };
    const par = n.match(/\(([^)]*)\)/g);
    if (par) {
      for (const p of par) {
        for (const [re, c] of COUNTRY_RULES) if (re.test(p)) return { country: c, how: 'paren' };
      }
    }
    for (const [re, c] of COUNTRY_RULES) if (re.test(n)) return { country: c, how: 'name' };
    return { country: null, how: 'unknown' };
  }

  function computeR2(tt, r3, settings, log) {
    const ix = makeIndex(tt);
    const defCountry = settings.defaultCountry || 'КАЗАХСТАН';
    const ov = settings.bankCountry || {};
    const countries = {};
    const add = (country, col, v, src) => {
      if (!v) return;
      const c = countries[country] || (countries[country] = { C: 0, D: 0, E: 0, F: 0, G: 0, H: 0, I: 0, src: [] });
      c[col] += v; c.src.push({ col, v, src });
    };
    const banks = [];
    const unknownBanks = [];
    const bankSets = [
      { sel: 'ACSUMAC-TT-5092', what: 'Денежные средства (по банкам)' },
      { sel: '{AC=A11999010100}+{AC=A11999010200}', what: 'Краткосрочные банковские вклады (по банкам)' },
      { sel: '{AC=A20902010000}+{AC=A20902030000}+{AC=A20902040000}', what: 'Долгосрочные банковские вклады (по банкам)' },
    ];
    let bankSum = 0;
    for (const bs of bankSets) {
      const rs = ix.rows.filter(x => acMatch(x.acN, bs.sel) && !x.cur && !x.dc && !/^ИТОГО/i.test(x.nameN) && !/^CTSUM/.test(normAC(x.tc)));
      for (const x of rs) {
        if (!x.total) continue;
        const cf = countryFor(x.name, ov);
        const country = cf.country || defCountry;
        if (!cf.country) unknownBanks.push(x.name.trim());
        banks.push({ bank: x.name.trim(), what: bs.what, value: x.total, country, how: cf.how });
        add(country, 'E', x.total, bs.what + ': ' + x.name.trim());
        bankSum += x.total;
      }
    }
    // Остаток денежных средств и вкладов, не разнесённый по банкам (касса, спецсчета, деньги в пути, резерв)
    const cashLines = [25, 27, 34].reduce((s, r) => s + ((r3.lines[r] && r3.lines[r].total) || 0), 0);
    const rest = round2(cashLines - bankSum);
    if (Math.abs(rest) > 1) {
      add(defCountry, 'E', rest, 'Денежные средства/вклады, не разнесённые по банкам (касса, спецсчета, деньги в пути, резервы)');
      log.push({ level: 'note', form: '2R', msg: `Денежные средства и вклады: ${fmt(rest)} не разнесены по банкам в ТТ — отнесены на «${defCountry}».` });
    }
    if (unknownBanks.length) log.push({ level: 'warn', form: '2R', msg: `Не удалось определить страну банка: ${unknownBanks.join('; ')} — отнесено на «${defCountry}». Задайте страну в настройках (справочник банков).` });

    // Займы выданные → страна по умолчанию
    const loans = ((r3.lines[26] || {}).total || 0) + ((r3.lines[33] || {}).total || 0);
    if (loans) { add(defCountry, 'F', loans, 'Займы выданные (ТТ не содержит разреза по странам)'); log.push({ level: 'note', form: '2R', msg: `Займы выданные ${fmt(loans)} отнесены на «${defCountry}» (в ТТ нет разреза по странам).` }); }
    // Ценные бумаги / финансовые активы
    const sec = ((r3.lines[29] || {}).total || 0) + ((r3.lines[36] || {}).total || 0);
    if (sec) { add(defCountry, 'G', sec, 'Финансовые активы / ценные бумаги (ТТ не содержит разреза по странам)'); log.push({ level: 'note', form: '2R', msg: `Финансовые активы ${fmt(sec)} отнесены на «${defCountry}» (в ТТ нет разреза по странам).` }); }
    // Торговая ДЗ / авансы
    const rec = ((r3.lines[30] || {}).total || 0) + ((r3.lines[37] || {}).total || 0);
    const revenue = [];
    if (rec) {
      if (settings.receivablesByRevenue !== false) {
        const rs = ix.rows.filter(x => /^AC=ZZ3001\d{6}$/.test(x.acN) && !x.cur && !x.dc);
        let wsum = 0;
        for (const x of rs) {
          const aggregate = /стран[ыа]\s|^прочие|прочие$/i.test(x.name.trim());
          const cf = countryFor(x.name, {});
          const entry = { name: x.name.trim(), value: x.total, country: aggregate ? null : cf.country, aggregate };
          revenue.push(entry);
          if (entry.country && x.total > 0) wsum += x.total;
        }
        if (wsum > 0) {
          for (const e of revenue) if (e.country && e.value > 0) add(e.country, 'H', rec * e.value / wsum, 'Торговая ДЗ/авансы — пропорционально выручке по странам');
          const aggr = revenue.filter(e => !e.country && e.value).map(e => `${e.name}: ${fmt(e.value)}`);
          log.push({ level: 'note', form: '2R', msg: `Торговая ДЗ и авансы ${fmt(rec)} распределены по странам пропорционально выручке по странам из ТТ (прокси-оценка).${aggr.length ? ' Агрегированные строки выручки не использованы: ' + aggr.join('; ') + '.' : ''}` });
        } else {
          add(defCountry, 'H', rec, 'Торговая ДЗ/авансы (нет данных о выручке по странам)');
          log.push({ level: 'note', form: '2R', msg: `Торговая ДЗ и авансы ${fmt(rec)} отнесены на «${defCountry}» — в ТТ нет выручки по странам.` });
        }
      } else {
        add(defCountry, 'H', rec, 'Торговая ДЗ/авансы');
        log.push({ level: 'note', form: '2R', msg: `Торговая ДЗ и авансы ${fmt(rec)} отнесены на «${defCountry}» (распределение по выручке отключено).` });
      }
    }
    // Условные обязательства (гарантии/аккредитивы): в ТТ нет номиналов — заполняются вручную
    log.push({ level: 'info', form: '2R', msg: 'Гарантии и аккредитивы (графы 2–3): в ТТ нет номинальных сумм условных обязательств — при наличии заполните вручную в предпросмотре.' });

    for (const k in countries) R2_COLS.forEach(c => (countries[k][c] = round2(countries[k][c])));
    return { countries, banks, revenue, unknownBanks };
  }

  // ---------------------------------------------------------------------------
  // Форма 4R — процентные разрывы
  // ---------------------------------------------------------------------------

  function emptyBuckets() { const o = {}; R4_BUCKETS.forEach(b => (o[b] = 0)); return o; }

  function computeR4(tt, r3, settings, log) {
    const ix = makeIndex(tt);
    const sens = Object.assign({}, DEFAULT_SENS, settings.sens || {});
    // Доля займов с плавающей ставкой
    const fixedL = ix.plainVal('AC=ZZ2001010100'), floatL = ix.plainVal('AC=ZZ2001020100');
    const fixedS = ix.plainVal('AC=ZZ2001010200'), floatS = ix.plainVal('AC=ZZ2001020300');
    const floatShareLoans = (fixedL + floatL) ? floatL / (fixedL + floatL) : 0;
    const floatShareSec = (fixedS + floatS) ? floatS / (fixedS + floatS) : 0;
    const factors = {};
    for (const c of R4_CATS) {
      let f = sens[c.key];
      if (f === 'auto') {
        const loansTot = ((r3.lines[41] || {}).total || 0) + ((r3.lines[50] || {}).total || 0);
        f = loansTot ? floatShareLoans : 0;
        log.push({ level: 'info', form: '4R', msg: `Займы полученные: доля с плавающей ставкой по ТТ ${(floatShareLoans * 100).toFixed(1)}% (плавающая ${fmt(floatL)}, фиксированная ${fmt(fixedL)}); долговые ЦБ: ${(floatShareSec * 100).toFixed(1)}%.` });
      }
      factors[c.key] = Math.max(0, Math.min(1, num(f)));
    }

    // Валютная структура по категориям (из R3), по группам тенге/доллар/прочие
    const curSplit = (rows) => { const o = { KZT: 0, USD: 0, OTHER: 0 }; rows.forEach(r => { const l = r3.lines[r]; if (l) R3_CURS.forEach(k => (o[r4Cur(k)] += l.cur[k] || 0)); }); return o; };
    const shareOf = (o) => { const t = o.KZT + o.USD + o.OTHER; return t ? { KZT: o.KZT / t, USD: o.USD / t, OTHER: o.OTHER / t } : { KZT: 1, USD: 0, OTHER: 0 }; };

    // gross[cat][cur][bucket] — валовые суммы до применения коэффициентов чувствительности
    const gross = {};
    const init = (k) => { gross[k] = { KZT: emptyBuckets(), USD: emptyBuckets(), OTHER: emptyBuckets() }; return gross[k]; };
    const put = (k, cur, b, v) => { if (!gross[k]) init(k); gross[k][cur][b] += v; };
    const putSplit = (k, shares, b, v) => { R4_CURS.forEach(c => put(k, c, b, v * shares[c])); };

    // --- Обязательства: таблица риска ликвидности (ZZ45010xxx × DC47.00x) ---
    const bucketOfDC = { 'DC=DC47.001': 'b1', 'DC=DC47.002': 'b2', 'DC=DC47.003': 'b3', 'DC=DC47.004': 'b4', 'DC=DC47.005': 'b4', 'DC=DC47.006': 'b5' };
    const liqRows = ix.rows.filter(x => /^AC=ZZ45010[3-9]\d{4}$/.test(x.acN) && bucketOfDC[x.dc]);
    const liqCat = (name) => {
      const n = name.toUpperCase();
      if (/ЗАЙМ/.test(n)) return 'loans';
      if (/ПРАВИТЕЛЬСТВ/.test(n)) return 'gov';
      if (/АРЕНД/.test(n)) return 'lease';
      if (/ПРОИЗВОДН/.test(n)) return 'deriv';
      if (/КРЕДИТОРСК/.test(n)) return 'payables';
      if (/ПОДОХОДН/.test(n)) return 'incometax';
      if (/ГАРАНТ/.test(n)) return 'guarantee';
      return 'other';
    };
    const liq = {};
    for (const x of liqRows) {
      const cat = liqCat(x.name); const b = bucketOfDC[x.dc];
      (liq[cat] || (liq[cat] = emptyBuckets()))[b] += x.total;
    }
    const liqTotal = (cat) => liq[cat] ? sumObj(liq[cat]) : 0;
    const leaseCur = settings.leaseCurrency || 'KZT';
    const catShares = {
      loans: shareOf(curSplit([41, 50])),
      gov: shareOf(curSplit([44, 53])),
      lease: { KZT: leaseCur === 'KZT' ? 1 : 0, USD: leaseCur === 'USD' ? 1 : 0, OTHER: leaseCur === 'OTHER' ? 1 : 0 },
      deriv: shareOf(curSplit([43, 52])),
      payables: shareOf(curSplit([46, 55])),
      other: shareOf(curSplit([48, 57])),
      guarantee: { KZT: 1, USD: 0, OTHER: 0 },
    };
    const mapLiq = { loans: 'loans', gov: 'gov', lease: 'lease', deriv: 'derivL', payables: 'payables', other: 'otherL', guarantee: 'otherL' };
    for (const cat in liq) {
      if (cat === 'incometax') continue; // налоги не являются процентными инструментами
      const key = mapLiq[cat]; const sh = catShares[cat] || { KZT: 1, USD: 0, OTHER: 0 };
      R4_BUCKETS.forEach(b => { if (liq[cat][b]) putSplit(key, sh, b, liq[cat][b]); });
    }
    // Если по категории нет таблицы ликвидности — берём баланс: краткосрочные → 3–12 мес., долгосрочные → 1–5 лет
    const fallbackL = [
      ['loans', [41], [50]], ['gov', [44], [53]], ['lease', [45], [54]], ['derivL', [43], [52]], ['payables', [46], [55]], ['otherL', [48], [57]], ['clients', [42], [51]], ['employee', [47], [56]],
    ];
    for (const [key, st, lt] of fallbackL) {
      const have = gross[key] ? R4_CURS.reduce((s, c) => s + sumObj(gross[key][c]), 0) : 0;
      const bsTot = [...st, ...lt].reduce((s, r) => s + ((r3.lines[r] || {}).total || 0), 0);
      if (!have && bsTot) {
        const shS = shareOf(curSplit(st)), shL = shareOf(curSplit(lt));
        const vS = st.reduce((s, r) => s + ((r3.lines[r] || {}).total || 0), 0), vL = lt.reduce((s, r) => s + ((r3.lines[r] || {}).total || 0), 0);
        if (vS) putSplit(key, shS, 'b3', vS);
        if (vL) putSplit(key, shL, 'b4', vL);
        if (key !== 'clients' && key !== 'employee') log.push({ level: 'note', form: '4R', msg: `${R4_CATS.find(c => c.key === key).name}: в ТТ нет раскрытия по срокам (риск ликвидности) — краткосрочная часть отнесена в «от 3 до 12 мес.», долгосрочная — в «от 1 до 5 лет».` });
      } else if (have && bsTot && Math.abs(have - bsTot) > 1) {
        log.push({ level: 'info', form: '4R', msg: `${R4_CATS.find(c => c.key === key).name}: сумма по срокам (риск ликвидности) ${fmt(have)} отличается от баланса ${fmt(bsTot)} — в таблице ликвидности могут быть недисконтированные потоки.` });
      }
    }
    if (settings.leaseCurrency == null && liqTotal('lease')) log.push({ level: 'note', form: '4R', msg: 'Обязательства по аренде отнесены в тенге (в ТТ нет валютного разреза по аренде); валюту можно задать в настройках.' });

    // --- Активы ---
    // Денежные средства на депозитах (до 3 мес.) → до 1 мес.; текущие счета не включаются
    const cashDep = ix.curRows('AC=A10501010000');
    for (const x of cashDep) put('deposits', r4Cur(x.cur), 'b1', x.total);
    // Краткосрочные банковские вклады → 3–12 мес.
    [...ix.curRows('AC=A11999010100'), ...ix.curRows('AC=A11999010200')].forEach(x => put('deposits', r4Cur(x.cur), 'b3', x.total));
    // Долгосрочные вклады: по срокам DC47 (до 1 года → 3–12 мес., 1–5 лет, свыше 5)
    const ltDepMat = ix.rows.filter(x => x.acN.startsWith('{AC=A20902010000}+{AC=A20902030000}') && x.dc);
    const ltDepShares = shareOf(curSplit([34]));
    if (ltDepMat.length) {
      for (const x of ltDepMat) {
        let b = null;
        if (/DC47\.00[123]/.test(x.dc)) b = 'b3'; else if (/DC47\.00[45]/.test(x.dc)) b = 'b4'; else if (/DC47\.006/.test(x.dc)) b = 'b5';
        if (b && x.total) putSplit('deposits', ltDepShares, b, x.total);
      }
    } else if ((r3.lines[34] || {}).total) putSplit('deposits', ltDepShares, 'b4', r3.lines[34].total);
    // Займы выданные: краткосрочные → 3–12 мес., долгосрочные → 1–5 лет
    if ((r3.lines[26] || {}).total) putSplit('loansGiven', shareOf(curSplit([26])), 'b3', r3.lines[26].total);
    if ((r3.lines[33] || {}).total) putSplit('loansGiven', shareOf(curSplit([33])), 'b4', r3.lines[33].total);
    if ((r3.lines[28] || {}).total) putSplit('derivA', shareOf(curSplit([28])), 'b3', r3.lines[28].total);
    if ((r3.lines[35] || {}).total) putSplit('derivA', shareOf(curSplit([35])), 'b4', r3.lines[35].total);
    if ((r3.lines[29] || {}).total) putSplit('finAssets', shareOf(curSplit([29])), 'b3', r3.lines[29].total);
    if ((r3.lines[36] || {}).total) putSplit('finAssets', shareOf(curSplit([36])), 'b4', r3.lines[36].total);
    if ((r3.lines[30] || {}).total) putSplit('receivables', shareOf(curSplit([30])), 'b3', r3.lines[30].total);
    if ((r3.lines[37] || {}).total) putSplit('receivables', shareOf(curSplit([37])), 'b4', r3.lines[37].total);

    // --- Применение коэффициентов чувствительности ---
    const cells = {}; // row -> buckets
    const catTotals = {};
    for (const c of R4_CATS) {
      const g = gross[c.key];
      catTotals[c.key] = { gross: 0, sensitive: 0, factor: factors[c.key] };
      for (const cur of R4_CURS) {
        const row = c.rows[cur];
        const b = emptyBuckets();
        if (g) R4_BUCKETS.forEach(k => { b[k] = round2(g[cur][k] * factors[c.key]); catTotals[c.key].gross += g[cur][k]; catTotals[c.key].sensitive += b[k]; });
        cells[row] = b;
      }
    }
    const equity = r3.equity || 0;
    const sensA = R4_CATS.filter(c => c.side === 'A').reduce((s, c) => s + catTotals[c.key].sensitive, 0);
    const sensL = R4_CATS.filter(c => c.side === 'L').reduce((s, c) => s + catTotals[c.key].sensitive, 0);
    const base = (r3.bs.assets || 0) + (r3.bs.liabilities || 0);
    const share = base ? (sensA + sensL) / base : 0;
    const threshold = 0.05;
    const blank = share < threshold;
    const reason = blank
      ? `Форма 4R не заполняется: доля активов и обязательств, чувствительных к изменению процентных ставок (плавающая ставка), составляет ${(share * 100).toFixed(2)}% от суммы активов и обязательств (${fmt(sensA + sensL)} из ${fmt(base)} тыс. тенге), что ниже порога 5%.`
      : `Доля чувствительных активов и обязательств ${(share * 100).toFixed(2)}% от суммы активов и обязательств — форма подлежит заполнению.`;
    log.push({ level: blank ? 'note' : 'info', form: '4R', msg: reason });
    return { cells, gross, factors, catTotals, liq, equity, sensA, sensL, base, share, blank, reason, floatShareLoans, floatShareSec };
  }

  /** Итоги 4R по ячейкам (с учётом правок). */
  function r4Totals(cells) {
    const sum = (rows) => { const b = emptyBuckets(); rows.forEach(r => { const c = cells[r]; if (c) R4_BUCKETS.forEach(k => (b[k] += c[k] || 0)); }); return b; };
    const aRows = [], lRows = [];
    R4_CATS.forEach(c => R4_CURS.forEach(cur => (c.side === 'A' ? aRows : lRows).push(c.rows[cur])));
    const A = sum(aRows), L = sum(lRows); const gap = emptyBuckets(); R4_BUCKETS.forEach(k => (gap[k] = A[k] - L[k]));
    const byCur = {};
    R4_CURS.forEach(cur => { const a = sum(R4_CATS.filter(c => c.side === 'A').map(c => c.rows[cur])), l = sum(R4_CATS.filter(c => c.side === 'L').map(c => c.rows[cur])); const g = emptyBuckets(); R4_BUCKETS.forEach(k => (g[k] = a[k] - l[k])); byCur[cur] = g; });
    return { assets: A, liabilities: L, gap, byCur, assetsTotal: sumObj(A), liabilitiesTotal: sumObj(L), gapTotal: sumObj(A) - sumObj(L) };
  }

  // ---------------------------------------------------------------------------
  // Полный расчёт
  // ---------------------------------------------------------------------------

  function compute(tt, settings) {
    settings = settings || {};
    const log = [];
    const r3 = computeR3(tt, settings, log);
    const r2 = computeR2(tt, r3, settings, log);
    const r4 = computeR4(tt, r3, settings, log);
    return { r3, r2, r4, log, info: tt.info };
  }

  function fmt(n) {
    if (n == null || isNaN(n)) return '—';
    const neg = n < 0; const a = Math.abs(n);
    const s = a >= 100 ? Math.round(a).toString() : a.toFixed(2).replace(/\.?0+$/, '');
    const parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (neg ? '-' : '') + parts.join(',');
  }

  return {
    R3_CURS, R3_CUR_COL, R3_PREV_COL, CUR_LABEL, R3_LINES, R4_BUCKETS, R4_BUCKET_COL, R4_BUCKET_LABEL, R4_CURS, R4_CATS, DEFAULT_SENS, R2_COLS, R2_COL_LABEL, COUNTRY_RULES,
    parseTT, compute, computeR3, computeR2, computeR4, r3Totals, r4Totals, countryFor, periodFromDP, periodFromLabel, fmt, num, emptyCur, emptyBuckets, cellVal,
  };
});

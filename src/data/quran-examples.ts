import type { QuranExample } from '@/types';

/**
 * Короткие примеры из Корана. Использованы только широко известные аяты
 * (аль-Фатиха, аль-Ихляс, Курайш, аль-Масад, аль-Фаляк); написание — учебное,
 * с полными харакатами. Номера сур и аятов проверены.
 * baseIndex — порядковый номер базовой буквы в строке (без огласовок).
 */
export const quranExamples: QuranExample[] = [
  {
    id: 'sirat-mustaqim',
    arabic: 'الصِّرَاطَ الْمُسْتَقِيمَ',
    translit: 'ас-сырата-ль-мустакым',
    translation: '«…прямым путём»',
    source: '1:6',
    sourceName: 'сура «аль-Фатиха», аят 6',
    highlights: [
      {
        letter: 'sad',
        baseIndex: 2,
        sifatIds: ['safir', 'itbaq', 'istila', 'hams'],
        note: 'ص звучит объёмно (итбак + исти‘ля) и со свистом (сафир) — сравни с лёгкой س.',
      },
      {
        letter: 'sin',
        baseIndex: 9,
        sifatIds: ['hams', 'rakhawa', 'safir'],
        note: 'سْ с сукуном: слышен свободный поток воздуха (хамс) и свист (сафир).',
      },
      {
        letter: 'tta',
        baseIndex: 5,
        sifatIds: ['itbaq', 'istila', 'shidda'],
        note: 'ط — самая сильная буква: язык «накрывает» нёбо, звук твёрдый и упругий.',
      },
    ],
  },
  {
    id: 'dallin',
    arabic: 'وَلَا الضَّالِّينَ',
    translit: 'ва ля-д-даллин',
    translation: '«…и не заблудших»',
    source: '1:7',
    sourceName: 'сура «аль-Фатиха», аят 7',
    highlights: [
      {
        letter: 'dad',
        baseIndex: 5,
        sifatIds: ['istitala', 'itbaq', 'istila', 'rakhawa'],
        note: 'ضّ с шаддой: звук тянется вдоль бокового края языка (иститаля) и звучит твёрдо.',
      },
      {
        letter: 'lam',
        baseIndex: 7,
        sifatIds: ['tawassut', 'inhiraf'],
        note: 'لّ — звук обтекает кончик языка по бокам (инхираф), течёт наполовину (тавассут).',
      },
    ],
  },
  {
    id: 'nastain',
    arabic: 'إِيَّاكَ نَسْتَعِينُ',
    translit: 'иййака наста‘ин',
    translation: '«Тебя одного просим о помощи»',
    source: '1:5',
    sourceName: 'сура «аль-Фатиха», аят 5',
    highlights: [
      {
        letter: 'kaf',
        baseIndex: 3,
        sifatIds: ['hams', 'shidda'],
        note: 'ك — редкое сочетание: звук запирается (шидда), а после размыкания слышен выдох (хамс).',
      },
      {
        letter: 'sin',
        baseIndex: 5,
        sifatIds: ['hams', 'rakhawa', 'safir'],
        note: 'سْ с сукуном: поток воздуха и свист слышны особенно ясно.',
      },
      {
        letter: 'ayn',
        baseIndex: 7,
        sifatIds: ['jahr', 'tawassut'],
        note: 'ع — звонкий сдавленный звук из середины горла, без утечки дыхания (джахр).',
      },
    ],
  },
  {
    id: 'ahad',
    arabic: 'قُلْ هُوَ اللَّهُ أَحَدٌ',
    translit: 'куль хува-Ллаху ахад',
    translation: '«Скажи: Он — Аллах Единый»',
    source: '112:1',
    sourceName: 'сура «аль-Ихляс», аят 1',
    highlights: [
      {
        letter: 'qaf',
        baseIndex: 0,
        sifatIds: ['istila', 'shidda', 'jahr'],
        note: 'ق — глубокий твёрдый звук из корня языка.',
      },
      {
        letter: 'lam',
        baseIndex: 1,
        sifatIds: ['tawassut', 'inhiraf'],
        note: 'لْ с сукуном: звук «обтекает» язык по бокам.',
      },
      {
        letter: 'dal',
        baseIndex: 10,
        sifatIds: ['qalqala', 'shidda', 'jahr'],
        note: 'При остановке د становится сакинной — слышен упругий «отскок»: большая калькаля.',
      },
    ],
  },
  {
    id: 'quraysh',
    arabic: 'لِإِيلَافِ قُرَيْشٍ',
    translit: 'ли-иляфи курайш',
    translation: '«Ради единения курайшитов»',
    source: '106:1',
    sourceName: 'сура «Курайш», аят 1',
    highlights: [
      {
        letter: 'ya',
        baseIndex: 8,
        sifatIds: ['lin'],
        note: 'يْ с сукуном после фатхи — буква лина: произносится мягко, без нажима.',
      },
      {
        letter: 'shin',
        baseIndex: 9,
        sifatIds: ['tafashshi', 'hams', 'rakhawa'],
        note: 'При остановке ش разливается по рту (тафашши) с шелестом воздуха.',
      },
      {
        letter: 'fa',
        baseIndex: 5,
        sifatIds: ['hams', 'rakhawa'],
        note: 'ف — лёгкая буква: дыхание проходит свободно.',
      },
    ],
  },
  {
    id: 'khawf',
    arabic: 'وَآمَنَهُم مِّنْ خَوْفٍ',
    translit: 'ва аманахум мин хауф',
    translation: '«…и избавил их от страха»',
    source: '106:4',
    sourceName: 'сура «Курайш», аят 4',
    highlights: [
      {
        letter: 'kha',
        baseIndex: 8,
        sifatIds: ['istila', 'hams', 'rakhawa'],
        note: 'خ — твёрдая (исти‘ля), но с текущим шумным выдохом.',
      },
      {
        letter: 'waw',
        baseIndex: 9,
        sifatIds: ['lin'],
        note: 'وْ с сукуном после фатхи — лин: мягкое скольжение, не мадд.',
      },
    ],
  },
  {
    id: 'tabbat',
    arabic: 'تَبَّتْ يَدَا أَبِي لَهَبٍ وَتَبَّ',
    translit: 'таббат йада аби ляхабин ва табб',
    translation: '«Да пропадут руки Абу Ляхаба, и сам он пропал»',
    source: '111:1',
    sourceName: 'сура «аль-Масад», аят 1',
    highlights: [
      {
        letter: 'ta',
        baseIndex: 2,
        sifatIds: ['hams', 'shidda'],
        note: 'تْ: звук сначала запирается (шидда), затем слышен короткий выдох (хамс).',
      },
      {
        letter: 'ba',
        baseIndex: 14,
        sifatIds: ['qalqala', 'shidda', 'jahr'],
        note: 'بّ на остановке с шаддой — самая сильная (кубра) калькаля.',
      },
    ],
  },
  {
    id: 'falaq',
    arabic: 'قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ',
    translit: 'куль а‘узу би-рабби-ль-фаляк',
    translation: '«Скажи: прибегаю к Господу рассвета»',
    source: '113:1',
    sourceName: 'сура «аль-Фаляк», аят 1',
    highlights: [
      {
        letter: 'qaf',
        baseIndex: 13,
        sifatIds: ['qalqala', 'istila', 'shidda'],
        note: 'При остановке ق даёт гулкий глубокий «отскок» — большая калькаля.',
      },
      {
        letter: 'dhal',
        baseIndex: 5,
        sifatIds: ['jahr', 'rakhawa'],
        note: 'ذ — межзубный звонкий звук, течёт свободно.',
      },
      {
        letter: 'ra',
        baseIndex: 7,
        sifatIds: ['takrir', 'jahr', 'tawassut'],
        note: 'ر — один лёгкий удар языка; вибрацию (такрир) сдерживаем.',
      },
    ],
  },
];

export const quranExampleById = Object.fromEntries(quranExamples.map((e) => [e.id, e]));

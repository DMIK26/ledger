/**
 * Telugu and Hindi for quick add: native digits, rupee, cash and date words, and everyday spending
 * words. Each word is listed in its script and in the Roman spellings people type on English keyboards.
 * The merchant keeps whatever script the user typed; only recognition is added here.
 */

const DEVANAGARI_ZERO = 0x0966;
const TELUGU_ZERO = 0x0c66;

/** Turns Devanagari and Telugu digits into 0-9. One code unit each, so text positions do not move. */
export function nativeDigits(text: string): string {
  return text.replace(/[०-९౦-౯]/g, (ch) => {
    const code = ch.charCodeAt(0);
    const base = code >= TELUGU_ZERO ? TELUGU_ZERO : DEVANAGARI_ZERO;
    return String(code - base);
  });
}

/** Word boundaries that also work for Indian scripts (JavaScript's \b only knows a-z, 0-9 and _). */
export const B_START = String.raw`(?<![\p{L}\p{M}\p{N}_])`;
export const B_END = String.raw`(?![\p{L}\p{M}\p{N}_])`;

/** Rupee words that may stand before or after an amount. */
export const RUPEE_WORDS = [
  'रु',
  'रू',
  'रुपये',
  'रुपए',
  'रुपया',
  'రూ',
  'రూపాయలు',
  'రూపాయి',
  'rupaye',
  'rupaiye',
  'rupayalu',
  'rupaayalu',
];
/** Rupee words that can be glued to the front of a number ("రూ.50"). */
export const RUPEE_PREFIXES = ['रु', 'रू', 'రూ'];

export const CASH_WORDS = ['నగదు', 'नकद', 'नक़द', 'nagadu', 'naqad', 'nakad', 'nakd'];

/** Relative date words, by how many days before today they mean. */
export const DATE_WORDS: Record<string, number> = {
  आज: 0,
  aaj: 0,
  ఈరోజు: 0,
  'ఈ రోజు': 0,
  ఇవాళ: 0,
  eeroju: 0,
  'ee roju': 0,
  ivala: 0,
  // कल is both yesterday and tomorrow in Hindi; for an expense already spent it is yesterday.
  कल: 1,
  kal: 1,
  నిన్న: 1,
  ninna: 1,
  परसों: 2,
  परसो: 2,
  parson: 2,
  parso: 2,
  మొన్న: 2,
  monna: 2,
};

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const alternation = (words: readonly string[]): string =>
  [...words]
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join('|');

/** Spending words mapped to the default category ids. Scripts first, then Roman spellings. */
export const INDIC_KEYWORDS: Record<string, string[]> = {
  food: [
    'चाय', 'नाश्ता', 'खाना', 'समोसा', 'मिठाई', 'कॉफी', 'कॉफ़ी',
    'టీ', 'చాయ్', 'కాఫీ', 'టిఫిన్', 'భోజనం', 'బిర్యానీ', 'ఇడ్లీ', 'దోశ', 'దోసె',
    'nashta', 'naashta', 'khana', 'khaana', 'mithai', 'samosa', 'bhojanam', 'bojanam', 'bhojan',
    'chaay', 'chaya',
  ],
  groceries: [
    'दूध', 'सब्ज़ी', 'सब्जी', 'किराना', 'फल', 'आटा', 'चावल', 'दाल',
    'పాలు', 'కూరగాయలు', 'కిరాణా', 'పండ్లు', 'బియ్యం', 'పప్పు',
    'doodh', 'dudh', 'sabzi', 'sabji', 'subzi', 'paalu', 'palu', 'kooragayalu', 'kuragayalu',
    'biyyam', 'pandlu', 'pappu', 'aata', 'chawal',
  ],
  housing: [
    'किराया', 'बिजली', 'पानी', 'गैस', 'रिचार्ज',
    'అద్దె', 'కరెంట్', 'కరెంటు', 'నీళ్ళు', 'నీళ్లు', 'గ్యాస్', 'రీఛార్జ్',
    'kiraya', 'kiraaya', 'bijli', 'adde', 'karentu',
  ],
  health: [
    'दवा', 'दवाई', 'डॉक्टर', 'अस्पताल',
    'మందులు', 'డాక్టర్', 'ఆసుపత్రి', 'హాస్పిటల్',
    'dawai', 'dawa', 'davai', 'mandulu',
  ],
  shopping: ['कपड़े', 'कपडे', 'जूते', 'బట్టలు', 'చెప్పులు', 'kapde', 'kapda', 'battalu', 'cheppulu'],
  transport: [
    'पेट्रोल', 'ऑटो', 'बस', 'टैक्सी', 'ट्रेन',
    'పెట్రోల్', 'ఆటో', 'బస్సు', 'బస్', 'రైలు',
  ],
  entertainment: ['फ़िल्म', 'फिल्म', 'सिनेमा', 'సినిమా', 'sinima'],
  education: ['फीस', 'किताब', 'किताबें', 'ఫీజు', 'పుస్తకాలు', 'పుస్తకం', 'kitab', 'kitaab'],
};

/** Keyword lists in Unicode normal form C, so typed text and the lists compare equal. */
export const INDIC_KEYWORDS_NFC: Record<string, string[]> = Object.fromEntries(
  Object.entries(INDIC_KEYWORDS).map(([id, words]) => [id, words.map((w) => w.normalize('NFC'))]),
);

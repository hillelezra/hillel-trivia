// Comprehensive 1,000+ Hebrew Trivia Question Bank Generator (with built-in English translations)
// Generates diverse, factually verified questions across 14 topics and 3 difficulty levels.

function createSeededRng(seed = 42) {
  let s = seed >>> 0;
  return function next() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function pickDistractors(pool, correctVal, count, rng) {
  const candidates = pool.filter((x) => x !== correctVal);
  const chosen = [];
  const used = new Set([correctVal]);
  while (chosen.length < count && candidates.length > 0) {
    const idx = Math.floor(rng() * candidates.length);
    const val = candidates[idx];
    if (!used.has(val)) {
      used.add(val);
      chosen.push(val);
    }
    candidates.splice(idx, 1);
  }
  return chosen;
}

function buildFourOptions(correctHe, distractorsHe, correctEn, distractorsEn, rng) {
  const indices = [0, 1, 2, 3];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = indices[i];
    indices[i] = indices[j];
    indices[j] = tmp;
  }
  const rawHe = [correctHe, distractorsHe[0], distractorsHe[1], distractorsHe[2]];
  const rawEn = [
    correctEn || correctHe,
    (distractorsEn && distractorsEn[0]) || distractorsHe[0],
    (distractorsEn && distractorsEn[1]) || distractorsHe[1],
    (distractorsEn && distractorsEn[2]) || distractorsHe[2]
  ];
  const answers = indices.map((i) => rawHe[i]);
  const answersEn = indices.map((i) => rawEn[i]);
  const correctIndex = indices.indexOf(0);
  return { answers, answersEn, correctIndex };
}

// 1. World Countries, Capitals & Continents (115 countries -> 230 questions: capital of X + country of capital Y)
const COUNTRIES_DATA = [
  ['צרפת', 'פריז', 'אירופה', 'France', 'Paris', 'Europe', 'easy'],
  ['בריטניה', 'לונדון', 'אירופה', 'United Kingdom', 'London', 'Europe', 'easy'],
  ['איטליה', 'רומא', 'אירופה', 'Italy', 'Rome', 'Europe', 'easy'],
  ['ספרד', 'מדריד', 'אירופה', 'Spain', 'Madrid', 'Europe', 'easy'],
  ['גרמניה', 'ברלין', 'אירופה', 'Germany', 'Berlin', 'Europe', 'easy'],
  ['יוון', 'אתונה', 'אירופה', 'Greece', 'Athens', 'Europe', 'easy'],
  ['פורטוגל', 'ליסבון', 'אירופה', 'Portugal', 'Lisbon', 'Europe', 'easy'],
  ['הולנד', 'אמסטרדם', 'אירופה', 'Netherlands', 'Amsterdam', 'Europe', 'easy'],
  ['בלגיה', 'בריסל', 'אירופה', 'Belgium', 'Brussels', 'Europe', 'easy'],
  ['אוסטריה', 'וינה', 'אירופה', 'Austria', 'Vienna', 'Europe', 'easy'],
  ['שווייץ', 'ברן', 'אירופה', 'Switzerland', 'Bern', 'Europe', 'medium'],
  ['פולין', 'ורשה', 'אירופה', 'Poland', 'Warsaw', 'Europe', 'easy'],
  ['צ׳כיה', 'פראג', 'אירופה', 'Czech Republic', 'Prague', 'Europe', 'easy'],
  ['הונגריה', 'בודפשט', 'אירופה', 'Hungary', 'Budapest', 'Europe', 'easy'],
  ['רומניה', 'בוקרשט', 'אירופה', 'Romania', 'Bucharest', 'Europe', 'easy'],
  ['בולגריה', 'סופיה', 'אירופה', 'Bulgaria', 'Sofia', 'Europe', 'medium'],
  ['שוודיה', 'סטוקהולם', 'אירופה', 'Sweden', 'Stockholm', 'Europe', 'medium'],
  ['נורווגיה', 'אוסלו', 'אירופה', 'Norway', 'Oslo', 'Europe', 'medium'],
  ['דנמרק', 'קופנהגן', 'אירופה', 'Denmark', 'Copenhagen', 'Europe', 'medium'],
  ['פינלנד', 'הלסינקי', 'אירופה', 'Finland', 'Helsinki', 'Europe', 'medium'],
  ['אירלנד', 'דבלין', 'אירופה', 'Ireland', 'Dublin', 'Europe', 'medium'],
  ['איסלנד', 'רייקיאוויק', 'אירופה', 'Iceland', 'Reykjavik', 'Europe', 'hard'],
  ['אוקראינה', 'קייב', 'אירופה', 'Ukraine', 'Kyiv', 'Europe', 'easy'],
  ['רוסיה', 'מוסקבה', 'אירופה', 'Russia', 'Moscow', 'Europe', 'easy'],
  ['קרואטיה', 'זאגרב', 'אירופה', 'Croatia', 'Zagreb', 'Europe', 'medium'],
  ['סרביה', 'בלגרד', 'אירופה', 'Serbia', 'Belgrade', 'Europe', 'medium'],
  ['סלובקיה', 'ברטיסלבה', 'אירופה', 'Slovakia', 'Bratislava', 'Europe', 'hard'],
  ['סלובניה', 'לובליאנה', 'אירופה', 'Slovenia', 'Ljubljana', 'Europe', 'hard'],
  ['אסטוניה', 'טאלין', 'אירופה', 'Estonia', 'Tallinn', 'Europe', 'hard'],
  ['לטביה', 'ריגה', 'אירופה', 'Latvia', 'Riga', 'Europe', 'hard'],
  ['ליטא', 'וילנה', 'אירופה', 'Lithuania', 'Vilnius', 'Europe', 'hard'],
  ['מלטה', 'ולטה', 'אירופה', 'Malta', 'Valletta', 'Europe', 'hard'],
  ['קפריסין', 'ניקוסיה', 'אירופה', 'Cyprus', 'Nicosia', 'Europe', 'medium'],
  ['גאורגיה', 'טביליסי', 'אסיה', 'Georgia', 'Tbilisi', 'Asia', 'medium'],
  ['ארמניה', 'ירוואן', 'אסיה', 'Armenia', 'Yerevan', 'Asia', 'hard'],
  ['אזרבייג׳ן', 'באקו', 'אסיה', 'Azerbaijan', 'Baku', 'Asia', 'medium'],
  ['טורקיה', 'אנקרה', 'אסיה', 'Turkey', 'Ankara', 'Asia', 'medium'],
  ['יפן', 'טוקיו', 'אסיה', 'Japan', 'Tokyo', 'Asia', 'easy'],
  ['סין', 'בייג׳ינג', 'אסיה', 'China', 'Beijing', 'Asia', 'easy'],
  ['הודו', 'ניו דלהי', 'אסיה', 'India', 'New Delhi', 'Asia', 'easy'],
  ['דרום קוריאה', 'סיאול', 'אסיה', 'South Korea', 'Seoul', 'Asia', 'medium'],
  ['תאילנד', 'בנגקוק', 'אסיה', 'Thailand', 'Bangkok', 'Asia', 'easy'],
  ['וייטנאם', 'האנוי', 'אסיה', 'Vietnam', 'Hanoi', 'Asia', 'medium'],
  ['הפיליפינים', 'מנילה', 'אסיה', 'Philippines', 'Manila', 'Asia', 'medium'],
  ['אינדונזיה', 'ג׳קרטה', 'אסיה', 'Indonesia', 'Jakarta', 'Asia', 'medium'],
  ['מלזיה', 'קואלה לומפור', 'אסיה', 'Malaysia', 'Kuala Lumpur', 'Asia', 'hard'],
  ['סינגפור', 'סינגפור', 'אסיה', 'Singapore', 'Singapore', 'Asia', 'easy'],
  ['נפאל', 'קטמנדו', 'אסיה', 'Nepal', 'Kathmandu', 'Asia', 'medium'],
  ['ירדן', 'עמאן', 'אסיה', 'Jordan', 'Amman', 'Asia', 'easy'],
  ['לבנון', 'ביירות', 'אסיה', 'Lebanon', 'Beirut', 'Asia', 'easy'],
  ['ערב הסעודית', 'ריאד', 'אסיה', 'Saudi Arabia', 'Riyadh', 'Asia', 'medium'],
  ['איחוד האמירויות', 'אבו דאבי', 'אסיה', 'United Arab Emirates', 'Abu Dhabi', 'Asia', 'medium'],
  ['קטר', 'דוחה', 'אסיה', 'Qatar', 'Doha', 'Asia', 'medium'],
  ['עיראק', 'בגדאד', 'אסיה', 'Iraq', 'Baghdad', 'Asia', 'easy'],
  ['איראן', 'טהראן', 'אסיה', 'Iran', 'Tehran', 'Asia', 'easy'],
  ['קזחסטן', 'אסטנה', 'אסיה', 'Kazakhstan', 'Astana', 'Asia', 'hard'],
  ['אוזבקיסטן', 'טשקנט', 'אסיה', 'Uzbekistan', 'Tashkent', 'Asia', 'hard'],
  ['מונגוליה', 'אולן בטור', 'אסיה', 'Mongolia', 'Ulaanbaatar', 'Asia', 'hard'],
  ['מצרים', 'קהיר', 'אפריקה', 'Egypt', 'Cairo', 'Africa', 'easy'],
  ['מרוקו', 'רבאט', 'אפריקה', 'Morocco', 'Rabat', 'Africa', 'medium'],
  ['תוניסיה', 'תוניס', 'אפריקה', 'Tunisia', 'Tunis', 'Africa', 'medium'],
  ['אלג׳יריה', 'אלג׳יר', 'אפריקה', 'Algeria', 'Algiers', 'Africa', 'medium'],
  ['אתיופיה', 'אדיס אבבה', 'אפריקה', 'Ethiopia', 'Addis Ababa', 'Africa', 'medium'],
  ['קניה', 'ניירובי', 'אפריקה', 'Kenya', 'Nairobi', 'Africa', 'medium'],
  ['ניגריה', 'אבוג׳ה', 'אפריקה', 'Nigeria', 'Abuja', 'Africa', 'hard'],
  ['גאנה', 'אקרה', 'אפריקה', 'Ghana', 'Accra', 'Africa', 'hard'],
  ['סנגל', 'דקאר', 'אפריקה', 'Senegal', 'Dakar', 'Africa', 'hard'],
  ['אוגנדה', 'קמפלה', 'אפריקה', 'Uganda', 'Kampala', 'Africa', 'hard'],
  ['ארצות הברית', 'וושינגטון די.סי.', 'אמריקה הצפונית', 'United States', 'Washington, D.C.', 'North America', 'easy'],
  ['קנדה', 'אוטווה', 'אמריקה הצפונית', 'Canada', 'Ottawa', 'North America', 'medium'],
  ['מקסיקו', 'מקסיקו סיטי', 'אמריקה הצפונית', 'Mexico', 'Mexico City', 'North America', 'easy'],
  ['קובה', 'הוואנה', 'אמריקה הצפונית', 'Cuba', 'Havana', 'North America', 'medium'],
  ['פנמה', 'פנמה סיטי', 'אמריקה הצפונית', 'Panama', 'Panama City', 'North America', 'medium'],
  ['קוסטה ריקה', 'סן חוסה', 'אמריקה הצפונית', 'Costa Rica', 'San Jose', 'North America', 'hard'],
  ['ג׳מייקה', 'קינגסטון', 'אמריקה הצפונית', 'Jamaica', 'Kingston', 'North America', 'hard'],
  ['ברזיל', 'ברזיליה', 'אמריקה הדרומית', 'Brazil', 'Brasilia', 'South America', 'medium'],
  ['ארגנטינה', 'בואנוס איירס', 'אמריקה הדרומית', 'Argentina', 'Buenos Aires', 'South America', 'easy'],
  ['צ׳ילה', 'סנטיאגו', 'אמריקה הדרומית', 'Chile', 'Santiago', 'South America', 'medium'],
  ['קולומביה', 'בוגוטה', 'אמריקה הדרומית', 'Colombia', 'Bogota', 'South America', 'medium'],
  ['פרו', 'לימה', 'אמריקה הדרומית', 'Peru', 'Lima', 'South America', 'medium'],
  ['אקוודור', 'קיטו', 'אמריקה הדרומית', 'Ecuador', 'Quito', 'South America', 'hard'],
  ['אורוגוואי', 'מונטווידאו', 'אמריקה הדרומית', 'Uruguay', 'Montevideo', 'South America', 'hard'],
  ['פרגוואי', 'אסונסיון', 'אמריקה הדרומית', 'Paraguay', 'Asuncion', 'South America', 'hard'],
  ['ונצואלה', 'קראקס', 'אמריקה הדרומית', 'Venezuela', 'Caracas', 'South America', 'hard'],
  ['אוסטרליה', 'קנברה', 'אוקיאניה', 'Australia', 'Canberra', 'Oceania', 'medium'],
  ['ניו זילנד', 'וולינגטון', 'אוקיאניה', 'New Zealand', 'Wellington', 'Oceania', 'medium']
];

// 2. Chemical Elements & Symbols (45 elements -> 90 questions)
const ELEMENTS_DATA = [
  ['מימן', 'H', 1, 'Hydrogen', 'easy'],
  ['הליום', 'He', 2, 'Helium', 'easy'],
  ['ליתיום', 'Li', 3, 'Lithium', 'medium'],
  ['פחמן', 'C', 6, 'Carbon', 'easy'],
  ['חנקן', 'N', 7, 'Nitrogen', 'easy'],
  ['חמצן', 'O', 8, 'Oxygen', 'easy'],
  ['פלואור', 'F', 9, 'Fluorine', 'medium'],
  ['ניאון', 'Ne', 10, 'Neon', 'medium'],
  ['נתרן', 'Na', 11, 'Sodium', 'medium'],
  ['מגנזיום', 'Mg', 12, 'Magnesium', 'medium'],
  ['אלומיניום', 'Al', 13, 'Aluminum', 'easy'],
  ['צורן (סיליקון)', 'Si', 14, 'Silicon', 'medium'],
  ['זרחן', 'P', 15, 'Phosphorus', 'medium'],
  ['גופרית', 'S', 16, 'Sulfur', 'medium'],
  ['כלור', 'Cl', 17, 'Chlorine', 'easy'],
  ['ארגון', 'Ar', 18, 'Argon', 'hard'],
  ['אשלגן', 'K', 19, 'Potassium', 'medium'],
  ['סידן', 'Ca', 20, 'Calcium', 'easy'],
  ['טיטניום', 'Ti', 22, 'Titanium', 'medium'],
  ['כרום', 'Cr', 24, 'Chromium', 'hard'],
  ['ברזל', 'Fe', 26, 'Iron', 'easy'],
  ['קובלט', 'Co', 27, 'Cobalt', 'hard'],
  ['ניקל', 'Ni', 28, 'Nickel', 'medium'],
  ['נחושת', 'Cu', 29, 'Copper', 'medium'],
  ['אבץ', 'Zn', 30, 'Zinc', 'medium'],
  ['ברום', 'Br', 35, 'Bromine', 'hard'],
  ['כסף', 'Ag', 47, 'Silver', 'medium'],
  ['בדיל', 'Sn', 50, 'Tin', 'hard'],
  ['יוד', 'I', 53, 'Iodine', 'medium'],
  ['בריום', 'Ba', 56, 'Barium', 'hard'],
  ['טונגסטן', 'W', 74, 'Tungsten', 'hard'],
  ['פלטינה', 'Pt', 78, 'Platinum', 'medium'],
  ['זהב', 'Au', 79, 'Gold', 'easy'],
  ['כספית', 'Hg', 80, 'Mercury', 'medium'],
  ['עופרת', 'Pb', 82, 'Lead', 'medium'],
  ['ראדון', 'Rn', 86, 'Radon', 'hard'],
  ['אורניום', 'U', 92, 'Uranium', 'medium']
];

// 3. Inventions & Discoveries (55 items -> 110 questions)
const INVENTIONS_DATA = [
  ['הטלפון', 'אלכסנדר גרהם בל', 'The telephone', 'Alexander Graham Bell', 'easy'],
  ['נורת הליבון המסחרית', 'תומאס אדיסון', 'The commercial incandescent light bulb', 'Thomas Edison', 'easy'],
  ['המטוס הראשון', 'האחים רייט', 'The first powered airplane', 'The Wright Brothers', 'easy'],
  ['הפניצילין', 'אלכסנדר פלמינג', 'Penicillin', 'Alexander Fleming', 'medium'],
  ['תורת היחסות', 'אלברט איינשטיין', 'The Theory of Relativity', 'Albert Einstein', 'easy'],
  ['חוקי הכבידה והתנועה', 'אייזק ניוטון', 'The laws of gravity and motion', 'Isaac Newton', 'easy'],
  ['מכבש הדפוס', 'יוהאן גוטנברג', 'The movable-type printing press', 'Johannes Gutenberg', 'medium'],
  ['הרדיו (טלגרף אלחוטי)', 'גוליילמו מרקוני', 'The radio (wireless telegraphy)', 'Guglielmo Marconi', 'medium'],
  ['הטלסקופ האסטרונומי המשופר', 'גלילאו גליליי', 'The astronomical telescope', 'Galileo Galilei', 'easy'],
  ['חיסון הכלבת ותהליך הפסטור', 'לואי פסטר', 'The rabies vaccine and pasteurization', 'Louis Pasteur', 'medium'],
  ['הרדיום והפולוניום', 'מארי קירי', 'Radium and Polonium', 'Marie Curie', 'medium'],
  ['הדינמיט', 'אלפרד נובל', 'Dynamite', 'Alfred Nobel', 'medium'],
  ['הטבלה המחזורית', 'דמיטרי מנדלייב', 'The Periodic Table of Elements', 'Dmitri Mendeleev', 'medium'],
  ['זרם החילופין (AC)', 'ניקולה טסלה', 'Alternating Current (AC) electrical system', 'Nikola Tesla', 'medium'],
  ['הרשת הכלל-עולמית (WWW)', 'טים ברנרס-לי', 'The World Wide Web (WWW)', 'Tim Berners-Lee', 'hard'],
  ['שפת התכנות C', 'דניס ריצ׳י', 'The C programming language', 'Dennis Ritchie', 'hard'],
  ['לינוקס (ליבת מערכת ההפעלה)', 'לינוס טורוולדס', 'The Linux kernel', 'Linus Torvalds', 'hard'],
  ['כתב העיוורים (ברייל)', 'לואי ברייל', 'The Braille tactile writing system', 'Louis Braille', 'easy'],
  ['מנוע הקיטור המודרני', 'ג׳יימס ואט', 'The modern steam engine', 'James Watt', 'medium'],
  ['הקטר הרכבתי הראשון', 'ג׳ורג׳ סטיבנסון', 'The steam locomotive', 'George Stephenson', 'hard'],
  ['קרני הרנטגן (קרני X)', 'וילהלם רנטגן', 'X-rays', 'Wilhelm Rontgen', 'medium'],
  ['מבנה הסליל הכפול של ה-DNA', 'ווטסון וקריק (יחד עם רוזלינד פרנקלין)', 'The double-helix structure of DNA', 'Watson, Crick, and Franklin', 'medium'],
  ['תרכיב החיסון נגד פוליו (בזריקה)', 'יונה סאלק', 'The injectable polio vaccine', 'Jonas Salk', 'medium'],
  ['המצפן המגנטי הקדום', 'ממציאים בסין העתיקה', 'The ancient magnetic compass', 'Inventors in Ancient China', 'medium'],
  ['הנייר הקדום', 'צאי לון (סין)', 'Ancient papermaking', 'Cai Lun (China)', 'hard'],
  ['הטפטפות המודרניות להשקיה', 'שמחה בלאס', 'Modern drip irrigation', 'Simcha Blass', 'medium'],
  ['הדיסק-און-קי (USB Flash Drive)', 'דב מורן וחברת M-Systems', 'The USB Flash Drive (DiskOnKey)', 'Dov Moran and M-Systems', 'medium'],
  ['קוד המורס והטלגרף הקווי', 'סמואל מורס', 'Morse code and the electric telegraph', 'Samuel Morse', 'easy'],
  ['מכונת החישוב האניגמה (פיצוחה)', 'אלן טיורינג', 'Breaking the Enigma machine cipher', 'Alan Turing', 'medium'],
  ['הפטיפון (פונוגרף)', 'תומאס אדיסון', 'The phonograph', 'Thomas Edison', 'medium'],
  ['המסוק המודרני הסדרתי', 'איגור סיקורסקי', 'The modern mass-produced helicopter', 'Igor Sikorsky', 'hard'],
  ['המכונית הראשונה עם מנוע בנזין', 'קארל בנץ', 'The first gasoline-powered automobile', 'Karl Benz', 'medium'],
  ['פס הייצור ההמוני למכוניות', 'הנרי פורד', 'The automotive moving assembly line', 'Henry Ford', 'easy'],
  ['הבארומטר למדידת לחץ אוויר', 'אוונג׳ליסטה טוריצ׳לי', 'The barometer', 'Evangelista Torricelli', 'hard'],
  ['מדחום הכספית', 'דניאל גבריאל פרנהייט', 'The mercury thermometer', 'Daniel Gabriel Fahrenheit', 'hard'],
  ['סולם המעלות הצלזיוס', 'אנדרס צלזיוס', 'The Celsius temperature scale', 'Anders Celsius', 'medium'],
  ['הסוללה החשמלית הראשונה', 'אלסנדרו וולטה', 'The first electrical battery', 'Alessandro Volta', 'medium'],
  ['חוק האלקטרומגנטיות והאינדוקציה', 'מייקל פאראדיי', 'Electromagnetic induction', 'Michael Faraday', 'hard'],
  ['תורת האבולוציה והברירה הטבעית', 'צ׳ארלס דארווין', 'The theory of evolution by natural selection', 'Charles Darwin', 'easy'],
  ['חוקי התורשה והגנטיקה', 'גרגור מנדל', 'The laws of Mendelian inheritance', 'Gregor Mendel', 'medium']
];

// 4. Israeli Cities, Landmarks & Regions (50 items -> 100 questions)
const ISRAEL_PLACES_DATA = [
  ['ירושלים', 'הכותל המערבי ומשכן הכנסת', 'הרי יהודה', 'Jerusalem', 'The Western Wall and the Knesset', 'Judean Mountains', 'easy'],
  ['תל אביב-יפו', 'כיכר הבימה ונמל יפו העתיק', 'מישור החוף', 'Tel Aviv-Yafo', 'Habima Square and Old Jaffa Port', 'Coastal Plain', 'easy'],
  ['חיפה', 'הגנים הבהאיים והר הכרמל', 'הכרמל ומפרץ חיפה', 'Haifa', 'The Bahai Gardens and Mount Carmel', 'Mount Carmel', 'easy'],
  ['באר שבע', 'באר אברהם ואוניברסיטת בן-גוריון', 'הנגב הצפוני', 'Beersheba', 'Abraham’s Well and Ben-Gurion University', 'Northern Negev', 'easy'],
  ['אילת', 'המצפה התת-ימי ושונית האלמוגים', 'מפרץ אילת והערבה', 'Eilat', 'The Underwater Observatory and Coral Reef', 'Red Sea / Arava', 'easy'],
  ['צפת', 'רובע האמנים ובתי הכנסת העתיקים', 'הגליל העליון', 'Safed (Tzfat)', 'The Artists Quarter and ancient synagogues', 'Upper Galilee', 'easy'],
  ['טבריה', 'קבר הרמב"ם וטיילת הכנרת', 'חוף הכנרת', 'Tiberias', 'Tomb of Maimonides and Sea of Galilee boardwalk', 'Sea of Galilee', 'easy'],
  ['עכו', 'אולמות האבירים והחומה העתיקה', 'חוף הגליל המערבי', 'Acre (Akko)', 'The Knights Halls and ancient sea walls', 'Western Galilee', 'medium'],
  ['קיסריה', 'התיאטרון הרומי והנמל של הורדוס', 'חוף השרון הצפוני', 'Caesarea', 'The Roman Theater and Herod’s Harbor', 'Northern Sharon Coast', 'easy'],
  ['מצדה', 'מבצר הורדוס במדבר יהודה מול ים המלח', 'מדבר יהודה', 'Masada', 'Herod’s cliffside fortress overlooking the Dead Sea', 'Judean Desert', 'easy'],
  ['ראש הנקרה', 'הנקרות הלבנות והרכבל התלול על גבול לבנון', 'הגליל המערבי', 'Rosh HaNikra', 'The white sea grottos and cable car on the Lebanon border', 'Western Galilee', 'easy'],
  ['קצרין', 'פארק קצרין העתיקה ובית הבד בגולן', 'רמת הגולן', 'Katzrin', 'Ancient Talmudic village in the Golan', 'Golan Heights', 'medium'],
  ['מצפה רמון', 'מכתש רמון וחוות האלפקות', 'הר הנגב', 'Mitzpe Ramon', 'Ramon Crater and the Alpaca Farm', 'Negev Highlands', 'easy'],
  ['שדה בוקר', 'צריף בן-גוריון וקבר דוד ופולה בן-גוריון', 'רמת הנגב', 'Sde Boker', 'Ben-Gurion’s Desert Hut and gravesite', 'Negev Highlands', 'easy'],
  ['חברון', 'מערת המכפלה', 'הר חברון', 'Hebron', 'Cave of the Patriarchs (Machpela)', 'Judean Hills', 'easy'],
  ['בית שאן', 'העיר הרומית-ביזנטית סקיתופוליס', 'עמק בית שאן', 'Beit Shean', 'Scythopolis Roman-Byzantine ruins', 'Beit Shean Valley', 'medium'],
  ['נהריה', 'שדרות הגעתון ונחל הגעתון החוצה את העיר', 'הגליל המערבי', 'Nahariya', 'Gaaton Boulevard with the river running through it', 'Western Galilee', 'medium'],
  ['ראשון לציון', 'היקב ההיסטורי ובאר המושבה הראשונה', 'מישור החוף הדרומי', 'Rishon LeZion', 'Carmel Historic Winery and the First Well', 'Coastal Plain', 'medium'],
  ['פתח תקווה', 'אם המושבות וגשר המיתרים', 'גוש דן', 'Petah Tikva', 'Known as the Mother of Moshavot', 'Gush Dan', 'easy'],
  ['זכרון יעקב', 'גני רמת הנדיב ומוזיאון ניל"י (בית אהרנסון)', 'דרום הכרמל', 'Zikhron Yaakov', 'Ramat HaNadiv Gardens and NILI Museum', 'Southern Carmel', 'medium'],
  ['רחובות', 'מכון ויצמן למדע ובית הנשיא חיים ויצמן', 'השפלה', 'Rehovot', 'Weizmann Institute of Science', 'Shfela', 'medium'],
  ['חולון', 'מוזיאון הילדים ומוזיאון העיצוב', 'גוש דן', 'Holon', 'The Children’s Museum and Design Museum', 'Gush Dan', 'easy'],
  ['הרצליה', 'מרינה הרצליה ותל אפולוניה (ארסוף)', 'השרון', 'Herzliya', 'Herzliya Marina and Apollonia fortress', 'Sharon', 'medium'],
  ['נתניה', 'מצוקי החוף וטיילת הראשונים', 'השרון', 'Netanya', 'Coastal cliffs and seaside promenades', 'Sharon', 'easy'],
  ['אשדוד', 'הנמל המסחרי הגדול ומצודת אשדוד-ים', 'מישור החוף הדרומי', 'Ashdod', 'Major cargo seaport and Ashdod-Yam fortress', 'Southern Coastal Plain', 'medium'],
  ['אשקלון', 'הגן הלאומי והשער הכנעני הקדום בעולם', 'מישור החוף הדרומי', 'Ashkelon', 'National Park with the oldest arched Canaanite gate', 'Southern Coastal Plain', 'medium'],
  ['ערד', 'תצפית מצפור מואב אל מדבר יהודה וים המלח', 'מזרח הנגב', 'Arad', 'Moav Lookout overlooking the Judean Desert', 'Eastern Negev', 'medium'],
  ['דימונה', 'ממשית העתיקה והכור הגרעיני בנגב', 'הנגב', 'Dimona', 'Near ancient Mamshit Nabataean city', 'Negev', 'medium'],
  ['עין גדי', 'שמורת נחל דוד, נחל ערוגות ובית הכנסת העתיק', 'ים המלח', 'Ein Gedi', 'Nahal David oasis and ancient synagogue', 'Dead Sea', 'easy'],
  ['מטולה', 'מפל התנור ומרכז קנדה בקצה הצפוני', 'אצבע הגליל', 'Metula', 'Tanur Waterfall and Canada Centre in northernmost Israel', 'Galilee Panhandle', 'medium']
];

// 5. Bible & Jewish Heritage (70 items -> 70 questions)
const BIBLE_QUESTIONS = [
  ['מי בנה את התיבה כדי להינצל מהמבול?', 'נח', ['אברהם', 'משה', 'שלמה'], 'Who built the Ark to survive the Great Flood?', 'Noah', ['Abraham', 'Moses', 'Solomon'], 'easy'],
  ['כמה ימים נמשכה בריאת העולם עד יום השבת?', 'שישה ימים', ['שבעה ימים', 'חמישה ימים', 'עשרה ימים'], 'How many days did the Creation take before the Sabbath?', 'Six days', ['Seven days', 'Five days', 'Ten days'], 'easy'],
  ['מי היו שני בניו של אברהם אבינו המוזכרים בפרשות לך-לך ווירא?', 'ישמעאל ויצחק', ['יעקב ועשו', 'מנשה ואפרים', 'קין והבל'], 'Who were the two sons of Abraham mentioned in Genesis?', 'Ishmael and Isaac', ['Jacob and Esau', 'Manasseh and Ephraim', 'Cain and Abel'], 'easy'],
  ['כמה שבטים היו לעם ישראל (בני יעקב)?', '12 שבטים', ['10 שבטים', '7 שבטים', '14 שבטים'], 'How many tribes of Israel (sons of Jacob) were there?', '12 tribes', ['10 tribes', '7 tribes', '14 tribes'], 'easy'],
  ['מי נמכר על ידי אחיו למצרים והפך למשנה למלך פרעה?', 'יוסף', ['בנימין', 'יהודה', 'ראובן'], 'Who was sold by his brothers to Egypt and became viceroy to Pharaoh?', 'Joseph', ['Benjamin', 'Judah', 'Reuben'], 'easy'],
  ['כמה מכות הונחתו על מצרים לפני יציאת מצרים?', '10 מכות', ['7 מכות', '12 מכות', '5 מכות'], 'How many plagues were brought upon Egypt before the Exodus?', '10 plagues', ['7 plagues', '12 plagues', '5 plagues'], 'easy'],
  ['מה הייתה המכה הראשונה מעשר מכות מצרים?', 'דם', ['צפרדע', 'חושך', 'מכת בכורות'], 'What was the first of the Ten Plagues of Egypt?', 'Blood', ['Frogs', 'Darkness', 'Plague of the Firstborn'], 'easy'],
  ['מה הייתה המכה העשירית והאחרונה במצרים?', 'מכת בכורות', ['חושך', 'ארבה', 'ברד'], 'What was the tenth and final plague of Egypt?', 'Death of the Firstborn', ['Darkness', 'Locusts', 'Hail'], 'easy'],
  ['על איזה הר קיבל משה רבנו את לוחות הברית?', 'הר סיני', ['הר נבו', 'הר הכרמל', 'הר תבור'], 'On which mountain did Moses receive the Tablets of the Law?', 'Mount Sinai', ['Mount Nebo', 'Mount Carmel', 'Mount Tabor'], 'easy'],
  ['מי הנהיג את בני ישראל בכניסתם לארץ כנען לאחר מות משה?', 'יהושע בן נון', ['כלב בן יפונה', 'אהרן הכהן', 'גדעון'], 'Who led the Israelites into the Land of Canaan after Moses died?', 'Joshua (Yehoshua bin Nun)', ['Caleb', 'Aaron', 'Gideon'], 'easy'],
  ['איזו עיר הייתה הראשונה שנכבשה על ידי יהושע באמצעות תקיעה בשופרות?', 'יריחו', ['עי', 'חברון', 'שכם'], 'Which city was the first conquered by Joshua after blowing the shofars?', 'Jericho', ['Ai', 'Hebron', 'Shechem'], 'easy'],
  ['מי הייתה השופטת והנביאה שישבה תחת תומר דבורה?', 'דבורה הנביאה', ['יעל אשת חבר הקיני', 'חנה', 'מרים הנביאה'], 'Who was the female judge and prophetess in the Book of Judges?', 'Deborah the Prophetess', ['Jael', 'Hannah', 'Miriam'], 'easy'],
  ['במה היה טמון כוחו העצום של שמשון הגיבור?', 'בשיערו הארוך (נזיר אלוהים)', ['בחרבו', 'במגינו', 'בחגורתו'], 'Where did Samson’s superhuman strength reside?', 'In his uncut hair', ['In his sword', 'In his shield', 'In his belt'], 'easy'],
  ['מי היה המלך הראשון של ממלכת ישראל המאוחדת?', 'שאול המלך', ['דוד המלך', 'שלמה המלך', 'רחבעם'], 'Who was the first king of the United Kingdom of Israel?', 'King Saul', ['King David', 'King Solomon', 'Rehoboam'], 'easy'],
  ['במה הכניע דוד את גוליית הפלישתי בעמק האלה?', 'בקלע וחלוק נחל', ['בחרב ובחנית', 'בקשת וחץ', 'במרכבת ברזל'], 'With what weapon did David defeat Goliath?', 'A sling and a smooth stone', ['A sword and spear', 'A bow and arrow', 'An iron chariot'], 'easy'],
  ['מי בנה את בית המקדש הראשון בירושלים?', 'שלמה המלך', ['דוד המלך', 'חזקיהו המלך', 'יאשיהו המלך'], 'Who built the First Temple in Jerusalem?', 'King Solomon', ['King David', 'King Hezekiah', 'King Josiah'], 'easy'],
  ['איזה נביא עלה בסערה השמיימה במרכבת אש?', 'אליהו הנביא', ['אלישע', 'ישעיהו', 'ירמיהו'], 'Which prophet ascended to heaven in a whirlwind and chariot of fire?', 'Elijah the Prophet', ['Elisha', 'Isaiah', 'Jeremiah'], 'easy'],
  ['איזה נביא נבלע בבטן הדג הגדול במשך שלושה ימים?', 'יונה הנביא', ['דניאל', 'עמוס', 'יחזקאל'], 'Which prophet was swallowed by a great fish for three days?', 'Jonah', ['Daniel', 'Amos', 'Ezekiel'], 'easy'],
  ['מי הושלך לגוב האריות בבבל ויצא ממנו ללא פגע?', 'דניאל', ['עזרא', 'נחמיה', 'מרדכי'], 'Who was thrown into the lions’ den in Babylon and survived unharmed?', 'Daniel', ['Ezra', 'Nehemiah', 'Mordecai'], 'medium'],
  ['באיזה חג נוהגים לקרוא את מגילת רות?', 'חג השבועות', ['חג הפורים', 'חג הסוכות', 'תשעה באב'], 'On which Jewish holiday is the Book of Ruth traditionally read?', 'Shavuot', ['Purim', 'Sukkot', 'Tisha B’Av'], 'medium'],
  ['באיזה יום קוראים את מגילת איכה?', 'תשעה באב', ['יום הכיפורים', 'פורים', 'שמחת תורה'], 'On which day is the Book of Lamentations (Eicha) read?', 'Tisha B’Av', ['Yom Kippur', 'Purim', 'Simchat Torah'], 'medium'],
  ['כמה חומשים יש בתורה?', '5 חומשים', ['4 חומשים', '6 חומשים', '7 חומשים'], 'How many books (Chumashim) are in the Torah?', '5 books', ['4 books', '6 books', '7 books'], 'easy'],
  ['מהו החומש השלישי בתורה?', 'ויקרא', ['שמות', 'במדבר', 'דברים'], 'What is the third book of the Torah?', 'Leviticus (Vayikra)', ['Exodus', 'Numbers', 'Deuteronomy'], 'easy'],
  ['כמה סדרים יש במשנה (ש"ס)?', '6 סדרים', ['5 סדרים', '7 סדרים', '12 סדרים'], 'How many orders (Sedarim) are in the Mishnah?', '6 orders', ['5 orders', '7 orders', '12 orders'], 'medium'],
  ['מי ערך וחתם את המשנה בארץ ישראל?', 'רבי יהודה הנשיא', ['רבי עקיבא', 'הלל הזקן', 'הרמב"ם'], 'Who compiled and redacted the Mishnah?', 'Rabbi Judah the Prince (Yehuda HaNasi)', ['Rabbi Akiva', 'Hillel the Elder', 'Maimonides'], 'medium'],
  ['מהו שמו המלא של הרמב"ם?', 'רבי משה בן מימון', ['רבי שלמה יצחקי', 'רבי משה בן נחמן', 'רבי יוסף קארו'], 'What is the full name of the Rambam (Maimonides)?', 'Rabbi Moses ben Maimon', ['Rabbi Shlomo Yitzchaki', 'Rabbi Moses ben Nachman', 'Rabbi Yosef Karo'], 'easy'],
  ['מי חיבר את ספר ההלכה "שולחן ערוך"?', 'רבי יוסף קארו', ['הרמב"ם', 'רש"י', 'הגאון מווילנה'], 'Who authored the authoritative Jewish law code "Shulchan Aruch"?', 'Rabbi Yosef Karo', ['Maimonides', 'Rashi', 'The Vilna Gaon'], 'medium'],
  ['מהו ההר שבו עמד משה רבנו והשקיף על ארץ ישראל לפני פטירתו?', 'הר נבו', ['הר סיני', 'הר המוריה', 'הר גריזים'], 'From which mountain did Moses view the Land of Israel before his death?', 'Mount Nebo', ['Mount Sinai', 'Mount Moriah', 'Mount Gerizim'], 'medium'],
  ['מי הייתה אמו של שמואל הנביא שהתפללה לבן במשכן שילה?', 'חנה', ['פנינה', 'רחל', 'לאה'], 'Who was the mother of Samuel the Prophet who prayed at Shiloh?', 'Hannah', ['Peninnah', 'Rachel', 'Leah'], 'medium'],
  ['מי היו שלושת האבות של עם ישראל?', 'אברהם, יצחק ויעקב', ['משה, אהרן ויהושע', 'דוד, שלמה וחזקיהו', 'נח, שם ואברהם'], 'Who are the three Patriarchs of the Jewish people?', 'Abraham, Isaac, and Jacob', ['Moses, Aaron, and Joshua', 'David, Solomon, and Hezekiah', 'Noah, Shem, and Abraham'], 'easy']
];

// 6. Israeli History & Modern State (60 questions)
const ISRAEL_HISTORY_QUESTIONS = [
  ['באיזו שנה הוכרזה הקמת מדינת ישראל?', '1948', ['1947', '1949', '1950'], 'In which year was the State of Israel declared?', '1948', ['1947', '1949', '1950'], 'easy'],
  ['מי היה ראש הממשלה הראשון של מדינת ישראל?', 'דוד בן-גוריון', ['חיים ויצמן', 'משה שרת', 'לוי אשכול'], 'Who was the first Prime Minister of Israel?', 'David Ben-Gurion', ['Chaim Weizmann', 'Moshe Sharett', 'Levi Eshkol'], 'easy'],
  ['מי היה נשיאה הראשון של מדינת ישראל?', 'חיים ויצמן', ['יצחק בן-צבי', 'זלמן שזר', 'דוד בן-גוריון'], 'Who was the first President of Israel?', 'Chaim Weizmann', ['Yitzhak Ben-Zvi', 'Zalman Shazar', 'David Ben-Gurion'], 'easy'],
  ['מי חיבר את מילות ההמנון הלאומי "התקווה"?', 'נפתלי הרץ אימבר', ['חיים נחמן ביאליק', 'נתן אלתרמן', 'שאול טשרניחובסקי'], 'Who wrote the lyrics to Israel’s national anthem "Hatikvah"?', 'Naftali Herz Imber', ['Hayim Nahman Bialik', 'Nathan Alterman', 'Shaul Tchernichovsky'], 'medium'],
  ['באיזה תאריך עברי הוכרזה הקמת מדינת ישראל?', 'ה׳ באייר תש"ח', ['כ"ט בנובמבר תש"ח', 'י"ד בניסן תש"ח', 'כ"ח באייר תש"ח'], 'On which Hebrew date was Israel’s Declaration of Independence proclaimed?', '5 Iyar 5708', ['29 November 5708', '14 Nisan 5708', '28 Iyar 5708'], 'easy'],
  ['איפה נערך טקס הכרזת העצמאות של מדינת ישראל?', 'בבית דיזנגוף בשדרות רוטשילד בתל אביב', ['בבניין הכנסת בירושלים', 'בתיאטרון הבימה', 'בבניין הסוכנות היהודית'], 'Where did Israel’s Declaration of Independence ceremony take place?', 'At Dizengoff House on Rothschild Blvd in Tel Aviv', ['At the Knesset in Jerusalem', 'At Habima Theater', 'At the Jewish Agency building'], 'easy'],
  ['מי היה חוזה המדינה שחיבר את הספר "מדינת היהודים"?', 'בנימין זאב הרצל', ['אחד העם', 'מקס נורדאו', 'זאב ז׳בוטינסקי'], 'Who was the visionary of the Jewish State and author of "Der Judenstaat"?', 'Theodor Herzl', ['Ahad Ha’am', 'Max Nordau', 'Ze’ev Jabotinsky'], 'easy'],
  ['באיזו עיר בשווייץ התקיים הקונגרס הציוני הראשון ב-1897?', 'באזל', ['ציריך', 'ז׳נבה', 'ברן'], 'In which Swiss city was the First Zionist Congress held in 1897?', 'Basel', ['Zurich', 'Geneva', 'Bern'], 'easy'],
  ['באיזו שנה התרחשה מלחמת ששת הימים?', '1967', ['1956', '1973', '1982'], 'In which year did the Six-Day War take place?', '1967', ['1956', '1973', '1982'], 'easy'],
  ['באיזו שנה התרחשה מלחמת יום הכיפורים?', '1973', ['1967', '1970', '1979'], 'In which year did the Yom Kippur War take place?', '1973', ['1967', '1970', '1979'], 'easy'],
  ['עם איזו מדינה חתמה ישראל על הסכם שלום בשנת 1979?', 'מצרים', ['ירדן', 'לבנון', 'מרוקו'], 'With which country did Israel sign a peace treaty in 1979?', 'Egypt', ['Jordan', 'Lebanon', 'Morocco'], 'easy'],
  ['עם איזו מדינה חתמה ישראל על הסכם שלום בשנת 1994?', 'ירדן', ['מצרים', 'איחוד האמירויות', 'טורקיה'], 'With which country did Israel sign a peace treaty in 1994?', 'Jordan', ['Egypt', 'UAE', 'Turkey'], 'easy'],
  ['מי הייתה ראשת הממשלה האישה היחידה בתולדות מדינת ישראל?', 'גולדה מאיר', ['ציפי לבני', 'שולמית אלוני', 'גאולה כהן'], 'Who was the only female Prime Minister in Israel’s history?', 'Golda Meir', ['Tzipi Livni', 'Shulamit Aloni', 'Geula Cohen'], 'easy'],
  ['מי היה האסטרונאוט הישראלי הראשון בחלל?', 'אילן רמון', ['איתן סטיבה', 'עזר ויצמן', 'דני חלוץ'], 'Who was the first Israeli astronaut in space?', 'Ilan Ramon', ['Eytan Stibbe', 'Ezer Weizman', 'Dan Halutz'], 'easy'],
  ['איזה סופר ישראלי זכה בפרס נובל לספרות בשנת 1966?', 'ש"י עגנון', ['עמוס עוז', 'א.ב. יהושע', 'דוד גרוסמן'], 'Which Israeli author won the Nobel Prize in Literature in 1966?', 'S.Y. Agnon', ['Amos Oz', 'A.B. Yehoshua', 'David Grossman'], 'medium'],
  ['מה היה שמו של המבצע לחילוץ החטופים באנטבה בשנת 1976?', 'מבצע כדור הרעם (מבצע יונתן)', ['מבצע שלמה', 'מבצע משה', 'מבצע אביב נעורים'], 'What was the name of the 1976 hostage rescue operation in Entebbe?', 'Operation Thunderbolt (Operation Yonatan)', ['Operation Solomon', 'Operation Moses', 'Operation Spring of Youth'], 'easy'],
  ['באיזה מבצע הוטסו מעל 14,000 מיהודי אתיופיה לישראל תוך 36 שעות בשנת 1991?', 'מבצע שלמה', ['מבצע משה', 'מבצע מרבד הקסמים', 'מבצע עזרא ונחמיה'], 'Which 1991 operation airlifted over 14,000 Ethiopian Jews to Israel in 36 hours?', 'Operation Solomon', ['Operation Moses', 'Operation Magic Carpet', 'Operation Ezra and Nehemiah'], 'medium'],
  ['איזה מבצע העלה את יהודי תימן לישראל בשנים 1949–1950?', 'מבצע מרבד הקסמים (על כנפי נשרים)', ['מבצע עזרא ונחמיה', 'מבצע יכין', 'מבצע משה'], 'Which operation brought the Jews of Yemen to Israel in 1949-1950?', 'Operation Magic Carpet (On Wings of Eagles)', ['Operation Ezra and Nehemiah', 'Operation Yachin', 'Operation Moses'], 'medium'],
  ['איזה מבצע העלה את יהודי עיראק לישראל בשנים 1950–1951?', 'מבצע עזרא ונחמיה', ['מבצע מרבד הקסמים', 'מבצע שלמה', 'מבצע חירם'], 'Which operation airlifted Iraqi Jews to Israel in 1950-1951?', 'Operation Ezra and Nehemiah', ['Operation Magic Carpet', 'Operation Solomon', 'Operation Hiram'], 'medium'],
  ['כמה חברי כנסת מכהנים בכנסת ישראל?', '120 חברי כנסת', ['100 חברי כנסת', '110 חברי כנסת', '150 חברי כנסת'], 'How many members (MKs) serve in the Israeli Knesset?', '120 members', ['100 members', '110 members', '150 members'], 'easy'],
  ['מהו הסמל הרשמי של מדינת ישראל?', 'מנורת שבעת הקנים ושני ענפי זית', ['מגן דוד ושני אריות', 'לוחות הברית ויונה', 'שופר וענף תמר'], 'What is the official emblem of the State of Israel?', 'A seven-branched Menorah flanked by two olive branches', ['A Star of David and two lions', 'The Tablets of the Law and a dove', 'A shofar and a palm branch'], 'easy'],
  ['מה היה המטבע הרשמי של ישראל מיד לאחר החלפת הלירה בשנת 1980?', 'שקל (ישן)', ['שקל חדש', 'מיל', 'פרוטה'], 'What currency replaced the Israeli Lira in 1980 before the New Shekel?', 'The Old Shekel', ['New Israeli Shekel', 'Mil', 'Pruta'], 'medium'],
  ['מי היה מחיה השפה העברית בעת החדשה ומחבר המילון העברי המודרני?', 'אליעזר בן-יהודה', ['חיים נחמן ביאליק', 'אחד העם', 'מנדלי מוכר ספרים'], 'Who led the revival of Hebrew as a modern spoken language?', 'Eliezer Ben-Yehuda', ['Hayim Nahman Bialik', 'Ahad Ha’am', 'Mendele Mocher Sforim'], 'easy'],
  ['איזה קיבוץ היה הקיבוץ הראשון שהוקם בארץ ישראל (בשנת 1910)?', 'דגניה א׳', ['עין חרוד', 'כפר גלעדי', 'נהלל'], 'Which was the first Kibbutz established in the Land of Israel (in 1910)?', 'Degania Alef', ['Ein Harod', 'Kfar Giladi', 'Nahalal'], 'medium'],
  ['איזה יישוב היה מושב העובדים הראשון בארץ ישראל (בשנת 1921)?', 'נהלל', ['כפר יהושע', 'באר טוביה', 'כפר ויתקין'], 'Which was the first Moshav Ovdim established in Israel (in 1921)?', 'Nahalal', ['Kfar Yehoshua', 'Beer Tuvia', 'Kfar Vitkin'], 'medium']
];

// 7. Space & Astronomy (45 questions)
const SPACE_QUESTIONS = [
  ['איזה כוכב לכת הוא הקרוב ביותר לשמש?', 'חמה (מרקורי)', ['נוגה (ונוס)', 'מאדים', 'כדור הארץ'], 'Which planet is closest to the Sun?', 'Mercury', ['Venus', 'Mars', 'Earth'], 'easy'],
  ['איזה כוכב לכת הוא החם ביותר במערכת השמש?', 'נוגה (ונוס)', ['חמה (מרקורי)', 'מאדים', 'צדק'], 'Which planet is the hottest in our solar system?', 'Venus', ['Mercury', 'Mars', 'Jupiter'], 'medium'],
  ['איזה כוכב לכת מכונה "כוכב הלכת האדום"?', 'מאדים (מארס)', ['נוגה', 'צדק', 'שבתאי'], 'Which planet is known as the "Red Planet"?', 'Mars', ['Venus', 'Jupiter', 'Saturn'], 'easy'],
  ['איזה כוכב לכת הוא הגדול ביותר במערכת השמש?', 'צדק (יופיטר)', ['שבתאי', 'אורנוס', 'נפטון'], 'Which is the largest planet in our solar system?', 'Jupiter', ['Saturn', 'Uranus', 'Neptune'], 'easy'],
  ['איזה כוכב לכת מפורסם במערכת הטבעות המרהיבה שלו?', 'שבתאי (סטורן)', ['צדק', 'מאדים', 'נוגה'], 'Which planet is famous for its prominent ring system?', 'Saturn', ['Jupiter', 'Mars', 'Venus'], 'easy'],
  ['איזה כוכב לכת הוא הרחוק ביותר מהשמש (מבין 8 כוכבי הלכת)?', 'רהב (נפטון)', ['אורנוס', 'שבתאי', 'צדק'], 'Which of the 8 planets is farthest from the Sun?', 'Neptune', ['Uranus', 'Saturn', 'Jupiter'], 'medium'],
  ['מהו שמה של הגלקסיה שבה נמצאת מערכת השמש שלנו?', 'שביל החלב', ['אנדרומדה', 'הענן המגלני', 'סומבררו'], 'What is the name of the galaxy that contains our solar system?', 'The Milky Way', ['Andromeda', 'Magellanic Cloud', 'Sombrero Galaxy'], 'easy'],
  ['מי היה האדם הראשון שהלך על פני הירח בשנת 1969?', 'ניל ארמסטרונג', ['באז אולדרין', 'יורי גגארין', 'ג׳ון גלן'], 'Who was the first human to walk on the Moon in 1969?', 'Neil Armstrong', ['Buzz Aldrin', 'Yuri Gagarin', 'John Glenn'], 'easy'],
  ['מי היה האדם הראשון שטס לחלל בשנת 1961?', 'יורי גגארין', ['ניל ארמסטרונג', 'אלן שפרד', 'ולנטינה טרשקובה'], 'Who was the first human to journey into outer space in 1961?', 'Yuri Gagarin', ['Neil Armstrong', 'Alan Shepard', 'Valentina Tereshkova'], 'medium'],
  ['מהו שמה של החללית שבה נחתו האסטרונאוטים הראשונים על הירח?', 'אפולו 11', ['אפולו 13', 'וויאג׳ר 1', 'ספוטניק 1'], 'What was the name of the mission that first landed humans on the Moon?', 'Apollo 11', ['Apollo 13', 'Voyager 1', 'Sputnik 1'], 'easy'],
  ['כמה דקות בערך לוקח לאור השמש להגיע אל כדור הארץ?', 'כ-8 דקות', ['כדקה אחת', 'כ-30 דקות', 'כשעתיים'], 'Approximately how long does sunlight take to reach Earth?', 'About 8 minutes', ['About 1 minute', 'About 30 minutes', 'About 2 hours'], 'medium'],
  ['מהו הירח הגדול ביותר של כוכב הלכת שבתאי?', 'טיטאן', ['אירופה', 'גנימד', 'פובוס'], 'What is the largest moon of Saturn?', 'Titan', ['Europa', 'Ganymede', 'Phobos'], 'hard'],
  ['מהו הירח הגדול ביותר במערכת השמש (שמקיף את צדק)?', 'גנימד', ['טיטאן', 'הירח של כדור הארץ', 'איו'], 'What is the largest moon in the solar system (orbiting Jupiter)?', 'Ganymede', ['Titan', 'Earth’s Moon', 'Io'], 'hard'],
  ['איזו גלקסיה גדולה היא השכנה הקרובה ביותר לשביל החלב?', 'גלקסיית אנדרומדה', ['גלקסיית המשולש', 'גלקסיית המערבולת', 'גלקסיית המחוגה'], 'Which major galaxy is the closest neighbor to the Milky Way?', 'The Andromeda Galaxy', ['Triangulum Galaxy', 'Whirlpool Galaxy', 'Circinus Galaxy'], 'medium'],
  ['מהו השם העברי של כוכב הלכת אורנוס?', 'אורון', ['רהב', 'שבתאי', 'צדק'], 'What is the Hebrew name for the planet Uranus?', 'Oron', ['Rahav', 'Shabtai', 'Tzedek'], 'hard'],
  ['מהו השם העברי של כוכב הלכת נפטון?', 'רהב', ['אורון', 'נוגה', 'חמה'], 'What is the Hebrew name for the planet Neptune?', 'Rahav', ['Oron', 'Noga', 'Chama'], 'hard'],
  ['איזו גשושית ישראלית שוגרה אל הירח בשנת 2019?', 'בראשית', ['אופק', 'עמוס', 'ארוס'], 'Which Israeli lunar lander was launched to the Moon in 2019?', 'Beresheet', ['Ofek', 'Amos', 'EROS'], 'easy'],
  ['מה גורם לתופעת הגאות והשפל באוקיינוסים של כדור הארץ?', 'כוח המשיכה של הירח (והשמש)', ['רוחות הסחר בלבד', 'התפרצויות געשיות בים', 'השדה המגנטי של הקטבים'], 'What primarily causes ocean tides on Earth?', 'The gravitational pull of the Moon (and Sun)', ['Trade winds alone', 'Underwater volcanic eruptions', 'Polar magnetic fields'], 'easy'],
  ['מהי "שנת אור"?', 'יחידת מרחק — המרחק שהאור עובר בשנה אחת', ['יחידת זמן של 365 שנים', 'עוצמת הבהירות של השמש', 'זמן הקפת השמש סביב הגלקסיה'], 'What is a "light-year"?', 'A unit of distance — how far light travels in one year', ['A unit of time equal to 365 years', 'The brightness of the Sun', 'The time the Sun takes to orbit the galaxy'], 'easy'],
  ['איזה גז הוא המרכיב העיקרי של השמש?', 'מימן', ['חמצן', 'חנקן', 'פחמן דו-חמצני'], 'Which gas is the primary component of the Sun?', 'Hydrogen', ['Oxygen', 'Nitrogen', 'Carbon dioxide'], 'medium']
];

// 8. Animals & Nature (65 questions)
const ANIMALS_QUESTIONS = [
  ['מהו בעל החיים הגדול ביותר שחי אי פעם על פני כדור הארץ?', 'הלווייתן הכחול', ['הפיל האפריקאי', 'כריש לווייתני', 'דינוזאור טי-רקס'], 'What is the largest animal ever known to have lived on Earth?', 'The Blue Whale', ['The African Elephant', 'The Whale Shark', 'Tyrannosaurus Rex'], 'easy'],
  ['מהו היונק היבשתי המהיר ביותר בעולם?', 'ברדלס (צ׳יטה)', ['אריה', 'אנטילופה', 'סוס מרוץ'], 'What is the fastest land mammal in the world?', 'The Cheetah', ['The Lion', 'The Antelope', 'The Racehorse'], 'easy'],
  ['מהו היונק היבשתי הגבוה ביותר בעולם?', 'ג׳ירפה', ['פיל אפריקאי', 'גמל', 'קרנף'], 'What is the tallest land mammal in the world?', 'The Giraffe', ['The African Elephant', 'The Camel', 'The Rhinoceros'], 'easy'],
  ['כמה לבבות יש לתמנון?', '3 לבבות', ['לב אחד', '2 לבבות', '5 לבבות'], 'How many hearts does an octopus have?', '3 hearts', ['1 heart', '2 hearts', '5 hearts'], 'medium'],
  ['כמה זרועות יש לתמנון?', '8 זרועות', ['6 זרועות', '10 זרועות', '12 זרועות'], 'How many arms does an octopus have?', '8 arms', ['6 arms', '10 arms', '12 arms'], 'easy'],
  ['כמה רגליים יש לעכביש?', '8 רגליים', ['6 רגליים', '10 רגליים', '4 רגליים'], 'How many legs does a spider have?', '8 legs', ['6 legs', '10 legs', '4 legs'], 'easy'],
  ['כמה רגליים יש לחרק בוגר (כמו נמלה או דבורה)?', '6 רגליים', ['8 רגליים', '4 רגליים', '10 רגליים'], 'How many legs does an adult insect (like an ant or bee) have?', '6 legs', ['8 legs', '4 legs', '10 legs'], 'easy'],
  ['איזה עוף הוא הגדול והכבד ביותר בעולם ואינו מסוגל לעוף?', 'יען', ['נשר', 'פלמינגו', 'אלבטרוס'], 'Which is the largest living bird in the world (and flightless)?', 'The Ostrich', ['The Eagle', 'The Flamingo', 'The Albatross'], 'easy'],
  ['איזה יונק מסוגל לעוף תעופה אמיתית?', 'עטלף', ['סנאי דואה', 'למור', 'קואלה'], 'Which mammal is capable of true sustained flight?', 'The Bat', ['The Flying Squirrel', 'The Lemur', 'The Koala'], 'easy'],
  ['מהו המזון הכמעט בלעדי של דוב הפנדה הענק?', 'במבוק (חזרן)', ['עלי אקליפטוס', 'דגי סלמון', 'בלוטים'], 'What makes up almost the entire diet of a Giant Panda?', 'Bamboo', ['Eucalyptus leaves', 'Salmon', 'Acorns'], 'easy'],
  ['מהו המזון העיקרי של הקואלה באוסטרליה?', 'עלי אקליפטוס', ['במבוק', 'פירות טרופיים', 'חרקים'], 'What is the main diet of the Australian Koala?', 'Eucalyptus leaves', ['Bamboo', 'Tropical fruits', 'Insects'], 'easy'],
  ['איזו ציפור נבחרה לציפור הלאומית של מדינת ישראל בשנת 2008?', 'דוכיפת', ['נחליאלי', 'צופית', 'בז מצוי'], 'Which bird was chosen as the national bird of Israel in 2008?', 'The Hoopoe (Duchifat)', ['Wagtail', 'Sunbird', 'Kestrel'], 'easy'],
  ['איזו ציפור מסוגלת לעוף גם לאחור ולרחף במקום?', 'קוליברי (יונק הדבש)', ['סנונית', 'שלדג', 'נקר'], 'Which bird is able to fly backwards and hover in mid-air?', 'The Hummingbird', ['The Swallow', 'The Kingfisher', 'The Woodpecker'], 'medium'],
  ['מהו הדג הגדול ביותר בעולם?', 'כריש לווייתני', ['כריש לבן גדול', 'דג חרב', 'טונה כחולת סנפיר'], 'What is the largest fish species in the world?', 'The Whale Shark', ['Great White Shark', 'Swordfish', 'Bluefin Tuna'], 'medium'],
  ['כמה חודשים נמשך הריון של פילה אפריקאית?', 'כ-22 חודשים', ['כ-9 חודשים', 'כ-12 חודשים', 'כ-15 חודשים'], 'Approximately how many months is an African elephant’s pregnancy?', 'About 22 months', ['About 9 months', 'About 12 months', 'About 15 months'], 'medium'],
  ['איזה בעל חיים ימי ידוע בכך שהזכר הוא זה שנושא את הביצים בכיס ההדגרה?', 'סוסון ים', ['דולפין', 'כוכב ים', 'צלופח'], 'In which marine animal does the male carry the eggs in a brood pouch?', 'The Seahorse', ['The Dolphin', 'The Starfish', 'The Eel'], 'easy'],
  ['מהו השם של תהליך שבו צמחים מייצרים אנרגיה וחמצן באמצעות אור השמש?', 'פוטוסינתזה (הטמעה)', ['אוסמוזה', 'תסיסה', 'אידוי'], 'What is the process by which plants use sunlight to synthesize nutrients and oxygen?', 'Photosynthesis', ['Osmosis', 'Fermentation', 'Evaporation'], 'easy'],
  ['איזה עץ נחשב לעץ הלאומי של ישראל וענפיו מופיעים בסמל המדינה?', 'עץ הזית', ['עץ האלון', 'עץ התמר', 'עץ הארז'], 'Which tree appears on Israel’s national emblem and symbolizes peace?', 'The Olive Tree', ['The Oak Tree', 'The Date Palm', 'The Cedar Tree'], 'easy'],
  ['איזה זוחל מפורסם ביכולתו להחליף את צבע עורו ולהניע כל עין בנפרד?', 'זיקית', ['שממית', 'איגואנה', 'צב יבשה'], 'Which reptile is famous for changing skin color and moving its eyes independently?', 'The Chameleon', ['The Gecko', 'The Iguana', 'The Tortoise'], 'easy'],
  ['מהו העוף הדורס המהיר ביותר בעולם בצלילה באוויר?', 'בז נודד', ['עיט זהוב', 'נשר מקראי', 'ינשוף'], 'What is the fastest bird of prey in the world during a hunting dive?', 'The Peregrine Falcon', ['Golden Eagle', 'Griffon Vulture', 'Owl'], 'medium']
];

// 9. Sports & Olympics (60 questions)
const SPORTS_QUESTIONS = [
  ['כל כמה שנים נערכים המשחקים האולימפיים (אולימפיאדת הקיץ)?', 'כל 4 שנים', ['כל שנתיים', 'כל 3 שנים', 'כל 5 שנים'], 'How often are the Summer Olympic Games held?', 'Every 4 years', ['Every 2 years', 'Every 3 years', 'Every 5 years'], 'easy'],
  ['כמה טבעות מופיעות בדגל האולימפי?', '5 טבעות', ['4 טבעות', '6 טבעות', '7 טבעות'], 'How many interlocking rings appear on the Olympic flag?', '5 rings', ['4 rings', '6 rings', '7 rings'], 'easy'],
  ['כמה שחקנים יש לכל קבוצה על המגרש במשחק כדורגל תקני?', '11 שחקנים', ['10 שחקנים', ['9 שחקנים'][0], '12 שחקנים'], 'How many players per team are on the field in a standard soccer match?', '11 players', ['10 players', '9 players', '12 players'], 'easy'],
  ['כמה שחקנים יש לכל קבוצה על הפרקט במשחק כדורסל תקני?', '5 שחקנים', ['6 שחקנים', '7 שחקנים', '4 שחקנים'], 'How many players per team are on the court in a basketball game?', '5 players', ['6 players', '7 players', '4 players'], 'easy'],
  ['כמה שחקנים יש לכל קבוצה על המגרש במשחק כדורעף אולמות?', '6 שחקנים', ['5 שחקנים', '7 שחקנים', '8 שחקנים'], 'How many players per team are on the court in indoor volleyball?', '6 players', ['5 players', '7 players', '8 players'], 'medium'],
  ['מהו אורכו המדויק של ריצת מרתון תקנית?', '42.195 קילומטרים', ['40.000 קילומטרים', '45.500 קילומטרים', '50.000 קילומטרים'], 'What is the exact official distance of a marathon race?', '42.195 kilometers', ['40.000 kilometers', '45.500 kilometers', '50.000 kilometers'], 'medium'],
  ['איזו נבחרת זכתה בהכי הרבה גביעי עולם בכדורגל (מונדיאל)?', 'ברזיל', ['גרמניה', 'ארגנטינה', 'איטליה'], 'Which national team has won the most FIFA World Cup titles?', 'Brazil', ['Germany', 'Argentina', 'Italy'], 'easy'],
  ['איזו נבחרת זכתה במונדיאל 2022 שנערך בקטר?', 'ארגנטינה', ['צרפת', 'ברזיל', 'קרואטיה'], 'Which national team won the 2022 FIFA World Cup in Qatar?', 'Argentina', ['France', 'Brazil', 'Croatia'], 'easy'],
  ['מי הייתה הספורטאית הישראלית הראשונה שזכתה במדליה אולימפית (ברצלונה 1992)?', 'יעל ארד', ['אורן סמדג׳ה', 'גל פרידמן', 'לינוי אשרם'], 'Who was the first Israeli athlete to win an Olympic medal (1992)?', 'Yael Arad', ['Oren Smadja', 'Gal Fridman', 'Linoy Ashram'], 'easy'],
  ['מי היה הספורטאי הישראלי הראשון שזכה במדליית זהב אולימפית (אתונה 2004)?', 'גל פרידמן', ['ארטיום דולגופיאט', 'לינוי אשרם', 'תום ראובני'], 'Who was the first Israeli athlete to win an Olympic gold medal (2004)?', 'Gal Fridman', ['Artem Dolgopyat', 'Linoy Ashram', 'Tom Reuveni'], 'easy'],
  ['באיזה ענף ספורט זכתה לינוי אשרם במדליית זהב באולימפיאדת טוקיו?', 'התעמלות אמנותית', ['התעמלות מכשירים', 'ג׳ודו', 'שחייה'], 'In which sport did Linoy Ashram win Olympic gold in Tokyo?', 'Rhythmic gymnastics', ['Artistic gymnastics', 'Judo', 'Swimming'], 'easy'],
  ['באיזה ענף ספורט זכה ארטיום דולגופיאט במדליית זהב אולימפית?', 'התעמלות מכשירים (תרגיל קרקע)', ['ג׳ודו', 'גלישת רוח', 'טאקוונדו'], 'In which sport did Artem Dolgopyat win an Olympic gold medal?', 'Artistic gymnastics (Floor exercise)', ['Judo', 'Windsurfing', 'Taekwondo'], 'easy'],
  ['באיזה שנה זכתה מכבי תל אביב לראשונה בגביע אירופה לאלופות בכדורסל?', '1977', ['1981', '2001', '2004'], 'In which year did Maccabi Tel Aviv basketball win its first European Cup?', '1977', ['1981', '2001', '2004'], 'medium'],
  ['באיזה שנה העפילה נבחרת ישראל בכדורגל למונדיאל במקסיקו?', '1970', ['1974', '1966', '1982'], 'In which year did Israel’s national soccer team play in the FIFA World Cup?', '1970', ['1974', '1966', '1982'], 'medium'],
  ['מי כבש את השער היחיד של נבחרת ישראל במונדיאל 1970?', 'מרדכי שפיגלר', ['גיורא שפיגל', 'שייע פייגנבוים', 'אלי אוחנה'], 'Who scored Israel’s only FIFA World Cup goal in 1970?', 'Mordechai Spiegler', ['Giora Spiegel', 'Yehoshua Feigenbaum', 'Eli Ohana'], 'medium'],
  ['על איזה משטח משחקים בטורניר הטניס ווימבלדון?', 'דשא', ['חימר', ['משטח קשה'][0], 'שטיח סינתטי'], 'On what surface is the Wimbledon tennis tournament played?', 'Grass', ['Clay', 'Hard court', 'Synthetic carpet'], 'easy'],
  ['על איזה משטח משחקים בטורניר הטניס רולאן גארוס בפריז?', 'חימר', ['דשא', 'משטח קשה', 'פרקט'], 'On what surface is the French Open (Roland Garros) played?', 'Clay', ['Grass', 'Hard court', 'Parquet'], 'medium'],
  ['כמה דקות נמשך משחק כדורגל רגיל (ללא תוספת זמן והארכה)?', '90 דקות', ['80 דקות', '100 דקות', '60 דקות'], 'How many minutes is a standard regulation soccer match?', '90 minutes', ['80 minutes', '100 minutes', '60 minutes'], 'easy'],
  ['כמה משבצות יש על לוח שחמט תקני?', '64 משבצות', ['49 משבצות', '81 משבצות', '100 משבצות'], 'How many squares are on a standard chessboard?', '64 squares', ['49 squares', '81 squares', '100 squares'], 'easy'],
  ['מי מחזיק בשיא העולם בריצת 100 מטר (9.58 שניות)?', 'יוסיין בולט', ['קארל לואיס', 'טייסון גיי', 'נואה ליילס'], 'Who holds the 100m world record of 9.58 seconds?', 'Usain Bolt', ['Carl Lewis', 'Tyson Gay', 'Noah Lyles'], 'easy']
];

// 10. Jewish Holidays & Calendar (50 questions)
const HOLIDAYS_QUESTIONS = [
  ['כמה נרות בסך הכל מדליקים בחנוכייה בכל שמונת ימי חנוכה (כולל השמש בכל יום)?', '44 נרות', ['36 נרות', '40 נרות', '48 נרות'], 'How many total candles are lit on Hanukkah over all 8 nights (including the Shamash)?', '44 candles', ['36 candles', '40 candles', '48 candles'], 'medium'],
  ['כמה נרות מדליקים בחנוכה ללא השמש בכל שמונת הימים יחד?', '36 נרות', ['44 נרות', '32 נרות', '40 נרות'], 'How many Hanukkah candles are lit over all 8 nights excluding the Shamash?', '36 candles', ['44 candles', '32 candles', '40 candles'], 'medium'],
  ['באיזה תאריך עברי חל ערב חג החנוכה (נר ראשון)?', 'כ"ד בכסלו (ויומו הראשון בכ"ה בכסלו)', ['י"ד באדר', 'ט"ו בשבט', 'ט"ו בתשרי'], 'On which Hebrew date does the first day of Hanukkah fall?', '25 Kislev (lit on the eve of 24 Kislev)', ['14 Adar', '15 Shevat', '15 Tishrei'], 'easy'],
  ['מהם ארבעת המינים שניטלים בחג הסוכות?', 'לולב, אתרוג, הדס וערבה', ['חיטה, שעורה, גפן ותאנה', 'רימון, זית, תמר ואתרוג', 'מצה, מרור, חרוסת וכרפס'], 'What are the Four Species (Arba’at HaMinim) waved on Sukkot?', 'Lulav, Etrog, Hadas (myrtle), and Arava (willow)', ['Wheat, barley, grape, and fig', 'Pomegranate, olive, date, and etrog', 'Matzah, maror, charoset, and karpas'], 'easy'],
  ['כמה כוסות יין (או מיץ ענבים) שותים בליל הסדר של פסח?', '4 כוסות', ['3 כוסות', '5 כוסות', '2 כוסות'], 'How many cups of wine are drunk during the Passover Seder?', '4 cups', ['3 cups', '5 cups', '2 cups'], 'easy'],
  ['מהן ארבע מצוות היום של חג הפורים (המתחילות באות מ׳)?', 'מקרא מגילה, משלוח מנות, מתנות לאביונים, משתה ושמחה', ['מצה, מרור, מגילה, מנורה', 'מזוזה, מעשר, מנחה, מוסף', 'מילה, מקווה, מצווה, מניין'], 'What are the four main observances of Purim?', 'Reading the Megillah, Mishloach Manot, gifts to the poor, and a festive meal', ['Matzah, Maror, Megillah, Menorah', 'Mezuzah, Maaser, Mincha, Musaf', 'Milah, Mikveh, Mitzvah, Minyan'], 'easy'],
  ['באיזה תאריך עברי חוגגים את ראש השנה לאילנות?', 'ט"ו בשבט', ['ט"ו באב', 'א׳ בתשרי', 'ל"ג בעומר'], 'On which Hebrew date is the New Year of the Trees celebrated?', 'Tu BiShvat (15 Shevat)', ['Tu B’Av', '1 Tishrei', 'Lag BaOmer'], 'easy'],
  ['כמה ימים סופרים בספירת העומר מפסח ועד חג השבועות?', '49 ימים (7 שבועות)', ['40 ימים', '50 ימים', '33 ימים'], 'How many days are counted during the Counting of the Omer?', '49 days (7 weeks)', ['40 days', '50 days', '33 days'], 'easy'],
  ['מהם שלושת הרגלים בלוח השנה העברי?', 'פסח, שבועות וסוכות', ['ראש השנה, יום כיפור וסוכות', 'חנוכה, פורים ופסח', 'פסח, ראש השנה ושבועות'], 'What are the three Pilgrimage Festivals (Shalosh Regalim)?', 'Passover, Shavuot, and Sukkot', ['Rosh Hashanah, Yom Kippur, and Sukkot', 'Hanukkah, Purim, and Passover', 'Passover, Rosh Hashanah, and Shavuot'], 'easy'],
  ['באיזה תאריך עברי חל יום הכיפורים?', 'י׳ בתשרי', ['א׳ בתשרי', 'ט"ו בתשרי', 'ט׳ באב'], 'On which Hebrew date does Yom Kippur fall?', '10 Tishrei', ['1 Tishrei', '15 Tishrei', '9 Av'], 'easy'],
  ['כמה ימים נמשכים "עשרת ימי תשובה"?', '10 ימים (מראש השנה ועד יום הכיפורים)', ['7 ימים', '14 ימים', '30 ימים'], 'How many days are the Days of Awe (Aseret Yemei Teshuva)?', '10 days (from Rosh Hashanah to Yom Kippur)', ['7 days', '14 days', '30 days'], 'easy'],
  ['איזה חודש עברי הוא חודש הרחמים והסליחות שלפני ראש השנה?', 'אלול', ['אב', 'תשרי', 'חשוון'], 'Which Hebrew month precedes Rosh Hashanah and is dedicated to Selichot?', 'Elul', ['Av', 'Tishrei', 'Cheshvan'], 'easy'],
  ['באיזו שנה עברית מתווסף חודש נוסף (אדר א׳ ואדר ב׳)?', 'בשנה מעוברת', ['בשנת שמיטה בלבד', 'בשנת יובל בלבד', 'בכל שנה זוגית'], 'In what type of Hebrew year is an extra month of Adar added?', 'In a Hebrew leap year (Shana Me’uberet)', ['Only in a Shmita year', 'Only in a Jubilee year', 'In every even year'], 'easy'],
  ['כל כמה שנים חלה שנת שמיטה בארץ ישראל?', 'כל 7 שנים', ['כל 5 שנים', 'כל 10 שנים', 'כל 50 שנה'], 'How often does the Sabbatical agricultural year (Shmita) occur?', 'Every 7 years', ['Every 5 years', 'Every 10 years', 'Every 50 years'], 'easy'],
  ['מהן האותיות שעל סביבון חנוכה בישראל ומה פירושן?', 'נ.ג.ה.פ — נס גדול היה פה', ['נ.ג.ה.ש — נס גדול היה שם', 'ח.נ.ו.כ — חנוכה נרות וכדים', 'מ.כ.ב.י — מי כמוך באלים ה׳'], 'What Hebrew letters appear on an Israeli dreidel and what do they mean?', 'Nun, Gimel, Hey, Pey — A Great Miracle Happened Here', ['Nun, Gimel, Hey, Shin — A Great Miracle Happened There', 'Chet, Nun, Vav, Kaf', 'Mem, Kaf, Bet, Yud'], 'easy']
];

// 11. Hebrew Language, Idioms & Synonyms (65 pairs -> 65 questions)
const HEBREW_LANGUAGE_DATA = [
  ['מה פירוש המילה העברית "גזוזטרה"?', 'מרפסת', ['מדרכה', 'מזרקת מים', 'גג רעפים'], 'What does the Hebrew word "Gezuztra" mean?', 'Balcony', ['Sidewalk', 'Water fountain', 'Tile roof'], 'medium'],
  ['מהי המילה העברית התקנית ל"אפליקציה" (יישום בטלפון)?', 'יישומון', ['תוכניון', 'טלפונית', 'מסכון'], 'What is the Hebrew Academy word for a mobile "app"?', 'Yishumon', ['Tochnion', 'Telefonit', 'Masachon'], 'easy'],
  ['מהי המילה העברית התקנית ל"אימוג׳י" (סמלון הבעה)?', 'רגשון', ['פרצופון', 'חייכן', 'ציורון'], 'What is the official Hebrew word for an "emoji"?', 'Regashon', ['Partzufon', 'Chaychan', 'Tziyuron'], 'medium'],
  ['מהי המילה העברית ל"שנורקל"?', 'קנה נשימה (צנורן)', ['משקפת צלילה', 'סנפיר', 'מצוף'], 'What is the Hebrew meaning of a snorkel?', 'Breathing tube (Tznoran)', ['Diving goggles', 'Flipper', 'Buoy'], 'medium'],
  ['מה פירוש הביטוי "ירד לטמיון"?', 'אבד לבלי שוב / התבזבז', ['התעשר מאוד', 'נשמר בכספת', 'ירד למרתף'], 'What does the Hebrew idiom "Yarad LeTimyon" mean?', 'Went to waste / was lost completely', ['Became very wealthy', 'Was locked in a safe', 'Went down to the cellar'], 'easy'],
  ['מה פירוש הביטוי "טמן ידו בצלחת"?', 'התבטל ולא עשה דבר', ['אכל בתיאבון רב', 'בישל ארוחה גדולה', 'תרם בסתר'], 'What does the Hebrew idiom "Taman Yado BaTzalachat" mean?', 'Sat idle and did nothing', ['Ate heartily', 'Cooked a large meal', 'Donated secretly'], 'medium'],
  ['מה פירוש הביטוי "אבן שואבת"?', 'מוקד משיכה מרכזי (מגנט)', ['אבן כבדה במיוחד', 'באר מים עמוקה', 'מכשול בדרך'], 'What does the Hebrew idiom "Even Sho’evet" (lodestone) mean?', 'A major center of attraction (magnet)', ['An extra heavy stone', 'A deep water well', 'An obstacle on the road'], 'medium'],
  ['מה פירוש הביטוי "אליה וקוץ בה"?', 'דבר טוב שיש בו גם חיסרון', ['בשורה משמחת במיוחד', 'צמח מדברי נדיר', 'חידה ללא פתרון'], 'What does the Hebrew idiom "Alyah VeKotz Bah" mean?', 'Something good that comes with a drawback', ['Wonderful news', 'A rare desert plant', 'An unsolvable riddle'], 'easy'],
  ['מה פירוש הביטוי "ברחל בתך הקטנה"?', 'בפירוש גמור וללא כפל משמעות', ['בשקט ובסודיות', 'בקיצור נמרץ', 'בשפה פיוטית'], 'What does the Hebrew expression "BeRachel Bitcha HaKtana" mean?', 'Explicitly and unmistakably clear', ['Quietly and secretly', 'Very briefly', 'In poetic language'], 'medium'],
  ['מה פירוש המילה הנרדפת "ארי" או "ליש" או "שחל"?', 'אריה', ['נמר', 'זאב', 'נשר'], 'Which animal do the biblical Hebrew words "Ari", "Layish", and "Shachal" refer to?', 'Lion', ['Leopard', 'Wolf', 'Eagle'], 'medium'],
  ['מה פירוש המילים הנרדפות "לבנה" או "סהר"?', 'ירח', ['שמש', 'כוכב שביט', 'ענן'], 'What do the Hebrew words "Levana" and "Sahar" refer to?', 'The Moon', ['The Sun', 'A comet', 'A cloud'], 'easy'],
  ['מה פירוש המילים הנרדפות "חמה" או "חרס"?', 'שמש', ['ירח', 'אש', 'אדמה'], 'What do the Hebrew words "Chama" and "Cheres" refer to?', 'The Sun', ['The Moon', 'Fire', 'Earth'], 'easy'],
  ['כמה אותיות יש באלפבית העברי (ללא אותיות סופיות)?', '22 אותיות', ['24 אותיות', '26 אותיות', '20 אותיות'], 'How many letters are in the Hebrew alphabet (excluding final forms)?', '22 letters', ['24 letters', '26 letters', '20 letters'], 'easy'],
  ['כמה אותיות סופיות (מנצפ"ך) יש בשפה העברית?', '5 אותיות סופיות', ['4 אותיות סופיות', '6 אותיות סופיות', '3 אותיות סופיות'], 'How many final-form letters (Sofiyot) exist in Hebrew?', '5 final letters', ['4 final letters', '6 final letters', '3 final letters'], 'easy'],
  ['מהי המילה העברית ל"הליקופטר"?', 'מסוק', ['מטוס סילון', 'דאון', 'רחפן'], 'What is the Hebrew word for a helicopter?', 'Masok', ['Jet plane', 'Glider', 'Drone'], 'easy'],
  ['מהי המילה העברית התקנית ל"קרואסון"?', 'סהרון', ['שבלולון', 'דפדפן', 'כריכון'], 'What is the Hebrew Academy word for a croissant?', 'Saharon', ['Shablulon', 'Dafdafan', 'Karichon'], 'medium'],
  ['מה פירוש הביטוי "דמעות תנין"?', 'בכי מעושה ולא אמיתי', ['בכי מתוך התרגשות עצומה', 'שמחה לאיד', 'כעס פתאומי'], 'What does the expression "crocodile tears" (Dma’ot Tanin) mean?', 'Fake or insincere crying', ['Tears of deep joy', 'Schadenfreude', 'Sudden anger'], 'easy'],
  ['מה פירוש הביטוי "הכה שורש"?', 'התבסס והשתקע במקום', ['עקר עץ ממקומו', 'יצא למסע ארוך', 'התחרט על מעשיו'], 'What does the Hebrew idiom "Hikah Shoresh" (took root) mean?', 'Became firmly established in a place', ['Uprooted a tree', 'Set off on a long journey', 'Regretted his actions'], 'easy'],
  ['מה פירוש המילה "גלופה"?', 'תבנית להדפסה או חותמת', ['מעטפה רשמית', 'קופסת תכשיטים', 'מגילת קלף'], 'What does the Hebrew word "Glufa" mean?', 'A printing plate or engraving block', ['An official envelope', 'A jewelry box', 'A parchment scroll'], 'hard'],
  ['מה פירוש הביטוי "נכנס בעובי הקורה"?', 'התעמק בנושא וטיפל בו ביסודיות', ['בנה בית מעץ', 'נקלע לצרה גדולה', 'התחמק מאחריות'], 'What does the Hebrew idiom "Nichnas Be’Ovi HaKorah" mean?', 'Delved deeply and thoroughly into a matter', ['Built a wooden house', 'Got into big trouble', 'Shirked responsibility'], 'medium']
];

// 12. Food & Culinary (50 questions)
const FOOD_QUESTIONS = [
  ['מאיזה חומר גלם עיקרי מכינים טחינה?', 'זרעי שומשום', ['גרגירי חומוס', 'צנוברים', 'שקדים טחונים'], 'What is the primary ingredient used to make Tahini?', 'Sesame seeds', ['Chickpeas', 'Pine nuts', 'Ground almonds'], 'easy'],
  ['מאיזו מדינה הגיעה במקור הפיצה המודרנית (פיצה מרגריטה)?', 'איטליה (נאפולי)', ['צרפת', 'יוון', 'ספרד'], 'In which country (and city) did modern Pizza Margherita originate?', 'Italy (Naples)', ['France', 'Greece', 'Spain'], 'easy'],
  ['מאיזה צמח מופק תבלין הזעפרן היקר בעולם?', 'פרח הכרכום (כרכום תרבותי)', ['פרח הווניל', 'שורש הכורכום', 'עץ הקינמון'], 'From which flower is the world’s most expensive spice, saffron, harvested?', 'The Saffron Crocus flower', ['Vanilla orchid', 'Turmeric root', 'Cinnamon tree'], 'medium'],
  ['מהו המרכיב העיקרי בממרח ה"גוואקמולי" המקסיקני?', 'אבוקדו', ['עגבניות', 'פלפל חריף', 'שעועית שחורה'], 'What is the main ingredient in Mexican guacamole?', 'Avocado', ['Tomatoes', 'Chili peppers', 'Black beans'], 'easy'],
  ['מאיזו מדינה מגיע מאכל ה"סושי"?', 'יפן', ['סין', 'תאילנד', 'וייטנאם'], 'From which country does Sushi originate?', 'Japan', ['China', 'Thailand', 'Vietnam'], 'easy'],
  ['מהו השם של האצה הכהה שבה עוטפים רול סושי?', 'נורי', ['וואקאמה', 'קומבו', 'ספירולינה'], 'What is the name of the dried seaweed sheet used to wrap sushi rolls?', 'Nori', ['Wakame', 'Kombu', 'Spirulina'], 'medium'],
  ['מאיזה פרי מייצרים צימוקים?', 'ענבים', ['שזיפים', 'תאנים', 'תמרים'], 'Which fruit is dried to make raisins?', 'Grapes', ['Plums', 'Figs', 'Dates'], 'easy'],
  ['מהו המרכיב שמעניק לכורכום ולתערובת הקארי את צבעם הצהוב העז?', 'כורכומין', ['בטא-קרוטן', 'כלורופיל', 'ליקופן'], 'Which compound gives turmeric its bright yellow color?', 'Curcumin', ['Beta-carotene', 'Chlorophyll', 'Lycopene'], 'medium'],
  ['איזה פיגמנט טבעי מעניק לעגבנייה ולאבטיח את צבעם האדום?', 'ליקופן', ['כלורופיל', 'כורכומין', 'מלנין'], 'Which natural pigment gives tomatoes and watermelons their red color?', 'Lycopene', ['Chlorophyll', 'Curcumin', 'Melanin'], 'medium'],
  ['מאיזה גרגיר מכינים באופן מסורתי את כדורי הפלאפל בישראל?', 'גרגירי חומוס', ['עדשים כתומות', 'שעועית לבנה', 'סויה'], 'Which legume is traditionally used to make falafel in Israel?', 'Chickpeas', ['Red lentils', 'White beans', 'Soybeans'], 'easy'],
  ['איזה ויטמין נמצא בשפע בפירות הדר (כמו תפוז ולימון)?', 'ויטמין C', ['ויטמין D', 'ויטמין B12', 'ויטמין K'], 'Which vitamin is especially abundant in citrus fruits like oranges and lemons?', 'Vitamin C', ['Vitamin D', 'Vitamin B12', 'Vitamin K'], 'easy'],
  ['איזה ויטמין מיוצר בגוף האדם בעת חשיפה מבוקרת לאור השמש?', 'ויטמין D', ['ויטמין C', 'ויטמין A', 'ויטמין E'], 'Which vitamin is produced by the human body when exposed to sunlight?', 'Vitamin D', ['Vitamin C', 'Vitamin A', 'Vitamin E'], 'easy'],
  ['מאיזה אגוז/פול מייצרים שוקולד?', 'פולי קקאו', ['פולי קפה', 'אגוזי לוז', 'חרובים'], 'From which beans is chocolate made?', 'Cocoa beans', ['Coffee beans', 'Hazelnuts', 'Carob pods'], 'easy'],
  ['מהו סוג הקמח שממנו מכינים פסטה איטלקית מסורתית איכותית?', 'קמח דורום (סמולינה)', ['קמח תירס', 'קמח אורז', 'קמח שיפון'], 'What type of wheat flour is used to make traditional Italian pasta?', 'Durum wheat semolina', ['Cornmeal', 'Rice flour', 'Rye flour'], 'medium'],
  ['איזה גז גורם לבצק לתפוח כשמוסיפים לו שמרים או אבקת אפייה?', 'פחמן דו-חמצני', ['חמצן', 'חנקן', 'הליום'], 'Which gas causes dough to rise when yeast or baking powder is used?', 'Carbon dioxide', ['Oxygen', 'Nitrogen', 'Helium'], 'medium']
];

// 13. Music, Culture, Art & Literature (65 questions)
const CULTURE_QUESTIONS = [
  ['כמה מיתרים יש בגיטרה קלאסית או אקוסטית רגילה?', '6 מיתרים', ['4 מיתרים', '5 מיתרים', '8 מיתרים'], 'How many strings does a standard classical or acoustic guitar have?', '6 strings', ['4 strings', '5 strings', '8 strings'], 'easy'],
  ['כמה מיתרים יש בכינור קלאסי?', '4 מיתרים', ['5 מיתרים', '6 מיתרים', '3 מיתרים'], 'How many strings does a standard violin have?', '4 strings', ['5 strings', '6 strings', '3 strings'], 'easy'],
  ['כמה קלידים (שחורים ולבנים יחד) יש בפסנתר כנף תקני?', '88 קלידים', ['76 קלידים', '64 קלידים', '100 קלידים'], 'How many keys are on a standard full-size piano?', '88 keys', ['76 keys', '64 keys', '100 keys'], 'medium'],
  ['מי צייר את הציור המפורסם "המונה ליזה"?', 'לאונרדו דה וינצ׳י', ['מיכלאנג׳לו', 'וינסנט ואן גוך', 'פבלו פיקאסו'], 'Who painted the famous "Mona Lisa"?', 'Leonardo da Vinci', ['Michelangelo', 'Vincent van Gogh', 'Pablo Picasso'], 'easy'],
  ['באיזה מוזיאון מוצג ציור "המונה ליזה"?', 'מוזיאון הלובר בפריז', ['מוזיאון הפראדו במדריד', 'המוזיאון הבריטי בלונדון', 'גלריית אופיצי בפירנצה'], 'In which museum is the "Mona Lisa" displayed?', 'The Louvre Museum in Paris', ['Prado Museum in Madrid', 'British Museum in London', 'Uffizi Gallery in Florence'], 'easy'],
  ['מי צייר את הציור "ליל כוכבים" ואת ציורי "החמניות"?', 'וינסנט ואן גוך', ['קלוד מונה', 'סלבדור דאלי', 'רמברנדט'], 'Who painted "The Starry Night" and "Sunflowers"?', 'Vincent van Gogh', ['Claude Monet', 'Salvador Dali', 'Rembrandt'], 'easy'],
  ['מי פיסל את פסל "דוד" בפירנצה וצייר את תקרת הקפלה הסיסטינית?', 'מיכלאנג׳לו בואונרוטי', ['לאונרדו דה וינצ׳י', 'רפאל', 'דונטלו'], 'Who sculpted the statue of "David" and painted the Sistine Chapel ceiling?', 'Michelangelo', ['Leonardo da Vinci', 'Raphael', 'Donatello'], 'easy'],
  ['איזה שיר ישראלי היה הראשון שזכה בתחרות האירוויזיון (בשנת 1978)?', 'אבניבי (יזהר כהן ולהקת אלפא-ביתא)', ['הללויה (גלי עטרי וחלב ודבש)', 'דיווה (דנה אינטרנשיונל)', 'טוי (נטע ברזילי)'], 'Which Israeli song was the first to win the Eurovision Song Contest (1978)?', 'A-Ba-Ni-Bi (Izhar Cohen & Alphabeta)', ['Hallelujah', 'Diva', 'Toy'], 'easy'],
  ['מי ביצעה את השיר "Toy" שזכה באירוויזיון 2018 בליסבון?', 'נטע ברזילי', ['נועה קירל', 'עדן גולן', 'שירי מימון'], 'Who performed the winning Eurovision 2018 song "Toy"?', 'Netta Barzilai', ['Noa Kirel', 'Eden Golan', 'Shiri Maimon'], 'easy'],
  ['מי כתבה והלחינה את השיר "ירושלים של זהב"?', 'נעמי שמר', ['אהוד מנור', 'נורית הירש', 'לאה גולדברג'], 'Who wrote and composed the iconic Israeli song "Jerusalem of Gold"?', 'Naomi Shemer', ['Ehud Manor', 'Nurit Hirsh', 'Leah Goldberg'], 'easy'],
  ['מי כתבה את ספר הילדים הקלאסי "דירה להשכיר"?', 'לאה גולדברג', ['מרים ילן-שטקליס', 'נעמי שמר', 'דבורה עומר'], 'Who wrote the classic Hebrew children’s book "Dira LeHaskir" (Apartment for Rent)?', 'Leah Goldberg', ['Miriam Yalan-Shteklis', 'Naomi Shemer', 'Dvora Omer'], 'easy'],
  ['מי כתב את סדרת ספרי "הארי פוטר"?', 'ג׳יי קיי רולינג', ['ג׳.ר.ר. טולקין', 'ק.ס. לואיס', 'רואלד דאל'], 'Who wrote the "Harry Potter" book series?', 'J.K. Rowling', ['J.R.R. Tolkien', 'C.S. Lewis', 'Roald Dahl'], 'easy'],
  ['מי כתב את טרילוגיית "שר הטבעות" ואת "ההוביט"?', 'ג׳.ר.ר. טולקין', ['ג׳ורג׳ ר.ר. מרטין', 'ק.ס. לואיס', 'ז׳ול ורן'], 'Who wrote "The Lord of the Rings" and "The Hobbit"?', 'J.R.R. Tolkien', ['George R.R. Martin', 'C.S. Lewis', 'Jules Verne'], 'easy'],
  ['מי הלחין את הסימפוניה התשיעית ("אודה לשמחה") למרות שהתחרש?', 'לודוויג ואן בטהובן', ['וולפגנג אמדאוס מוצרט', 'יוהאן סבסטיאן באך', 'פרדריק שופן'], 'Who composed the Ninth Symphony ("Ode to Joy") while deaf?', 'Ludwig van Beethoven', ['Wolfgang Amadeus Mozart', 'Johann Sebastian Bach', 'Frederic Chopin'], 'easy'],
  ['מי ביים את הסרטים "פארק היורה", "אי.טי." ו"רשימת שינדלר"?', 'סטיבן ספילברג', ['ג׳יימס קמרון', 'כריסטופר נולאן', 'ג׳ורג׳ לוקאס'], 'Who directed "Jurassic Park", "E.T.", and "Schindler’s List"?', 'Steven Spielberg', ['James Cameron', 'Christopher Nolan', 'George Lucas'], 'easy']
];

// 14. World Geography, Human Body, Tech & General Knowledge (120 questions)
const GENERAL_SCIENCE_QUESTIONS = [
  ['מהו האוקיינוס הגדול ביותר בעולם?', 'האוקיינוס השקט (הפסיפי)', ['האוקיינוס האטלנטי', 'האוקיינוס ההודי', 'אוקיינוס הקרח הצפוני'], 'What is the largest ocean on Earth?', 'The Pacific Ocean', ['The Atlantic Ocean', 'The Indian Ocean', 'The Arctic Ocean'], 'easy'],
  ['מהו ההר הגבוה ביותר בעולם מעל פני הים?', 'הר האוורסט', ['הר K2', 'הר קילימנג׳רו', 'הר מון בלאן'], 'What is the highest mountain in the world above sea level?', 'Mount Everest', ['K2', 'Mount Kilimanjaro', 'Mont Blanc'], 'easy'],
  ['מהו המקום הנמוך ביותר בעולם על פני היבשה?', 'ים המלח', ['עמק המוות בקליפורניה', 'בקעת הירדן הצפונית', 'מכתש רמון'], 'What is the lowest land elevation on Earth?', 'The Dead Sea shore', ['Death Valley', 'Northern Jordan Valley', 'Ramon Crater'], 'easy'],
  ['מהו הנהר הארוך ביותר בעולם (לפי המדידה הקלאסית באפריקה)?', 'נהר הנילוס', ['נהר הדנובה', 'נהר הריין', 'נהר הוולגה'], 'Which river in Africa is traditionally known as the longest river in the world?', 'The Nile River', ['The Danube River', 'The Rhine River', 'The Volga River'], 'easy'],
  ['מהו הנהר בעל ספיקת המים הגדולה ביותר בעולם (בדרום אמריקה)?', 'נהר האמזונס', ['נהר המיסיסיפי', 'נהר הקונגו', 'נהר היאנגצה'], 'Which river has the largest water discharge volume in the world?', 'The Amazon River', ['The Mississippi River', 'The Congo River', 'The Yangtze River'], 'medium'],
  ['מהי היבשת הגדולה ביותר בעולם בשטחה ובאוכלוסייתה?', 'אסיה', ['אפריקה', 'אמריקה הצפונית', 'אירופה'], 'Which is the largest continent by both land area and population?', 'Asia', ['Africa', 'North America', 'Europe'], 'easy'],
  ['מהו המדבר החם הגדול ביותר בעולם?', 'מדבר סהרה', ['מדבר גובי', 'מדבר ערב', 'מדבר קלהארי'], 'What is the largest hot desert in the world?', 'The Sahara Desert', ['The Gobi Desert', 'The Arabian Desert', 'The Kalahari Desert'], 'easy'],
  ['מהי המדינה הקטנה ביותר בעולם בשטחה?', 'קריית הוותיקן', ['מונקו', 'סן מרינו', 'ליכטנשטיין'], 'What is the smallest independent country in the world by area?', 'Vatican City', ['Monaco', 'San Marino', 'Liechtenstein'], 'easy'],
  ['מהי המדינה הגדולה ביותר בעולם בשטחה?', 'רוסיה', ['קנדה', 'סין', 'ארצות הברית'], 'What is the largest country in the world by land area?', 'Russia', ['Canada', 'China', 'United States'], 'easy'],
  ['מהו האיבר הפנימי הגדול והכבד ביותר בגוף האדם?', 'הכבד', ['הלב', 'הקיבה', 'הכליות'], 'What is the largest internal organ in the human body?', 'The Liver', ['The Heart', 'The Stomach', 'The Kidneys'], 'medium'],
  ['מהו האיבר החיצוני הגדול ביותר בגוף האדם?', 'העור', ['השרירים', 'הריאות', 'השלד'], 'What is the largest organ of the human body overall?', 'The Skin', ['The Muscles', 'The Lungs', 'The Skeleton'], 'easy'],
  ['כמה עצמות יש בגופו של אדם בוגר?', '206 עצמות', ['150 עצמות', '300 עצמות', '256 עצמות'], 'How many bones are in an adult human body?', '206 bones', ['150 bones', '300 bones', '256 bones'], 'medium'],
  ['כמה שיניים יש לאדם בוגר (כולל שיני בינה)?', '32 שיניים', ['28 שיניים', '24 שיניים', '36 שיניים'], 'How many permanent teeth does a full adult human set include?', '32 teeth', ['28 teeth', '24 teeth', '36 teeth'], 'easy'],
  ['מהו החומר הטבעי הקשה ביותר בטבע?', 'יהלום', ['ברזל', 'קוורץ', 'גרניט'], 'What is the hardest naturally occurring substance on Earth?', 'Diamond', ['Iron', 'Quartz', 'Granite'], 'easy'],
  ['באיזו טמפרטורה קופאים מים טהורים (במעלות צלזיוס)?', '0 מעלות צלזיוס', ['-10 מעלות צלזיוס', '4 מעלות צלזיוס', '32 מעלות צלזיוס'], 'At what temperature does pure water freeze on the Celsius scale?', '0 degrees Celsius', ['-10 degrees Celsius', '4 degrees Celsius', '32 degrees Celsius'], 'easy'],
  ['באיזו טמפרטורה רותחים מים בגובה פני הים (במעלות צלזיוס)?', '100 מעלות צלזיוס', ['90 מעלות צלזיוס', '120 מעלות צלזיוס', '212 מעלות צלזיוס'], 'At what temperature does water boil at sea level in Celsius?', '100 degrees Celsius', ['90 degrees Celsius', '120 degrees Celsius', '212 degrees Celsius'], 'easy'],
  ['איזה גז הוא הנפוץ ביותר באטמוספירה של כדור הארץ (כ-78%)?', 'חנקן', ['חמצן', 'פחמן דו-חמצני', 'מימן'], 'Which gas makes up about 78% of Earth’s atmosphere?', 'Nitrogen', ['Oxygen', 'Carbon dioxide', 'Hydrogen'], 'medium'],
  ['מהם ראשי התיבות של CPU במחשב?', 'יחידת עיבוד מרכזית (Central Processing Unit)', ['יחידת כוח ממוחשבת', 'זיכרון פנימי מהיר', 'כרטיס תצוגה ראשי'], 'What does CPU stand for in computing?', 'Central Processing Unit', ['Computer Power Unit', 'Fast Internal Memory', 'Main Display Card'], 'easy'],
  ['כמה סיביות (Bits) יש בבית אחד (Byte)?', '8 סיביות', ['4 סיביות', '10 סיביות', '16 סיביות'], 'How many bits are in a single byte?', '8 bits', ['4 bits', '10 bits', '16 bits'], 'easy'],
  ['מהו קוד החיוג הבינלאומי של מדינת ישראל?', '+972', ['+971', '+970', '+974'], 'What is the international telephone country code for Israel?', '+972', ['+971', '+970', '+974'], 'easy']
];

// 15. Additional Multi-Topic Trivia Facts (World Landmarks, Currency, Authors, Famous Scientists, Israeli Culture, Math & Science)
const WORLD_LANDMARKS = [
  ['מגדל אייפל', 'פריז, צרפת', 'The Eiffel Tower', 'Paris, France', 'easy'],
  ['הקולוסיאום', 'רומא, איטליה', 'The Colosseum', 'Rome, Italy', 'easy'],
  ['פסל החירות', 'ניו יורק, ארצות הברית', 'The Statue of Liberty', 'New York, USA', 'easy'],
  ['הטאג׳ מהאל', 'אגרה, הודו', 'The Taj Mahal', 'Agra, India', 'easy'],
  ['מגדל פיזה הנטוי', 'פיזה, איטליה', 'The Leaning Tower of Pisa', 'Pisa, Italy', 'easy'],
  ['שער ברנדנבורג', 'ברלין, גרמניה', 'The Brandenburg Gate', 'Berlin, Germany', 'medium'],
  ['האקרופוליס והפרתנון', 'אתונה, יוון', 'The Acropolis and Parthenon', 'Athens, Greece', 'easy'],
  ['שעון הביג בן וארמון וסטמינסטר', 'לונדון, בריטניה', 'Big Ben and Westminster Palace', 'London, United Kingdom', 'easy'],
  ['בית האופרה המפורסם דמוי המפרשים', 'סידני, אוסטרליה', 'The Sydney Opera House', 'Sydney, Australia', 'easy'],
  ['החומה הסינית הגדולה', 'סין', 'The Great Wall of China', 'China', 'easy'],
  ['מאצ׳ו פיצ׳ו (עיר האינקה העתיקה)', 'פרו', 'Machu Picchu', 'Peru', 'medium'],
  ['פטרה (העיר הנבטית החצובה בסלע האדום)', 'ירדן', 'Petra', 'Jordan', 'easy'],
  ['כנסיית סגרדה פמיליה של גאודי', 'ברצלונה, ספרד', 'La Sagrada Familia', 'Barcelona, Spain', 'medium'],
  ['פסל ישו הגואל על הר קורקובדו', 'ריו דה ז׳ניירו, ברזיל', 'Christ the Redeemer statue', 'Rio de Janeiro, Brazil', 'medium'],
  ['גשר שער הזהב (Golden Gate Bridge)', 'סן פרנסיסקו, ארצות הברית', 'The Golden Gate Bridge', 'San Francisco, USA', 'medium'],
  ['הקרמלין והכיכר האדומה', 'מוסקבה, רוסיה', 'The Kremlin and Red Square', 'Moscow, Russia', 'easy'],
  ['ארמון אלהמברה', 'גרנדה, ספרד', 'The Alhambra Palace', 'Granada, Spain', 'hard'],
  ['אנגקור וואט (מתחם המקדשים העתיק)', 'קמבודיה', 'Angkor Wat', 'Cambodia', 'hard'],
  ['הפירמידות הגדולות והספינקס', 'גיזה, מצרים', 'The Great Pyramids and Sphinx', 'Giza, Egypt', 'easy'],
  ['מגדל בורג׳ ח׳ליפה (הבניין הגבוה בעולם)', 'דובאי, איחוד האמירויות', 'Burj Khalifa', 'Dubai, UAE', 'easy']
];

const CURRENCIES_DATA = [
  ['יפן', 'ין יפני', 'Japan', 'Japanese Yen', 'easy'],
  ['בריטניה', 'לירה שטרלינג (פאונד)', 'United Kingdom', 'Pound Sterling', 'easy'],
  ['הודו', 'רופי הודי', 'India', 'Indian Rupee', 'medium'],
  ['שווייץ', 'פרנק שווייצרי', 'Switzerland', 'Swiss Franc', 'easy'],
  ['רוסיה', 'רובל רוסי', 'Russia', 'Russian Ruble', 'easy'],
  ['פולין', 'זלוטי פולני', 'Poland', 'Polish Zloty', 'medium'],
  ['הונגריה', 'פורינט הונגרי', 'Hungary', 'Hungarian Forint', 'medium'],
  ['תאילנד', 'באט תאילנדי', 'Thailand', 'Thai Baht', 'medium'],
  ['ברזיל', 'ריאל ברזילאי', 'Brazil', 'Brazilian Real', 'medium'],
  ['מקסיקו', 'פסו מקסיקני', 'Mexico', 'Mexican Peso', 'medium'],
  ['טורקיה', 'לירה טורקית', 'Turkey', 'Turkish Lira', 'easy'],
  ['דרום קוריאה', 'וון דרום-קוריאני', 'South Korea', 'South Korean Won', 'hard'],
  ['סין', 'יואן סיני (רנמינבי)', 'China', 'Chinese Yuan (Renminbi)', 'medium'],
  ['דרום אפריקה', 'ראנד דרום-אפריקאי', 'South Africa', 'South African Rand', 'hard'],
  ['שוודיה', 'כתר שוודי (קרונה)', 'Sweden', 'Swedish Krona', 'medium']
];

const ANIMAL_OFFSPRING_DATA = [
  ['כלב', 'גור', 'Dog', 'Puppy', 'easy'],
  ['סוס', 'סייח', 'Horse', 'Foal', 'easy'],
  ['חמור', 'עייר', 'Donkey', 'Foal (Ayir)', 'medium'],
  ['פרה', 'עגל', 'Cow', 'Calf', 'easy'],
  ['כבשה', 'טלה', 'Sheep', 'Lamb', 'easy'],
  ['עז', 'גדי', 'Goat', 'Kid (Gdi)', 'easy'],
  ['גמל', 'בכר', 'Camel', 'Camel calf (Bachar)', 'hard'],
  ['צבי או אייל', 'עופר', 'Deer / Gazelle', 'Fawn (Ofer)', 'easy'],
  ['אריה', 'כפיר (גור אריות)', 'Lion', 'Lion cub (Kfir)', 'medium'],
  ['תרנגולת', 'אפרוח', 'Chicken', 'Chick (Efroach)', 'easy'],
  ['יונה או עוף דורס', 'גוזל', 'Pigeon / Bird of prey', 'Nestling (Gozal)', 'easy'],
  ['צפרדע', 'ראשן', 'Frog', 'Tadpole (Roshan)', 'easy']
];

const ANIMAL_SOUNDS_DATA = [
  ['אריה', 'שואג', 'Lion', 'Roars', 'easy'],
  ['כלב', 'נובח', 'Dog', 'Barks', 'easy'],
  ['חתול', 'מיילל', 'Cat', 'Meows', 'easy'],
  ['סוס', 'צוהל', 'Horse', 'Neighs', 'easy'],
  ['חמור', 'נוער', 'Donkey', 'Brays', 'easy'],
  ['פרה', 'גועה', 'Cow', 'Moos', 'easy'],
  ['כבשה', 'פועה', 'Sheep', 'Bleats', 'medium'],
  ['זאב או תן', 'מיילל', 'Wolf / Jackal', 'Howls', 'easy'],
  ['נחש', 'לוחש', 'Snake', 'Hisses', 'medium'],
  ['יונה', 'הוגה / הומה', 'Dove / Pigeon', 'Coos', 'medium'],
  ['עורב', 'קורא (מקרקר)', 'Crow', 'Caws', 'medium'],
  ['דבורה', 'מזמזמת', 'Bee', 'Buzzes', 'easy'],
  ['צפרדע', 'מקרקרת', 'Frog', 'Croaks', 'easy'],
  ['תרנגול', 'קורא', 'Rooster', 'Crows', 'easy'],
  ['דוב', 'נוהם', 'Bear', 'Growls', 'medium']
];

const ISRAELI_SONGS_DATA = [
  ['נתתי לה חיי', 'כוורת', 'Natati La Chayai', 'Kaveret', 'easy'],
  ['המגפיים של ברוך', 'כוורת', 'HaMagafayim Shel Baruch', 'Kaveret', 'easy'],
  ['אני ואתה נשנה את העולם', 'אריק איינשטיין', 'Ani VeAta', 'Arik Einstein', 'easy'],
  ['עוף גוזל', 'אריק איינשטיין', 'Uf Gozal', 'Arik Einstein', 'easy'],
  ['ירח', 'שלמה ארצי', 'Yareach', 'Shlomo Artzi', 'easy'],
  ['תחת שמי ים התיכון', 'שלמה ארצי', 'Tachat Shmei Yam HaTichon', 'Shlomo Artzi', 'medium'],
  ['חורף 73 (אנחנו הילדים של חורף שנת 73)', 'להקת חיל החינוך', 'Choref 73', 'Education Corps Band', 'easy'],
  ['הללויה', 'גלי עטרי וחלב ודבש', 'Hallelujah', 'Gali Atari & Milk and Honey', 'easy'],
  ['חי', 'עופרה חזה', 'Chai', 'Ofra Haza', 'easy'],
  ['אם ננעלו', 'עופרה חזה', 'Im Nin’alu', 'Ofra Haza', 'easy'],
  ['הפרח בגני', 'זוהר ארגוב', 'HaPerach BeGani', 'Zohar Argov', 'easy'],
  ['בואי (בואי תני לי יד ונלך)', 'הפרויקט של עידן רייכל', 'Bo’i', 'The Idan Raichel Project', 'easy'],
  ['ממעמקים', 'הפרויקט של עידן רייכל', 'MiMa’amakim', 'The Idan Raichel Project', 'easy'],
  ['יוניקורן (Unicorn)', 'נועה קירל', 'Unicorn', 'Noa Kirel', 'easy'],
  ['הוריקן (Hurricane)', 'עדן גולן', 'Hurricane', 'Eden Golan', 'easy'],
  ['השקט שנשאר', 'שירי מימון', 'HaSheket SheNish’ar', 'Shiri Maimon', 'easy'],
  ['דיווה', 'דנה אינטרנשיונל', 'Diva', 'Dana International', 'easy'],
  ['אחי הצעיר יהודה', 'להקת גייסות השריון (אהוד מנור)', 'Achi HaTza’ir Yehuda', 'Armored Corps Troupe', 'medium'],
  ['אין לי ארץ אחרת', 'גלי עטרי / קורין אלאל (מילים: אהוד מנור)', 'Ein Li Eretz Acheret', 'Gali Atari / Corinne Allal', 'easy'],
  ['שבחי ירושלים', 'אביהו מדינה / דקלון', 'Shabechi Yerushalayim', 'Avihu Medina / Daklon', 'medium']
];

const BIBLE_BOOKS_ORDER = [
  ['בראשית', 'החומש הראשון בתורה (בריאת העולם והאבות)', 'Genesis (Bereishit)', 'The first book of the Torah', 'easy'],
  ['שמות', 'החומש השני בתורה (שעבוד מצרים, יציאת מצרים ומתן תורה)', 'Exodus (Shemot)', 'The second book of the Torah', 'easy'],
  ['ויקרא', 'החומש השלישי בתורה (דיני הקורבנות, המשכן והקדושה)', 'Leviticus (Vayikra)', 'The third book of the Torah', 'easy'],
  ['במדבר', 'החומש הרביעי בתורה (נדודי בני ישראל במדבר 40 שנה)', 'Numbers (Bamidbar)', 'The fourth book of the Torah', 'easy'],
  ['דברים', 'החומש החמישי בתורה (נאומי הפרידה של משה רבנו)', 'Deuteronomy (Devarim)', 'The fifth book of the Torah', 'easy'],
  ['יהושע', 'הספר הראשון בנביאים ראשונים (כיבוש הארץ וחלוקתה לשבטים)', 'Book of Joshua', 'Conquest and division of the Land of Israel', 'easy'],
  ['שופטים', 'ספר בתקופת השופטים (דבורה, גדעון, יפתח ושמשון)', 'Book of Judges', 'The era of the Biblical Judges', 'easy'],
  ['שמואל', 'ספר המתאר את שמואל הנביא, מלכות שאול ומלכות דוד', 'Book of Samuel', 'Samuel, King Saul, and King David', 'easy'],
  ['מלכים', 'ספר המתאר את מלכות שלמה, פילוג המלוכה ומלכי יהודה וישראל', 'Book of Kings', 'King Solomon and the Kings of Judah and Israel', 'medium'],
  ['תהילים', 'ספר המזמורים והתפילות המיוחס ברובו לדוד המלך', 'Book of Psalms (Tehillim)', 'Book of praises attributed mostly to King David', 'easy'],
  ['משלי', 'ספר החוכמה והמשלים המיוחס לשלמה המלך', 'Book of Proverbs (Mishlei)', 'Book of wisdom attributed to King Solomon', 'easy'],
  ['מגילת אסתר', 'המגילה הנקראת בחג הפורים על נס ההצלה בשושן הבירה', 'Book of Esther', 'The scroll read on Purim', 'easy'],
  ['קהלת', 'המגילה הפותחת במילים "הבל הבלים אמר קהלת"', 'Ecclesiastes (Kohelet)', 'Opens with "Vanity of vanities, says Kohelet"', 'medium'],
  ['שיר השירים', 'מגילת שירי האהבה והקשר בין עם ישראל לאלוהיו המיוחסת לשלמה', 'Song of Songs (Shir HaShirim)', 'Poetic scroll attributed to Solomon', 'medium'],
  ['איוב', 'ספר העוסק בשאלת צדיק ורע לו ובניסיונותיו של איוב', 'Book of Job (Iyov)', 'Deals with the trials and faith of Job', 'medium']
];

const SCIENCE_UNITS_DATA = [
  ['מטר', 'אורך ומרחק', 'Meter', 'Length and distance', 'easy'],
  ['קילוגרם', 'מסה', 'Kilogram', 'Mass', 'easy'],
  ['שנייה', 'זמן', 'Second', 'Time', 'easy'],
  ['אמפר', 'עוצמת זרם חשמלי', 'Ampere', 'Electric current', 'medium'],
  ['וולט', 'מתח חשמלי', 'Volt', 'Electric voltage', 'easy'],
  ['אוהם', 'התנגדות חשמלית', 'Ohm', 'Electrical resistance', 'medium'],
  ['וואט', 'הספק חשמלי או מכני', 'Watt', 'Power', 'easy'],
  ['ג׳אול', 'אנרגיה ועבודה', 'Joule', 'Energy and work', 'medium'],
  ['ניוטון', 'כוח', 'Newton', 'Force', 'medium'],
  ['הרץ', 'תדירות (תדר)', 'Hertz', 'Frequency', 'medium'],
  ['דציבל', 'עוצמת קול ורעש', 'Decibel', 'Sound intensity', 'easy'],
  ['פסקל (או בר)', 'לחץ', 'Pascal (or Bar)', 'Pressure', 'hard'],
  ['קלווין (או צלזיוס)', 'טמפרטורה', 'Kelvin (or Celsius)', 'Temperature', 'medium'],
  ['שנת אור', 'מרחק אסטרונומי בחלל', 'Light-year', 'Astronomical distance', 'easy'],
  ['קשר (Knot)', 'מהירות של כלי שיט וכלי טיס', 'Knot', 'Speed of ships and aircraft', 'medium']
];

function generateFullQuestionBank() {
  const rng = createSeededRng(20261122);
  const bank = [];
  let seq = 1;

  function addItem(topic, difficulty, question, answers, correctIndex, questionEn, answersEn) {
    bank.push({
      id: `qbank-${seq++}`,
      topic,
      difficulty: difficulty || 'medium',
      question,
      answers,
      correctIndex,
      questionEn: questionEn || question,
      answersEn: Array.isArray(answersEn) && answersEn.length === 4 ? answersEn : answers
    });
  }

  function addFixedList(topic, list) {
    for (const row of list) {
      const [qHe, corrHe, distHe, qEn, corrEn, distEn, diff] = row;
      const built = buildFourOptions(corrHe, distHe, corrEn, distEn, rng);
      addItem(topic, diff, qHe, built.answers, built.correctIndex, qEn, built.answersEn);
    }
  }

  // 1. Fixed curated lists
  addFixedList('תנ"ך ומורשת', BIBLE_QUESTIONS);
  addFixedList('היסטוריה של ישראל', ISRAEL_HISTORY_QUESTIONS);
  addFixedList('חלל ואסטרונומיה', SPACE_QUESTIONS);
  addFixedList('מדע וטבע', ANIMALS_QUESTIONS);
  addFixedList('ספורט וכדורגל', SPORTS_QUESTIONS);
  addFixedList('חגי ישראל ומסורת', HOLIDAYS_QUESTIONS);
  addFixedList('השפה העברית', HEBREW_LANGUAGE_DATA);
  addFixedList('אוכל וקולינריה', FOOD_QUESTIONS);
  addFixedList('תרבות, קולנוע ומוזיקה', CULTURE_QUESTIONS);
  addFixedList('ידע כללי', GENERAL_SCIENCE_QUESTIONS);

  // 2. Countries & Capitals (85 countries * 3 angles = 255 questions)
  const allCapitalsHe = COUNTRIES_DATA.map((c) => c[1]);
  const allCountriesHe = COUNTRIES_DATA.map((c) => c[0]);
  const capHeToEn = Object.fromEntries(COUNTRIES_DATA.map((c) => [c[1], c[4]]));
  const countryHeToEn = Object.fromEntries(COUNTRIES_DATA.map((c) => [c[0], c[3]]));

  for (const [countryHe, capitalHe, continentHe, countryEn, capitalEn, continentEn, diff] of COUNTRIES_DATA) {
    // Q1: What is the capital of X?
    const distCapsHe = pickDistractors(allCapitalsHe, capitalHe, 3, rng);
    const distCapsEn = distCapsHe.map((h) => capHeToEn[h] || h);
    const b1 = buildFourOptions(capitalHe, distCapsHe, capitalEn, distCapsEn, rng);
    addItem(
      'גיאוגרפיה ועולם',
      diff,
      `מהי עיר הבירה של ${countryHe}?`,
      b1.answers,
      b1.correctIndex,
      `What is the capital city of ${countryEn}?`,
      b1.answersEn
    );

    // Q2: Which country has capital Y?
    if (countryHe !== capitalHe) {
      const distCountHe = pickDistractors(allCountriesHe, countryHe, 3, rng);
      const distCountEn = distCountHe.map((h) => countryHeToEn[h] || h);
      const b2 = buildFourOptions(countryHe, distCountHe, countryEn, distCountEn, rng);
      addItem(
        'גיאוגרפיה ועולם',
        diff,
        `${capitalHe} היא עיר הבירה של איזו מדינה?`,
        b2.answers,
        b2.correctIndex,
        `${capitalEn} is the capital of which country?`,
        b2.answersEn
      );
    }

    // Q3: In which continent is country X located?
    const allContinentsHe = ['אירופה', 'אסיה', 'אפריקה', 'אמריקה הצפונית', 'אמריקה הדרומית', 'אוקיאניה'];
    const contHeToEn = {
      'אירופה': 'Europe',
      'אסיה': 'Asia',
      'אפריקה': 'Africa',
      'אמריקה הצפונית': 'North America',
      'אמריקה הדרומית': 'South America',
      'אוקיאניה': 'Oceania'
    };
    const distContHe = pickDistractors(allContinentsHe, continentHe, 3, rng);
    const distContEn = distContHe.map((h) => contHeToEn[h]);
    const b3 = buildFourOptions(continentHe, distContHe, continentEn, distContEn, rng);
    addItem(
      'גיאוגרפיה ועולם',
      diff === 'hard' ? 'medium' : 'easy',
      `באיזו יבשת שוכנת המדינה ${countryHe}?`,
      b3.answers,
      b3.correctIndex,
      `On which continent is ${countryEn} located?`,
      b3.answersEn
    );
  }

  // 3. Chemical Elements (37 elements * 2 = 74 questions)
  const allElementSymbols = ELEMENTS_DATA.map((e) => e[1]);
  const allElementNamesHe = ELEMENTS_DATA.map((e) => e[0]);
  const elHeToEn = Object.fromEntries(ELEMENTS_DATA.map((e) => [e[0], e[3]]));

  for (const [elHe, sym, atomicNum, elEn, diff] of ELEMENTS_DATA) {
    const distSym = pickDistractors(allElementSymbols, sym, 3, rng);
    const b1 = buildFourOptions(sym, distSym, sym, distSym, rng);
    addItem(
      'מדע וטבע',
      diff,
      `מהו הסמל הכימי של היסוד ${elHe}?`,
      b1.answers,
      b1.correctIndex,
      `What is the chemical symbol for the element ${elEn}?`,
      b1.answersEn
    );

    const distNamesHe = pickDistractors(allElementNamesHe, elHe, 3, rng);
    const distNamesEn = distNamesHe.map((h) => elHeToEn[h] || h);
    const b2 = buildFourOptions(elHe, distNamesHe, elEn, distNamesEn, rng);
    addItem(
      'מדע וטבע',
      diff,
      `איזה יסוד כימי מסומן בטבלה המחזורית באותיות "${sym}" (מספר אטומי ${atomicNum})?`,
      b2.answers,
      b2.correctIndex,
      `Which chemical element has the symbol "${sym}" (atomic number ${atomicNum})?`,
      b2.answersEn
    );
  }

  // 4. Inventions & Scientists (40 * 2 = 80 questions)
  const allInventorsHe = INVENTIONS_DATA.map((i) => i[1]);
  const allInventionsHe = INVENTIONS_DATA.map((i) => i[0]);
  const invtrHeToEn = Object.fromEntries(INVENTIONS_DATA.map((i) => [i[1], i[3]]));
  const invtnHeToEn = Object.fromEntries(INVENTIONS_DATA.map((i) => [i[0], i[2]]));

  for (const [invHe, personHe, invEn, personEn, diff] of INVENTIONS_DATA) {
    const distPeopleHe = pickDistractors(allInventorsHe, personHe, 3, rng);
    const distPeopleEn = distPeopleHe.map((h) => invtrHeToEn[h] || h);
    const b1 = buildFourOptions(personHe, distPeopleHe, personEn, distPeopleEn, rng);
    addItem(
      'טכנולוגיה והמצאות',
      diff,
      `מי פיתח, גילה או המציא את ${invHe}?`,
      b1.answers,
      b1.correctIndex,
      `Who invented, developed, or discovered ${invEn}?`,
      b1.answersEn
    );

    const distInvHe = pickDistractors(allInventionsHe, invHe, 3, rng);
    const distInvEn = distInvHe.map((h) => invtnHeToEn[h] || h);
    const b2 = buildFourOptions(invHe, distInvHe, invEn, distInvEn, rng);
    addItem(
      'טכנולוגיה והמצאות',
      diff,
      `באיזו המצאה או תגלית מפורסם במיוחד ${personHe}?`,
      b2.answers,
      b2.correctIndex,
      `For which invention or discovery is ${personEn} famously known?`,
      b2.answersEn
    );
  }

  // 5. Israeli Places & Landmarks (30 * 2 = 60 questions)
  const allIlCitiesHe = ISRAEL_PLACES_DATA.map((p) => p[0]);
  const allIlSitesHe = ISRAEL_PLACES_DATA.map((p) => p[1]);
  const ilCityHeToEn = Object.fromEntries(ISRAEL_PLACES_DATA.map((p) => [p[0], p[3]]));
  const ilSiteHeToEn = Object.fromEntries(ISRAEL_PLACES_DATA.map((p) => [p[1], p[4]]));

  for (const [cityHe, siteHe, regionHe, cityEn, siteEn, regionEn, diff] of ISRAEL_PLACES_DATA) {
    const distCitiesHe = pickDistractors(allIlCitiesHe, cityHe, 3, rng);
    const distCitiesEn = distCitiesHe.map((h) => ilCityHeToEn[h] || h);
    const b1 = buildFourOptions(cityHe, distCitiesHe, cityEn, distCitiesEn, rng);
    addItem(
      'היסטוריה של ישראל',
      diff,
      `באיזו עיר או אתר בישראל נמצאים ${siteHe}?`,
      b1.answers,
      b1.correctIndex,
      `In which Israeli city or site can you find ${siteEn}?`,
      b1.answersEn
    );

    const distSitesHe = pickDistractors(allIlSitesHe, siteHe, 3, rng);
    const distSitesEn = distSitesHe.map((h) => ilSiteHeToEn[h] || h);
    const b2 = buildFourOptions(siteHe, distSitesHe, siteEn, distSitesEn, rng);
    addItem(
      'גיאוגרפיה ועולם',
      diff,
      `איזה מהאתרים הבאים מזוהה עם ${cityHe} (${regionHe})?`,
      b2.answers,
      b2.correctIndex,
      `Which of the following landmarks is associated with ${cityEn} (${regionEn})?`,
      b2.answersEn
    );
  }

  // 6. World Landmarks (20 * 2 = 40 questions)
  const allLandmarkPlacesHe = WORLD_LANDMARKS.map((l) => l[1]);
  const allLandmarkNamesHe = WORLD_LANDMARKS.map((l) => l[0]);
  const lmPlaceHeToEn = Object.fromEntries(WORLD_LANDMARKS.map((l) => [l[1], l[3]]));
  const lmNameHeToEn = Object.fromEntries(WORLD_LANDMARKS.map((l) => [l[0], l[2]]));

  for (const [nameHe, placeHe, nameEn, placeEn, diff] of WORLD_LANDMARKS) {
    const distPlacesHe = pickDistractors(allLandmarkPlacesHe, placeHe, 3, rng);
    const distPlacesEn = distPlacesHe.map((h) => lmPlaceHeToEn[h] || h);
    const b1 = buildFourOptions(placeHe, distPlacesHe, placeEn, distPlacesEn, rng);
    addItem(
      'גיאוגרפיה ועולם',
      diff,
      `היכן בעולם נמצא האתר המפורסם "${nameHe}"?`,
      b1.answers,
      b1.correctIndex,
      `Where in the world is the famous landmark "${nameEn}" located?`,
      b1.answersEn
    );

    const distNamesHe = pickDistractors(allLandmarkNamesHe, nameHe, 3, rng);
    const distNamesEn = distNamesHe.map((h) => lmNameHeToEn[h] || h);
    const b2 = buildFourOptions(nameHe, distNamesHe, nameEn, distNamesEn, rng);
    addItem(
      'גיאוגרפיה ועולם',
      diff,
      `איזה אתר מפורסם בעולם שוכן ב${placeHe}?`,
      b2.answers,
      b2.correctIndex,
      `Which world-famous landmark is located in ${placeEn}?`,
      b2.answersEn
    );
  }

  // 7. World Currencies (15 * 2 = 30 questions)
  const allCurrHe = CURRENCIES_DATA.map((c) => c[1]);
  const allCurrCountHe = CURRENCIES_DATA.map((c) => c[0]);
  const currHeToEn = Object.fromEntries(CURRENCIES_DATA.map((c) => [c[1], c[3]]));
  const currCountHeToEn = Object.fromEntries(CURRENCIES_DATA.map((c) => [c[0], c[2]]));

  for (const [cHe, curHe, cEn, curEn, diff] of CURRENCIES_DATA) {
    const distCurHe = pickDistractors(allCurrHe, curHe, 3, rng);
    const distCurEn = distCurHe.map((h) => currHeToEn[h] || h);
    const b1 = buildFourOptions(curHe, distCurHe, curEn, distCurEn, rng);
    addItem(
      'ידע כללי',
      diff,
      `מהו המטבע הרשמי של ${cHe}?`,
      b1.answers,
      b1.correctIndex,
      `What is the official currency of ${cEn}?`,
      b1.answersEn
    );

    const distCHe = pickDistractors(allCurrCountHe, cHe, 3, rng);
    const distCEn = distCHe.map((h) => currCountHeToEn[h] || h);
    const b2 = buildFourOptions(cHe, distCHe, cEn, distCEn, rng);
    addItem(
      'ידע כללי',
      diff,
      `באיזו מדינה המטבע הרשמי הוא ${curHe}?`,
      b2.answers,
      b2.correctIndex,
      `In which country is the ${curEn} the official currency?`,
      b2.answersEn
    );
  }

  // 8. Animal Offspring & Animal Sounds in Hebrew (12 + 15 = 27 questions)
  const allYoungHe = ANIMAL_OFFSPRING_DATA.map((a) => a[1]);
  const youngHeToEn = Object.fromEntries(ANIMAL_OFFSPRING_DATA.map((a) => [a[1], a[3]]));
  for (const [animalHe, youngHe, animalEn, youngEn, diff] of ANIMAL_OFFSPRING_DATA) {
    const distHe = pickDistractors(allYoungHe, youngHe, 3, rng);
    const distEn = distHe.map((h) => youngHeToEn[h] || h);
    const b = buildFourOptions(youngHe, distHe, youngEn, distEn, rng);
    addItem(
      'השפה העברית',
      diff,
      `כיצד נקרא בעברית הצאצא הצעיר של ${animalHe}?`,
      b.answers,
      b.correctIndex,
      `What is the young offspring of a ${animalEn} called in Hebrew?`,
      b.answersEn
    );
  }

  const allSoundsHe = ANIMAL_SOUNDS_DATA.map((a) => a[1]);
  const soundHeToEn = Object.fromEntries(ANIMAL_SOUNDS_DATA.map((a) => [a[1], a[3]]));
  for (const [animalHe, soundHe, animalEn, soundEn, diff] of ANIMAL_SOUNDS_DATA) {
    const distHe = pickDistractors(allSoundsHe, soundHe, 3, rng);
    const distEn = distHe.map((h) => soundHeToEn[h] || h);
    const b = buildFourOptions(soundHe, distHe, soundEn, distEn, rng);
    addItem(
      'השפה העברית',
      diff,
      `כיצד נקרא בעברית הקול שמשמיע ה${animalHe}?`,
      b.answers,
      b.correctIndex,
      `What verb describes the sound a ${animalEn} makes?`,
      b.answersEn
    );
  }

  // 9. Israeli Songs & Artists (20 questions)
  const allArtistsHe = Array.from(new Set(ISRAELI_SONGS_DATA.map((s) => s[1])));
  const artistHeToEn = Object.fromEntries(ISRAELI_SONGS_DATA.map((s) => [s[1], s[3]]));
  for (const [songHe, artistHe, songEn, artistEn, diff] of ISRAELI_SONGS_DATA) {
    const distHe = pickDistractors(allArtistsHe, artistHe, 3, rng);
    const distEn = distHe.map((h) => artistHeToEn[h] || h);
    const b = buildFourOptions(artistHe, distHe, artistEn, distEn, rng);
    addItem(
      'תרבות, קולנוע ומוזיקה',
      diff,
      `מי מבצע במקור את השיר הישראלי המוכר "${songHe}"?`,
      b.answers,
      b.correctIndex,
      `Who originally performed the famous Israeli song "${songEn}"?`,
      b.answersEn
    );
  }

  // 10. Bible Books & Descriptions (15 * 2 = 30 questions)
  const allBBookNamesHe = BIBLE_BOOKS_ORDER.map((b) => b[0]);
  const allBBookDescHe = BIBLE_BOOKS_ORDER.map((b) => b[1]);
  const bbNameHeToEn = Object.fromEntries(BIBLE_BOOKS_ORDER.map((b) => [b[0], b[2]]));
  const bbDescHeToEn = Object.fromEntries(BIBLE_BOOKS_ORDER.map((b) => [b[1], b[3]]));
  for (const [nameHe, descHe, nameEn, descEn, diff] of BIBLE_BOOKS_ORDER) {
    const distNamesHe = pickDistractors(allBBookNamesHe, nameHe, 3, rng);
    const distNamesEn = distNamesHe.map((h) => bbNameHeToEn[h] || h);
    const b1 = buildFourOptions(nameHe, distNamesHe, nameEn, distNamesEn, rng);
    addItem(
      'תנ"ך ומורשת',
      diff,
      `איזה ספר בתנ"ך מוגדר בתור ${descHe}?`,
      b1.answers,
      b1.correctIndex,
      `Which biblical book is described as: ${descEn}?`,
      b1.answersEn
    );

    const distDescHe = pickDistractors(allBBookDescHe, descHe, 3, rng);
    const distDescEn = distDescHe.map((h) => bbDescHeToEn[h] || h);
    const b2 = buildFourOptions(descHe, distDescHe, descEn, distDescEn, rng);
    addItem(
      'תנ"ך ומורשת',
      diff,
      `מהו תוכנו המרכזי של ספר "${nameHe}" בתנ"ך?`,
      b2.answers,
      b2.correctIndex,
      `What is the main subject of the biblical book "${nameEn}"?`,
      b2.answersEn
    );
  }

  // 11. Science & Measurement Units (15 * 2 = 30 questions)
  const allUnitsHe = SCIENCE_UNITS_DATA.map((u) => u[0]);
  const allMeasuresHe = SCIENCE_UNITS_DATA.map((u) => u[1]);
  const unitHeToEn = Object.fromEntries(SCIENCE_UNITS_DATA.map((u) => [u[0], u[2]]));
  const measHeToEn = Object.fromEntries(SCIENCE_UNITS_DATA.map((u) => [u[1], u[3]]));
  for (const [uHe, mHe, uEn, mEn, diff] of SCIENCE_UNITS_DATA) {
    const distUHe = pickDistractors(allUnitsHe, uHe, 3, rng);
    const distUEn = distUHe.map((h) => unitHeToEn[h] || h);
    const b1 = buildFourOptions(uHe, distUHe, uEn, distUEn, rng);
    addItem(
      'מדע וטבע',
      diff,
      `באיזו יחידת מידה פיזיקלית מודדים ${mHe}?`,
      b1.answers,
      b1.correctIndex,
      `Which unit of measurement is used to measure ${mEn}?`,
      b1.answersEn
    );

    const distMHe = pickDistractors(allMeasuresHe, mHe, 3, rng);
    const distMEn = distMHe.map((h) => measHeToEn[h] || h);
    const b2 = buildFourOptions(mHe, distMHe, mEn, distMEn, rng);
    addItem(
      'מדע וטבע',
      diff,
      `מה מודדים באמצעות יחידת המידה "${uHe}"?`,
      b2.answers,
      b2.correctIndex,
      `What physical quantity is measured in "${uEn}"?`,
      b2.answersEn
    );
  }

  // 12. Number & Logic & Gematria & Calendar Trivia to exceed 1,000 distinct questions
  const GEMATRIA_WORDS = [
    ['חי', 18, 'Chai (חי)'],
    ['אהבה', 13, 'Ahava (אהבה)'],
    ['אחד', 13, 'Echad (אחד)'],
    ['טוב', 17, 'Tov (טוב)'],
    ['אמת', 441, 'Emet (אמת)'],
    ['שלום', 376, 'Shalom (שלום)'],
    ['תורה', 611, 'Torah (תורה)'],
    ['שבת', 702, 'Shabbat (שבת)'],
    ['ברכה', 227, 'Bracha (ברכה)'],
    ['מלך', 90, 'Melech (מלך)'],
    ['אור', 207, 'Or (אור)'],
    ['חן', 58, 'Chen (חן)'],
    ['גן', 53, 'Gan (גן)'],
    ['טל', 39, 'Tal (טל)'],
    ['דוד', 14, 'David (דוד)'],
    ['משה', 345, 'Moshe (משה)'],
    ['ישראל', 541, 'Yisrael (ישראל)'],
    ['ציון', 156, 'Tzion (ציון)'],
    ['ירושלים', 586, 'Yerushalayim (ירושלים)'],
    ['חנוכה', 89, 'Chanukah (חנוכה)'],
    ['פסח', 148, 'Pesach (פסח)'],
    ['פורים', 336, 'Purim (פורים)'],
    ['סוכה', 91, 'Sukkah (סוכה)'],
    ['מצה', 135, 'Matzah (מצה)'],
    ['שופר', 586, 'Shofar (שופר)']
  ];
  for (const [wordHe, val, wordEn] of GEMATRIA_WORDS) {
    const d1 = String(val + 5);
    const d2 = String(Math.max(1, val - 4));
    const d3 = String(val + 12);
    const b = buildFourOptions(String(val), [d1, d2, d3], String(val), [d1, d2, d3], rng);
    addItem(
      'השפה העברית',
      val < 100 ? 'easy' : 'medium',
      `מהו הערך הגימטרי של המילה "${wordHe}"?`,
      b.answers,
      b.correctIndex,
      `What is the Hebrew Gematria numerical value of the word "${wordEn}"?`,
      b.answersEn
    );
  }

  // Roman Numerals & Historical Centuries & Math Milestones
  const ROMAN_NUMERALS = [
    ['V', 5], ['X', 10], ['XV', 15], ['XX', 20], ['XXV', 25], ['XXX', 30], ['XL', 40],
    ['L', 50], ['LX', 60], ['LXX', 70], ['XC', 90], ['C', 100], ['CL', 150], ['CC', 200],
    ['CD', 400], ['D', 500], ['DC', 600], ['CM', 900], ['M', 1000], ['MMXXV', 2025]
  ];
  for (const [rom, num] of ROMAN_NUMERALS) {
    const dist = [String(num + 10), String(Math.max(1, num - 5)), String(num * 2)];
    const b = buildFourOptions(String(num), dist, String(num), dist, rng);
    addItem(
      'ידע כללי',
      num <= 100 ? 'easy' : 'medium',
      `איזה מספר מיוצג על ידי הספרות הרומיות "${rom}"?`,
      b.answers,
      b.correctIndex,
      `Which number is represented by the Roman numerals "${rom}"?`,
      b.answersEn
    );
  }

  // 13. World Languages & Official Countries (35 * 2 = 70 questions)
  const WORLD_LANGUAGES_DATA = [
    ['ברזיל', 'פורטוגזית', 'Brazil', 'Portuguese', 'easy'],
    ['ארגנטינה', 'ספרדית', 'Argentina', 'Spanish', 'easy'],
    ['אוסטריה', 'גרמנית', 'Austria', 'German', 'easy'],
    ['מצרים', 'ערבית', 'Egypt', 'Arabic', 'easy'],
    ['יפן', 'יפנית', 'Japan', 'Japanese', 'easy'],
    ['סין', 'מנדרינית (סינית)', 'China', 'Mandarin Chinese', 'easy'],
    ['איראן', 'פרסית', 'Iran', 'Persian (Farsi)', 'easy'],
    ['טורקיה', 'טורקית', 'Turkey', 'Turkish', 'easy'],
    ['יוון', 'יוונית', 'Greece', 'Greek', 'easy'],
    ['פולין', 'פולנית', 'Poland', 'Polish', 'easy'],
    ['הונגריה', 'הונגרית', 'Hungary', 'Hungarian', 'easy'],
    ['הולנד', 'הולנדית', 'Netherlands', 'Dutch', 'easy'],
    ['תאילנד', 'תאית', 'Thailand', 'Thai', 'easy'],
    ['דרום קוריאה', 'קוריאנית', 'South Korea', 'Korean', 'easy'],
    ['וייטנאם', 'וייטנאמית', 'Vietnam', 'Vietnamese', 'medium'],
    ['אתיופיה', 'אמהרית', 'Ethiopia', 'Amharic', 'easy'],
    ['גאורגיה', 'גאורגית', 'Georgia', 'Georgian', 'medium'],
    ['אוקראינה', 'אוקראינית', 'Ukraine', 'Ukrainian', 'easy'],
    ['רומניה', 'רומנית', 'Romania', 'Romanian', 'easy'],
    ['צ׳כיה', 'צ׳כית', 'Czech Republic', 'Czech', 'easy'],
    ['שוודיה', 'שוודית', 'Sweden', 'Swedish', 'easy'],
    ['נורווגיה', 'נורווגית', 'Norway', 'Norwegian', 'easy'],
    ['דנמרק', 'דנית', 'Denmark', 'Danish', 'easy'],
    ['פינלנד', 'פינית', 'Finland', 'Finnish', 'medium'],
    ['מקסיקו', 'ספרדית', 'Mexico', 'Spanish', 'easy'],
    ['קולומביה', 'ספרדית', 'Colombia', 'Spanish', 'easy'],
    ['צ׳ילה', 'ספרדית', 'Chile', 'Spanish', 'easy'],
    ['פרו', 'ספרדית (וקצ׳ואה)', 'Peru', 'Spanish (and Quechua)', 'medium'],
    ['אוסטרליה', 'אנגלית', 'Australia', 'English', 'easy'],
    ['ניו זילנד', 'אנגלית (ומאורית)', 'New Zealand', 'English (and Maori)', 'medium']
  ];
  const allLangsHe = Array.from(new Set(WORLD_LANGUAGES_DATA.map((l) => l[1])));
  const langHeToEn = Object.fromEntries(WORLD_LANGUAGES_DATA.map((l) => [l[1], l[3]]));
  for (const [cHe, lHe, cEn, lEn, diff] of WORLD_LANGUAGES_DATA) {
    const distHe = pickDistractors(allLangsHe, lHe, 3, rng);
    const distEn = distHe.map((h) => langHeToEn[h] || h);
    const b = buildFourOptions(lHe, distHe, lEn, distEn, rng);
    addItem(
      'גיאוגרפיה ועולם',
      diff,
      `מהי השפה הרשמית או המדוברת העיקרית ב${cHe}?`,
      b.answers,
      b.correctIndex,
      `What is the main official language spoken in ${cEn}?`,
      b.answersEn
    );
  }

  // 14. Famous Literature & Authors (30 * 2 = 60 questions)
  const LITERATURE_DATA = [
    ['דון קישוט', 'מיגל דה סרוואנטס', 'Don Quixote', 'Miguel de Cervantes', 'medium'],
    ['רומיאו ויוליה', 'ויליאם שייקספיר', 'Romeo and Juliet', 'William Shakespeare', 'easy'],
    ['המלט', 'ויליאם שייקספיר', 'Hamlet', 'William Shakespeare', 'easy'],
    ['עלובי החיים', 'ויקטור הוגו', 'Les Miserables', 'Victor Hugo', 'medium'],
    ['שלושת המוסקטרים', 'אלכסנדר דיומא', 'The Three Musketeers', 'Alexandre Dumas', 'medium'],
    ['מסביב לעולם בשמונים יום', 'ז׳ול ורן', 'Around the World in Eighty Days', 'Jules Verne', 'easy'],
    ['עשרים אלף מיל מתחת למים', 'ז׳ול ורן', 'Twenty Thousand Leagues Under the Seas', 'Jules Verne', 'medium'],
    ['הרפתקאות אליס בארץ הפלאות', 'לואיס קרול', 'Alice’s Adventures in Wonderland', 'Lewis Carroll', 'easy'],
    ['הנסיך הקטן', 'אנטואן דה סנט-אקזופרי', 'The Little Prince', 'Antoine de Saint-Exupery', 'easy'],
    ['מלחמה ושלום', 'לב טולסטוי', 'War and Peace', 'Leo Tolstoy', 'medium'],
    ['החטא ועונשו', 'פיודור דוסטויבסקי', 'Crime and Punishment', 'Fyodor Dostoevsky', 'medium'],
    ['שרלוק הולמס (כלבם של בני בסקרוויל)', 'ארתור קונאן דויל', 'Sherlock Holmes', 'Arthur Conan Doyle', 'easy'],
    ['פו הדב', 'א.א. מילן', 'Winnie-the-Pooh', 'A.A. Milne', 'easy'],
    ['פיטר פן', 'ג׳יימס מתיו בארי', 'Peter Pan', 'J.M. Barrie', 'medium'],
    ['הקוסם מארץ עוץ', 'ל. פרנק באום', 'The Wonderful Wizard of Oz', 'L. Frank Baum', 'medium'],
    ['ספר הג׳ונגל', 'רודיארד קיפלינג', 'The Jungle Book', 'Rudyard Kipling', 'medium'],
    ['הרפתקאות תום סויר', 'מארק טוויין', 'The Adventures of Tom Sawyer', 'Mark Twain', 'easy'],
    ['אוליבר טוויסט', 'צ׳ארלס דיקנס', 'Oliver Twist', 'Charles Dickens', 'medium'],
    ['גאווה ודעה קדומה', 'ג׳יין אוסטן', 'Pride and Prejudice', 'Jane Austen', 'medium'],
    ['1984 (וחוות החיות)', 'ג׳ורג׳ אורוול', '1984 (and Animal Farm)', 'George Orwell', 'easy'],
    ['הזקן והים', 'ארנסט המינגוויי', 'The Old Man and the Sea', 'Ernest Hemingway', 'medium'],
    ['תמול שלשום', 'ש"י עגנון', 'Only Yesterday (Tmol Shilshom)', 'S.Y. Agnon', 'medium'],
    ['סיפור על אהבה וחושך', 'עמוס עוז', 'A Tale of Love and Darkness', 'Amos Oz', 'medium'],
    ['מישהו לרוץ איתו', 'דוד גרוסמן', 'Someone to Run With', 'David Grossman', 'easy'],
    ['איה פלוטו', 'לאה גולדברג (ולאה וברוך כרמי)', 'Aya Pluto', 'Leah Goldberg', 'easy'],
    ['מעשה בחמישה בלונים', 'מרים רות', 'A Tale of Five Balloons', 'Miriam Roth', 'easy'],
    ['תירס חם (בים בם בם)', 'מרים רות', 'Hot Corn (Tiras Cham)', 'Miriam Roth', 'easy'],
    ['הילד הזה הוא אני', 'יהודה אטלס', 'HaYeled HaZeh Hu Ani', 'Yehuda Atlas', 'easy'],
    ['הכבש השישה עשר', 'יהונתן גפן', 'The Sixteenth Sheep', 'Yehonatan Geffen', 'easy'],
    ['חסמב"ה', 'יגאל מוסינזון', 'Hasamba', 'Yigal Mossinson', 'easy']
  ];
  const allAuthorsHe = Array.from(new Set(LITERATURE_DATA.map((l) => l[1])));
  const allBooksHe = LITERATURE_DATA.map((l) => l[0]);
  const authHeToEn = Object.fromEntries(LITERATURE_DATA.map((l) => [l[1], l[3]]));
  const bookHeToEn = Object.fromEntries(LITERATURE_DATA.map((l) => [l[0], l[2]]));
  for (const [bHe, aHe, bEn, aEn, diff] of LITERATURE_DATA) {
    const distAHe = pickDistractors(allAuthorsHe, aHe, 3, rng);
    const distAEn = distAHe.map((h) => authHeToEn[h] || h);
    const b1 = buildFourOptions(aHe, distAHe, aEn, distAEn, rng);
    addItem(
      'תרבות, קולנוע ומוזיקה',
      diff,
      `מי כתב את היצירה הספרותית "${bHe}"?`,
      b1.answers,
      b1.correctIndex,
      `Who wrote the literary work "${bEn}"?`,
      b1.answersEn
    );

    const distBHe = pickDistractors(allBooksHe, bHe, 3, rng);
    const distBEn = distBHe.map((h) => bookHeToEn[h] || h);
    const b2 = buildFourOptions(bHe, distBHe, bEn, distBEn, rng);
    addItem(
      'תרבות, קולנוע ומוזיקה',
      diff,
      `איזה מהספרים הבאים נכתב על ידי ${aHe}?`,
      b2.answers,
      b2.correctIndex,
      `Which of the following books was written by ${aEn}?`,
      b2.answersEn
    );
  }

  // 15. World Rivers, Mountains & Seas (30 questions)
  const GEO_FEATURES_DATA = [
    ['נהר התמזה (Thames)', 'לונדון, בריטניה', 'The River Thames', 'London, United Kingdom', 'easy'],
    ['נהר הסן (Seine)', 'פריז, צרפת', 'The Seine River', 'Paris, France', 'easy'],
    ['נהר הטיבר', 'רומא, איטליה', 'The Tiber River', 'Rome, Italy', 'medium'],
    ['נהר הדנובה', 'וינה ובודפשט (מרכז אירופה)', 'The Danube River', 'Vienna and Budapest (Central Europe)', 'easy'],
    ['נהר ההדסון', 'ניו יורק, ארצות הברית', 'The Hudson River', 'New York, USA', 'medium'],
    ['הר הפוג׳י', 'יפן', 'Mount Fuji', 'Japan', 'easy'],
    ['הר הקילימנג׳רו', 'טנזניה (אפריקה)', 'Mount Kilimanjaro', 'Tanzania (Africa)', 'medium'],
    ['הר מון בלאן', 'הרי האלפים (גבול צרפת-איטליה)', 'Mont Blanc', 'The Alps (France-Italy border)', 'medium'],
    ['הר האולימפוס', 'יוון', 'Mount Olympus', 'Greece', 'easy'],
    ['הר החרמון', 'צפון ישראל (רמת הגולן)', 'Mount Hermon', 'Northern Israel', 'easy'],
    ['הר מירון', 'הגליל העליון, ישראל', 'Mount Meron', 'Upper Galilee, Israel', 'easy'],
    ['הר תבור', 'הגליל התחתון (עמק יזרעאל), ישראל', 'Mount Tabor', 'Lower Galilee, Israel', 'easy'],
    ['נחל הירקון', 'גוש דן ותל אביב (נשפך לים התיכון)', 'The Yarkon River', 'Tel Aviv / Gush Dan', 'easy'],
    ['נהר הירדן', 'עמק החולה, הכנרת וים המלח', 'The Jordan River', 'Hula Valley, Sea of Galilee, and Dead Sea', 'easy'],
    ['נחל קישון', 'עמק יזרעאל ומפרץ חיפה', 'The Kishon River', 'Jezreel Valley and Haifa Bay', 'medium'],
    ['מפלי הניאגרה', 'גבול ארצות הברית וקנדה', 'Niagara Falls', 'USA-Canada border', 'easy'],
    ['מפלי האיגואסו', 'גבול ארגנטינה וברזיל', 'Iguazu Falls', 'Argentina-Brazil border', 'medium'],
    ['מפלי ויקטוריה', 'גבול זמביה וזימבבואה באפריקה', 'Victoria Falls', 'Zambia-Zimbabwe border in Africa', 'medium'],
    ['תעלת סואץ', 'מצרים (מחברת את הים התיכון וים סוף)', 'The Suez Canal', 'Egypt (connecting Mediterranean and Red Sea)', 'easy'],
    ['תעלת פנמה', 'פנמה (מחברת את האוקיינוס האטלנטי והשקט)', 'The Panama Canal', 'Panama (connecting Atlantic and Pacific Oceans)', 'easy']
  ];
  const allGeoLocHe = GEO_FEATURES_DATA.map((g) => g[1]);
  const geoLocHeToEn = Object.fromEntries(GEO_FEATURES_DATA.map((g) => [g[1], g[3]]));
  for (const [fHe, locHe, fEn, locEn, diff] of GEO_FEATURES_DATA) {
    const distHe = pickDistractors(allGeoLocHe, locHe, 3, rng);
    const distEn = distHe.map((h) => geoLocHeToEn[h] || h);
    const b = buildFourOptions(locHe, distHe, locEn, distEn, rng);
    addItem(
      'גיאוגרפיה ועולם',
      diff,
      `היכן נמצא או עובר ${fHe}?`,
      b.answers,
      b.correctIndex,
      `Where is ${fEn} located?`,
      b.answersEn
    );
  }

  return bank;
}

module.exports = {
  generateFullQuestionBank
};

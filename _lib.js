const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const untrim = (s) => (s || '').replace(/\s+/g, ' ').trim();
const hash = (str) => { let h=5381,i=str.length; while(i) h=(h*33)^str.charCodeAt(--i); return (h>>>0).toString(36); };

const ES_PT = 'eéēěè';
const VOWELS_PT = 'ǘǖüǜǚeéēěèaeiouáàâãêíóôõúüāǎēěèīìǐòōǒùūǔAEIOUÁÀÂÃÉÊÍÓÔÕÚÜ';
const TONE1_PT = 'āēīōūǖ';
const TONE2_PT = 'áéíóúǘ';
const TONE3_PT = 'ǎěǐǒǔǚ';
const TONE4_PT = 'àèìòùǜ';
const isLetter = (ch) => /\p{L}/u.test(ch);
const isVowelPT = (ch) => VOWELS_PT.indexOf(ch) !== -1;
const countConsonantsPT = (t)=>{let n=0; for(const c of t||'') if(isLetter(c)&&!isVowelPT(c)) n++; return n;};
const countVowelsPT = (t)=>{let n=0; for(const c of t||'') if(isVowelPT(c)) n++; return n;};

const CLOZE_RX = new RegExp('\\{\\{c\\d+::(.*?)(?:::([^}]*))?\\}\\}', 'g');
const normalizeChoiceText = (s) => (s || '').replace(/\s+/g, ' ').trim();
const norm = (s)=> (s||'').replace(/\s+/g,' ').trim().toLowerCase();


function isChineseCharacter(character) {
  return /[一-龯\u4E00-\u9FFF\u3400-\u4DFF0-9]/.test(character);
}
function isWhiteSpace(character) {
  return /\s/.test(character);
}
function splitDistractors(rawPlain) {
  return (rawPlain || '').split('|').map(s => s.trim()).filter(Boolean);
}
function splitDistractorGroups(rawPlain) {
  // "grupo1 a|b||grupo2 c|d" -> [["a","b"],["c","d"]]
  const parts = (rawPlain || '').split('||').map(p => p.trim());
  const groups = parts.map(p => p.split('|').map(s => s.trim()).filter(Boolean));
  // remove grupos vazios
  return groups.filter(g => g.length > 0);
}

function getTone(syllable) {
  for (const character of syllable) {
    if (TONE1_PT.indexOf(character) != -1) {
      return 1;
    } else if (TONE2_PT.indexOf(character) != -1) {
      return 2;
    } else if (TONE3_PT.indexOf(character) != -1) {
      return 3;
    } else if (TONE4_PT.indexOf(character) != -1) {
      return 4;
    }
  }

  return 5;
}

function makeRuby(pinyin, character) {
  return "<ruby class='tone" + getTone(pinyin) + "'>" + character + "<rp>(</rp><rt>" + pinyin + "</rt><rp>)</rp></ruby>";
}

function addRubyText(pinyins, text) {
  let charIdx = 0;

  let htmlParts = [];

  for (let i = 0; i < text.length; i++) {
    if (isChineseCharacter(text[i]) && charIdx < pinyins.length) {
      htmlParts.push(makeRuby(pinyins[charIdx], text[i]));
      charIdx++;
    } else {
      htmlParts.push(text[i]);
    }
  }

  return {final_pinyin_idx: charIdx, html_parts: htmlParts};
}

function handleCloze(pinyins, sourceHTML, calledOnCloze) {
  // We're expecting input that has only one cloze.
  // This means that bits here should be ["stuff before the cloze", "cloze contents", "hint", "stuff after the cloze"]
  let bits = sourceHTML.split(CLOZE_RX);

  if (bits.length != 4) {
    return "Bad Cloze, should have only one cloze";
  }

  const start = bits[0];
  const ans = bits[1];
  const hint = bits[2];
  const end = bits[3];

  let htmlParts = [];

  let charIdx = 0;

  const startRubyText = addRubyText(pinyins, start);
  charIdx = startRubyText.final_pinyin_idx;
  for (rubyHtmlPart of startRubyText.html_parts) {
    htmlParts.push(rubyHtmlPart);
  }

  const startPinyinIdx = charIdx;

  for (let i = 0; i < ans.length; i++) {
    if (isChineseCharacter(ans[i]) && charIdx < pinyins.length) {
      // We're not going to ruby the answer, but we still want to increment the charIdx.
      charIdx++;
    }
  }

  htmlParts.push(calledOnCloze(pinyins.slice(startPinyinIdx, charIdx), ans, hint));
  
  for (rubyHtmlPart of addRubyText(pinyins.slice(charIdx), end).html_parts) {
    htmlParts.push(rubyHtmlPart);
  }
  
  const html = htmlParts.join("");

  return html;
}

function parseClozes(pinyins, sourceHTML) {
  const blanks = [];
  const html = handleCloze(pinyins, sourceHTML, (clozePinyins, ans, hint) => {
    const ans_idx = 0;
    const a = untrim(ans);
    const rubiedAnswer = addRubyText(clozePinyins, ans).html_parts.join("");
    blanks.push({ idx: ans_idx, rubied_answer: rubiedAnswer, answer: a, hint: untrim(hint || '') });
    return `<span class="blank" data-idx="${ans_idx}" data-answer="${esc(a)}" data-filled="0"></span>`;
  });

  return {html, blanks};
}

function parseSimplePinyin(pinyinText) {
  /** Assumes the provided txt is:
        * non-empty
        * has no spaces
        * has no apostrophes
        * has no punctuation
        * is all lowercase.
    */
  if (pinyinText == "") {
    return [];
  }

  let consonantGroups = []
  let vowelGroups = []
  let currentStart = 0;
  if (isVowelPT(pinyinText[0])) {
    consonantGroups.push("");
  }
  for (let i = 0; i < pinyinText.length; i++) {
    let currChar = pinyinText[i];

    let endOfGroup = (i == pinyinText.length - 1 || isVowelPT(currChar) != isVowelPT(pinyinText[i + 1]));

    if (!endOfGroup) {
      // Nothing to do.
      continue;
    }

    // They don't match.  Add to either consonantGroups or vowelGroups as appropriate.
    const currGroup = pinyinText.slice(currentStart, i + 1);
    if (isVowelPT(currChar)) {
      vowelGroups.push(currGroup);
    } else {
      consonantGroups.push(currGroup);
    }

    currentStart = i + 1;
  }

  if (isVowelPT(pinyinText[pinyinText.length - 1])) {
    consonantGroups.push("");
  }

  // Now we should have a consonantGroups which s 1 longer than vowelGroups.
  if (consonantGroups.length != vowelGroups.length + 1) {
    throw new Error("Yikes, consonants: " + consonantGroups + "\nvowels: " + vowelGroups);
  }

  // We know that every pinyin necessarily contains a vowel (because we have ruled out syllabic rs), so we're going to
  // go through vowelGroups and shunt consonants from consonantGroups to the appropriate vowelGroup as appropriate.
  let pinyins = [];
  let prevFloatingConsonants = consonantGroups[0];
  for (let i = 0; i < vowelGroups.length; i++) {
    let endConsonants = "";
    let newFloatingConsonants = consonantGroups[i + 1];
    let vowels = vowelGroups[i];
    if (i == vowelGroups.length - 1) {
      if (newFloatingConsonants.endsWith("r")) {
        // The only valid pinyin syllable ending in r is "er" (with varying tones).  If that is not what we have here, 
        // then we need to handle a syllabic final r.
        const expectedSyllable = prevFloatingConsonants + vowels + newFloatingConsonants;
        if (expectedSyllable.length == 2
          && ES_PT.indexOf(expectedSyllable[0]).indexOf != -1
          && expectedSyllable[1] == "r") {
          endConsonants = "r";
          newFloatingConsonants = "";
        } else {
          endConsonants = newFloatingConsonants.slice(0, newFloatingConsonants.length - 1);
          newFloatingConsonants = "r";
        }
      } else {
        // If we're the last syllable, those consonants are obviously ours.
        endConsonants = newFloatingConsonants;
        newFloatingConsonants = "";
      }
    } else if (newFloatingConsonants == "n") {
      // We pass.
    } else if (newFloatingConsonants == "ng") {
      // We take the n but pass the g.
      endConsonants = "n";
      newFloatingConsonants = "g";
    } else if (newFloatingConsonants.startsWith("r") && newFloatingConsonants != "r") {
      // There are no viable starts consonant clusters that start with r, so it's ours.
      endConsonants = "r";
      newFloatingConsonants = newFloatingConsonants.slice(1);
    } else if (newFloatingConsonants.startsWith("ng")) {
      // There are no viable starts consonant clusters that start with ng, so it's ours.
      endConsonants = "ng";
      newFloatingConsonants = newFloatingConsonants.slice(2);
    } else if (newFloatingConsonants.startsWith("n")) {
      // There are no viable starts consonant clusters that start with n, it's ours.
      endConsonants = "n";
      newFloatingConsonants = newFloatingConsonants.slice(1);
    }

    pinyins.push(prevFloatingConsonants + vowels + endConsonants);
    prevFloatingConsonants = newFloatingConsonants;
  }

  if (prevFloatingConsonants.length > 0) {
    if (prevFloatingConsonants != "r") 
      throw new Error("Found a syllabic consonant other than r: " + prevFloatingConsonants);
    // We found a syllabic r.
    pinyins.push("r");
  }

  return pinyins;
}

function parsePinyin(ogPinyinText) {
  // Our goal here is to take something like "wo de pengyou" and turn it into ["wo", "de", "peng", "you"].
  const pinyins = [];

  // Handle Sandhi notes in the pinyin.
  const sandhiIndex = ogPinyinText.search("Sandhi");
  if (sandhiIndex != -1) {
    ogPinyinText = ogPinyinText.slice(0, sandhiIndex);
  }

  ogPinyinText = ogPinyinText.replace(/[!.,?()]/, "");
  ogPinyinText = ogPinyinText.toLowerCase();

  for (const firstSplit of ogPinyinText.split(" ")) {
    for (const secondSplit of firstSplit.split("'")) {
      for (const pinyin of parseSimplePinyin(secondSplit)) {
        pinyins.push(pinyin);
      }
    }
  }

  return pinyins;
}

function makeRubyTextForDistractor(ogTextContent) {
  // Should be of the form word[pinyin] or just word.
  const found = /(.*)\[(.*)\]/g.exec(ogTextContent);
  
  if (found == null || found.length < 3) {
    return ogTextContent;
  }

  const baseText = found[1];
  const pinyin = found[2];

  return addRubyText(parsePinyin(pinyin), baseText).html_parts.join("");
}

function shuffle(a0){
  const a=a0.slice(); 
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1)); 
    [a[i],a[j]]=[a[j],a[i]];
  } 
  return a;
}

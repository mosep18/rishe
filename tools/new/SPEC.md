# Format: one JSON object per line (JSONL), one word family per line
{"base":"decide","root":"Latin decidere 'to cut off, decide'","pos":"verb","fa":"تصمیم گرفتن؛ تصمیم‌گیری کردن","cefr":"A2","topic":"Thinking / Decisions","pattern":"suffixation + prefixation","ex":"We need to decide before Friday.","exFa":"باید پیش از جمعه تصمیم بگیریم.","words":[["decide","v","تصمیم گرفتن"],["decision","n","تصمیم"],["decisive","adj","قاطع؛ تعیین‌کننده"],["decisively","adv","قاطعانه"],["undecided","adj","مردد؛ بلاتکلیف"]]}
Rules:
- "words" = [english word, POS (v, n, adj, adv, or v/n etc.), natural Persian meaning]. First entry is the base word. 7-12 words per family, ALL genuinely related by derivation/compounding from the same root and real, common English words.
- Persian: natural modern Persian, correct half-spaces (ZWNJ ‌ e.g. «می‌کند»), several senses separated by «؛», short. No transliteration. Be accurate; if unsure of a word, leave the word out.
- cefr one of A1 A2 B1 B2 C1. root = etymology string. pattern = e.g. "prefixation + suffixation".
- ex/exFa: one natural example sentence of the BASE word and its Persian translation.
- Words must be lowercase, single words (hyphenated ok), no proper nouns, no inflections (-s,-ed,-ing) unless the -ing/-ed form is a distinct adjective/noun.
- Do NOT use any word listed in existing_words.txt, and don't repeat a word across your own families.
- Valid JSON per line, UTF-8, no trailing commas, no blank lines, no commentary.

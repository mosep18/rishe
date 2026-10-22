# Rishe dictionary data – authoring brief

You are writing dictionary data for an English→Persian (Farsi) learner dictionary. Accuracy matters more than volume:
only include real, common English words, with natural, correct modern Persian meanings. If you are unsure of a Persian
rendering, leave that word out.

Do NOT use any word listed in /home/claude/rishe/tools/new/existing_words.txt, and don't reuse a family base listed in
existing_bases.txt. Don't repeat a word inside your own files. Words lowercase, single words (hyphenated ok), no proper nouns,
no plain inflections (-s, -ed, -ing) unless the form is a distinct adjective/noun (e.g. "interesting", "tired").

Persian style: modern standard Persian, correct half-spaces (ZWNJ, e.g. «می‌کند», «بازی‌گوش»), 1-3 short senses separated by «؛».
No transliteration, no English inside the Persian. Match the part of speech (verbs as infinitive-like «تصمیم گرفتن»).

## FAMILY files (format, UTF-8, one item per line, no blank lines needed)
#base|etymology|part of speech of base|Persian meaning of base|CEFR(A1..B2)|topic
~English example sentence using the base|Persian translation of that sentence
word|pos|Persian meaning        <- first entry must be the base word itself; then 6-11 derived/related words
Example:
#agree|Latin gratus|verb|موافق بودن؛ توافق کردن|A2|Communication
~I agree with you completely.|کاملاً با شما موافقم.
agree|v|موافق بودن
agreement|n|توافق؛ قرارداد
disagree|v|مخالف بودن
pos values: v, n, adj, adv, prep, conj, or v/n etc. Etymology: short and only what you are confident about
(e.g. "Old English wyrcan", "Latin credere 'to believe'", "Greek graphein 'to write'"); if unsure write just "Latin" / "Old English" / "French".
Every member must be genuinely derived from or compounded with the base/root (prefix, suffix, conversion, compound).

## SOLO files (words with NO word family). Format, one per line:
word|pos|Persian meaning|CEFR|topic
Example: umbrella|n|چتر|A2|Weather
CEFR A1..B2. Only high-utility words that are not part of an obvious derivational family (or whose family isn't needed).
Single entries; no families. Vary topics; avoid obscure words.

Write ONLY the data file(s) you are asked to, nothing else. Verify at the end: run
python3 -I - <<'X'  to check no line violates the format (family lines have 3 fields, solo lines 5, headers 6) and no word from existing_words.txt is used.

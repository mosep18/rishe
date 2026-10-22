# Data tools

`build_data.py` builds `../data.json` from:
1. the curated Excel workbook (49 families / 413 words), and
2. optional plain-text batches in `new_words/*.txt` (draft families, see format below).

    python3 tools/build_data.py English_Word_Families_Database_Persian_Starter.xlsx data.json tools/new_words

## Batch file format
    #base|etymology|part of speech|Persian meaning|CEFR|topic     <- starts a family
    ~English example sentence|Persian translation of the example
    word|pos (v/n/adj/adv/prep)|Persian meaning                    <- one line per member

Families from batch files are marked `draft` in the app (Persian written by an AI assistant, not yet
reviewed by a native-speaking lexicographer). Prefixes/suffixes are detected automatically.
Words that already exist earlier in the data, or that appear in the DROP list inside the script, are skipped.

## Stand-alone words (no word family)
`solo_words/*.txt`, one per line:  `word|pos|Persian meaning|CEFR|topic`

    python3 tools/build_data.py tools/source/starter.xlsx data.json tools/new_words tools/solo_words

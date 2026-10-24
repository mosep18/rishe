#!/usr/bin/env python3
"""Validate Rishe's generated JSON and emit repeatable JSON/Markdown reports.

Structural checks are deterministic. Linguistic/etymological correctness requires human review.
"""
from __future__ import annotations
import argparse
import collections
import difflib
import json
import re
import sys
from pathlib import Path

VALID_CEFR = {"A1", "A2", "B1", "B2", "C1"}
VALID_REVIEW = {"draft", "source-curated", "reviewed", "needs-review"}
POS_ALIASES = {
    "v", "verb", "n", "noun", "adj", "adjective", "adv", "adverb", "prep", "preposition",
    "conj", "conjunction", "pron", "pronoun", "det", "determiner", "interj", "interjection",
    "aux", "auxiliary verb", "modal", "modal verb", "phrase", "phrasal verb", "idiom", "number",
    "article", "participle", "gerund", "infinitive", "proper noun", "abbreviation", "symbol"
}


def norm(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().casefold())


def split_pos(value: object) -> list[str]:
    return [p.strip().casefold() for p in re.split(r"[/,;]|\s+or\s+", str(value or "")) if p.strip()]


def source_audit(root: Path) -> dict:
    family_rows: list[tuple[str, str]] = []
    solo_rows: list[tuple[str, str]] = []
    source_errors: list[str] = []
    for path in sorted((root / "tools" / "new_words").glob("*.txt")):
        current_family = ""
        for line_no, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            line = raw.strip()
            if not line or line.startswith("~"):
                continue
            if line.startswith("#"):
                fields = line[1:].split("|")
                current_family = fields[0].strip() if fields else ""
                continue
            parts = line.split("|")
            if len(parts) < 3:
                source_errors.append(f"{path}:{line_no}: malformed family-member row")
                continue
            family_rows.append((parts[0].strip(), f"{path.relative_to(root)}:{line_no}"))
    for path in sorted((root / "tools" / "solo_words").glob("*.txt")):
        for line_no, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("|")
            if len(parts) < 3:
                source_errors.append(f"{path}:{line_no}: malformed solo-word row")
                continue
            solo_rows.append((parts[0].strip(), f"{path.relative_to(root)}:{line_no}"))
    family_counts = collections.Counter(norm(w) for w, _ in family_rows)
    solo_counts = collections.Counter(norm(w) for w, _ in solo_rows)
    all_rows = collections.defaultdict(list)
    for word, where in family_rows + solo_rows:
        all_rows[norm(word)].append(where)
    duplicates = {word: locations for word, locations in all_rows.items() if len(locations) > 1}
    cross_source = sorted(word for word in set(family_counts) & set(solo_counts))
    return {
        "family_source_rows": len(family_rows),
        "solo_source_rows": len(solo_rows),
        "duplicate_source_forms": len(duplicates),
        "duplicate_source_row_excess": sum(len(v) - 1 for v in duplicates.values()),
        "family_solo_overlap_forms": len(cross_source),
        "family_solo_overlap_examples": cross_source[:100],
        "source_format_errors": source_errors,
        "duplicate_source_examples": {k: v[:6] for k, v in list(sorted(duplicates.items()))[:100]},
    }


def validate(path: Path, root: Path) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    try:
        input_label = path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        input_label = path.name
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"input": input_label, "errors": [f"Invalid JSON: {exc}"], "warnings": [], "structural_errors": 1}

    if not isinstance(data, dict):
        return {"input": str(path), "errors": ["Top-level JSON value must be an object."], "warnings": [], "structural_errors": 1}
    for key in ("families", "words", "affixes"):
        if key not in data:
            errors.append(f"Missing required top-level key: {key}")
        elif not isinstance(data[key], list):
            errors.append(f"Top-level key {key!r} must be an array")
    if errors:
        return {"input": str(path), "errors": errors, "warnings": warnings, "structural_errors": len(errors)}

    families, words, affixes = data["families"], data["words"], data["affixes"]
    family_by_id: dict[object, dict] = {}
    duplicate_family_ids = collections.Counter()
    word_forms = collections.Counter()
    base_forms = collections.defaultdict(list)
    family_links = collections.Counter()
    membership_counts: list[int] = []
    topic_counts = collections.Counter()
    family_cefr = collections.Counter()
    word_cefr = collections.Counter()
    family_review = collections.Counter()
    word_review = collections.Counter()
    draft_family_ids: set[object] = set()
    solo_family_ids: set[object] = set()

    for i, family in enumerate(families):
        if not isinstance(family, dict):
            errors.append(f"families[{i}] is not an object")
            continue
        fid = family.get("id")
        duplicate_family_ids[fid] += 1
        if fid is None:
            errors.append(f"families[{i}] is missing id")
        elif fid not in family_by_id:
            family_by_id[fid] = family
        for field in ("base", "fa", "pos", "words"):
            if field not in family or family[field] is None or family[field] == "" or family[field] == []:
                errors.append(f"families[{i}] missing required field {field!r}")
        base = norm(family.get("base"))
        if base:
            base_forms[base].append(family)
        if family.get("cefr") not in (None, "") and family.get("cefr") not in VALID_CEFR:
            errors.append(f"family {fid!r} has unsupported CEFR level {family.get('cefr')!r}")
        if family.get("cefr") in VALID_CEFR:
            family_cefr[family["cefr"]] += 1
        if family.get("topic"):
            topic_counts[str(family["topic"])] += 1
        status = family.get("review_status", "draft" if family.get("draft") else "legacy-unspecified")
        family_review[status] += 1
        if status not in VALID_REVIEW and status != "legacy-unspecified":
            warnings.append(f"family {fid!r} has unknown review_status {status!r}")
        if family.get("draft") or status == "draft":
            draft_family_ids.add(fid)
        if family.get("solo"):
            solo_family_ids.add(fid)
        members = family.get("words") if isinstance(family.get("words"), list) else []
        membership_counts.append(len(members))
        seen_in_family = set()
        for wi in members:
            if not isinstance(wi, int) or wi < 0 or wi >= len(words):
                errors.append(f"family {fid!r} contains invalid word index {wi!r}")
                continue
            if wi in seen_in_family:
                errors.append(f"family {fid!r} contains duplicate word index {wi}")
            seen_in_family.add(wi)
            family_links[wi] += 1

    for fid, count in duplicate_family_ids.items():
        if count > 1:
            errors.append(f"duplicate family id {fid!r} appears {count} times")

    for i, word in enumerate(words):
        if not isinstance(word, dict):
            errors.append(f"words[{i}] is not an object")
            continue
        for field in ("w", "f", "pos", "fa"):
            if field not in word or word[field] is None or word[field] == "":
                errors.append(f"words[{i}] missing required field {field!r}")
        if word.get("f") not in family_by_id:
            errors.append(f"word index {i} ({word.get('w')!r}) references missing family id {word.get('f')!r}")
        else:
            fam = family_by_id[word["f"]]
            if i not in (fam.get("words") or []):
                errors.append(f"word index {i} ({word.get('w')!r}) is absent from its family's word indexes")
            if bool(fam.get("draft")) and word.get("review_status") == "reviewed":
                warnings.append(f"word {word.get('w')!r} marked reviewed under a draft family")
        form = norm(word.get("w"))
        if form:
            word_forms[form] += 1
        if word.get("cefr") not in (None, "") and word.get("cefr") not in VALID_CEFR:
            errors.append(f"word {word.get('w')!r} has unsupported CEFR level {word.get('cefr')!r}")
        if word.get("cefr") in VALID_CEFR:
            word_cefr[word["cefr"]] += 1
        pos_list = split_pos(word.get("pos"))
        for pos in pos_list:
            if pos not in POS_ALIASES:
                warnings.append(f"word {word.get('w')!r} uses unrecognized part of speech {pos!r}")
        status = word.get("review_status", "draft" if word.get("f") in draft_family_ids else "legacy-unspecified")
        word_review[status] += 1
        if status not in VALID_REVIEW and status != "legacy-unspecified":
            warnings.append(f"word {word.get('w')!r} has unknown review_status {status!r}")
        if not word.get("fa") or not str(word.get("fa")).strip():
            warnings.append(f"word {word.get('w')!r} has empty Persian meaning")

    for wi, word in enumerate(words):
        if family_links[wi] != 1:
            errors.append(f"word index {wi} ({word.get('w')!r}) appears in {family_links[wi]} family word lists; expected exactly 1")

    # Duplicate English forms are warnings: polysemy and different POS can be legitimate.
    duplicate_forms = {w: n for w, n in word_forms.items() if n > 1}
    for word, count in sorted(duplicate_forms.items()):
        warnings.append(f"duplicate English form {word!r}: {count} records; editorial decision required")
    duplicate_bases = {base: items for base, items in base_forms.items() if len(items) > 1}
    for base, items in sorted(duplicate_bases.items()):
        warnings.append(f"duplicate family base {base!r}: family IDs {[f.get('id') for f in items]}")
    for i, f1 in enumerate(families):
        if not isinstance(f1, dict) or f1.get("solo"):
            continue
        b1 = norm(f1.get("base"))
        if len(b1) < 5:
            continue
        for f2 in families[i + 1:]:
            if not isinstance(f2, dict) or f2.get("solo"):
                continue
            b2 = norm(f2.get("base"))
            if len(b2) < 5 or b1 == b2:
                continue
            if min(len(b1), len(b2)) >= 6 and difflib.SequenceMatcher(None, b1, b2).ratio() >= 0.93:
                warnings.append(f"similar family bases {f1.get('base')!r} (ID {f1.get('id')}) and {f2.get('base')!r} (ID {f2.get('id')}); inspect for duplication")

    family_candidates = [f for f in families if isinstance(f, dict) and not f.get("solo")]
    reviewed_families = [f for f in family_candidates if f.get("review_status") == "reviewed"]
    family_member_links = sum(len(f.get("words") or []) for f in family_candidates)
    standalone_families = [f for f in families if isinstance(f, dict) and f.get("solo")]
    missing_family_examples = [f for f in family_candidates if not f.get("ex") or not f.get("exFa")]
    unusually_small = [f for f in family_candidates if len(f.get("words") or []) < 3]
    unusually_large = [f for f in family_candidates if len(f.get("words") or []) > 25]
    missing_word_cefr = [w for w in words if isinstance(w, dict) and not w.get("cefr")]
    missing_family_cefr = [f for f in families if isinstance(f, dict) and not f.get("cefr")]
    missing_root = [f for f in family_candidates if not f.get("root")]
    draft_families = [f for f in families if isinstance(f, dict) and (f.get("draft") or f.get("review_status") == "draft")]
    reviewed_words = [w for w in words if isinstance(w, dict) and w.get("review_status") == "reviewed"]
    draft_words = [w for w in words if isinstance(w, dict) and (w.get("review_status") == "draft" or w.get("f") in {f.get("id") for f in draft_families})]
    draft_unique_forms = len({norm(w.get("w")) for w in draft_words if w.get("w")})

    # Arabic/Persian character normalization warnings are informational, not destructive edits.
    arabic_chars = [(i, w.get("w")) for i, w in enumerate(words) if isinstance(w, dict) and any(c in str(w.get("fa", "")) for c in "يك")]
    if arabic_chars:
        warnings.append(f"{len(arabic_chars)} word meanings contain Arabic ي/ك; consider normalizing to Persian ی/ک")
    for f in unusually_small[:100]:
        warnings.append(f"family {f.get('base')!r} has only {len(f.get('words') or [])} member(s)")
    for f in unusually_large[:100]:
        warnings.append(f"family {f.get('base')!r} has {len(f.get('words') or [])} members; inspect grouping")
    for f in missing_family_examples[:100]:
        warnings.append(f"family {f.get('base')!r} has no complete EN/FA example pair")

    source = source_audit(root)
    for source_error in source["source_format_errors"]:
        errors.append(source_error)
    if source["family_solo_overlap_forms"]:
        warnings.append(f"{source['family_solo_overlap_forms']} forms appear in both family and standalone source batches")

    duplicate_excess = sum(n - 1 for n in word_forms.values() if n > 1)
    result = {
        "input": input_label,
        "generated_at": "deterministic-content-report; timestamp intentionally omitted for reproducible diffs",
        "counts": {
            "family_records_including_standalone": len(families),
            "non_solo_family_candidates": len(family_candidates),
            "reviewed_genuine_derivational_families": len(reviewed_families),
            "standalone_words": len(standalone_families),
            "word_records": len(words),
            "unique_lexical_forms_case_insensitive": len(word_forms),
            "duplicate_word_records_excess": duplicate_excess,
            "family_member_links_non_solo": family_member_links,
            "standalone_word_records": sum(1 for w in words if isinstance(w, dict) and w.get("f") in solo_family_ids),
            "standalone_single_token_records": sum(1 for f in standalone_families if not re.search(r"\s", str(f.get("base", "").strip()))),
            "standalone_multiword_term_records": sum(1 for f in standalone_families if re.search(r"\s", str(f.get("base", "").strip()))),
            "unique_standalone_single_token_forms": len({norm(f.get("base")) for f in standalone_families if f.get("base") and not re.search(r"\s", str(f.get("base", "").strip()))}),
            "affixes": len(affixes),
            "draft_families": len(draft_families),
            "draft_word_records": len(draft_words),
            "draft_unique_lexical_forms": draft_unique_forms,
            "reviewed_family_records": sum(1 for f in families if isinstance(f, dict) and f.get("review_status") == "reviewed"),
            "reviewed_word_records": len(reviewed_words),
            "source_curated_families": sum(1 for f in families if isinstance(f, dict) and f.get("review_status") == "source-curated" and not f.get("solo")),
            "source_curated_word_records": sum(1 for w in words if isinstance(w, dict) and w.get("review_status") == "source-curated"),
            "families_missing_example_pair": len(missing_family_examples),
            "families_with_no_etymology_text": len(missing_root),
            "families_with_fewer_than_3_members": len(unusually_small),
            "families_with_more_than_25_members": len(unusually_large),
            "word_records_missing_cefr": len(missing_word_cefr),
            "family_records_missing_cefr": len(missing_family_cefr),
        },
        "distributions": {
            "families_by_cefr_including_solo": dict(sorted(family_cefr.items())),
            "words_by_cefr": dict(sorted(word_cefr.items())),
            "family_records_by_review_status": dict(sorted(family_review.items())),
            "word_records_by_review_status": dict(sorted(word_review.items())),
            "families_by_topic": dict(sorted(topic_counts.items(), key=lambda x: (-x[1], x[0]))),
        },
        "source_audit": source,
        "errors": errors,
        "warnings": warnings,
        "structural_errors": len(errors),
        "release_blocked": bool(errors),
        "limitations": [
            "The validator checks structure, references, duplicate forms, and metadata; it cannot prove semantic or etymological correctness.",
            "Only records explicitly marked review_status='reviewed' count as editorially reviewed. 'source-curated' is not equivalent to independently verified.",
            "A non-solo record is a family candidate, not proof that every relationship in that family is linguistically genuine.",
            "Duplicate English forms may represent polysemy or distinct parts of speech and are reported for editorial decisions rather than automatically deleted.",
        ],
    }
    return result


def write_reports(result: dict, report_dir: Path) -> tuple[Path, Path]:
    report_dir.mkdir(parents=True, exist_ok=True)
    json_path = report_dir / "validation_report.json"
    md_path = report_dir / "validation_report.md"
    json_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    c, d = result.get("counts", {}), result.get("distributions", {})
    lines = [
        "# Rishe database validation report", "",
        f"Input: `{result.get('input', '')}`", "",
        f"**Structural status:** {'BLOCKED — structural errors found' if result.get('release_blocked') else 'No blocking structural errors'}", "",
        "## Counts", "",
        "| Metric | Count |", "|---|---:|",
    ]
    for label, key in [
        ("Family records (including standalone)", "family_records_including_standalone"),
        ("Non-standalone family candidates", "non_solo_family_candidates"),
        ("Reviewed genuine derivational families", "reviewed_genuine_derivational_families"),
        ("Standalone records (includes multiword lexical terms)", "standalone_words"),
        ("Standalone single-token entries", "standalone_single_token_records"),
        ("Standalone multiword terms", "standalone_multiword_term_records"),
        ("Unique standalone single-token forms", "unique_standalone_single_token_forms"),
        ("Word records", "word_records"),
        ("Unique lexical forms (case-insensitive)", "unique_lexical_forms_case_insensitive"),
        ("Duplicate word-record excess", "duplicate_word_records_excess"),
        ("Family-member links (non-standalone families)", "family_member_links_non_solo"),
        ("Draft family records", "draft_families"),
        ("Draft word records", "draft_word_records"),
        ("Explicitly reviewed family records", "reviewed_family_records"),
        ("Explicitly reviewed word records", "reviewed_word_records"),
        ("Source-curated family records (not independently verified)", "source_curated_families"),
        ("Affixes", "affixes"),
        ("Families missing example pair", "families_missing_example_pair"),
        ("Word records missing CEFR", "word_records_missing_cefr"),
        ("Family records missing CEFR", "family_records_missing_cefr"),
    ]:
        lines.append(f"| {label} | {c.get(key, 0)} |")
    lines += ["", "## CEFR distribution", "", "### Family records", "", "| Level | Count |", "|---|---:|"]
    for k, v in d.get("families_by_cefr_including_solo", {}).items(): lines.append(f"| {k} | {v} |")
    lines += ["", "### Word records", "", "| Level | Count |", "|---|---:|"]
    for k, v in d.get("words_by_cefr", {}).items(): lines.append(f"| {k} | {v} |")
    lines += ["", "## Topical distribution", "", "| Topic | Family records |", "|---|---:|"]
    for k, v in list(d.get("families_by_topic", {}).items())[:50]: lines.append(f"| {k.replace('|', '\\|')} | {v} |")
    src = result.get("source_audit", {})
    lines += ["", "## Source audit", "", f"- Family-source rows: {src.get('family_source_rows', 0)}", f"- Standalone-source rows: {src.get('solo_source_rows', 0)}", f"- Duplicate forms across source files: {src.get('duplicate_source_forms', 0)}", f"- Family/standalone source overlap: {src.get('family_solo_overlap_forms', 0)}", "", "## Structural errors", ""]
    lines += [f"- {x}" for x in result.get("errors", [])] or ["- None"]
    lines += ["", "## Editorial warnings", ""]
    lines += [f"- {x}" for x in result.get("warnings", [])[:500]] or ["- None"]
    if len(result.get("warnings", [])) > 500: lines.append(f"- {len(result['warnings']) - 500} additional warnings are available in the JSON report.")
    lines += ["", "## Limitations", ""]
    lines += [f"- {x}" for x in result.get("limitations", [])]
    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return json_path, md_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data", nargs="?", default="data.json", help="generated data file (default: data.json)")
    parser.add_argument("--project-root", default=None, help="project root containing tools/ (default: parent of this script)")
    parser.add_argument("--report-dir", default="tools/reports", help="directory for JSON and Markdown reports")
    args = parser.parse_args()
    script_root = Path(__file__).resolve().parent.parent
    root = Path(args.project_root).resolve() if args.project_root else script_root
    data_path = Path(args.data)
    if not data_path.is_absolute(): data_path = root / data_path
    report_dir = Path(args.report_dir)
    if not report_dir.is_absolute(): report_dir = root / report_dir
    result = validate(data_path, root)
    jp, mp = write_reports(result, report_dir)
    print(f"Validation report: {mp}")
    print(f"JSON report: {jp}")
    print(f"Counts: {json.dumps(result.get('counts', {}), ensure_ascii=False, sort_keys=True)}")
    print(f"Structural errors: {result.get('structural_errors', 0)}; warnings: {len(result.get('warnings', []))}")
    return 1 if result.get("release_blocked") else 0

if __name__ == "__main__":
    raise SystemExit(main())

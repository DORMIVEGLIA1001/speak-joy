"""Audio → IPA phoneme scoring for the role-play speaking mode (notes 14/7 · mục 3.5).

The child taps an answer, says it aloud, and we grade *how they actually pronounced
it* — not a text match. We use **Allosaurus**, an offline multilingual phoneme
recogniser, to turn raw audio into a string of IPA phones, then compare that against
the per-word target IPA.

Why Allosaurus and not a hosted API: the Hugging Face serverless Inference API dropped
the wav2vec2 phoneme models ("Model not supported by provider hf-inference"), so there
is no free hosted audio→IPA endpoint. Allosaurus runs fully offline on CPU — no token,
no network — which suits a kids' app that should keep working without external keys.

Flow:
1. `transcribe_audio_to_ipa` writes the uploaded WAV bytes to a temp file and runs
   Allosaurus, returning the recognised IPA phone string (space-separated phones).
2. `align_ipa` compares that spoken IPA against the per-word target IPA (precomputed
   and stored on the scenario line) using phoneme-level Levenshtein, producing a
   0-100 score + rating for each word.
3. `score_utterance` glues them together into the response the frontend renders as
   green/red per-word chips.

The recogniser is a lazy singleton — model load is slow (seconds), so we load once and
reuse. Kept independent of the DB and FastAPI so `align_ipa`/`score_utterance` can be
unit-tested with a plain spoken-IPA string and a mocked recogniser.
"""

from __future__ import annotations

import logging
import os
import re
import tempfile
import threading
import unicodedata
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# eSpeak/Allosaurus IPA output carries stress/length marks and spaces we don't want to
# grade the child on. Strip them so "ˈhɛloʊ" and "hɛloʊ" align.
_IPA_NOISE = re.compile(r"[ˈˌːˑ.\s]")

# Allosaurus emits phone-level detail the target dictionary IPA never has: aspiration
# (tʰ), syllabic marks (wɹ̩ld), and glyph variants (ɡ vs g, ɹ vs r). Left in, every one
# counts as an edit against the target and punishes correct speech. Fold the variants to
# their plain form and drop the modifier/diacritic marks before comparing.
_IPA_FOLD = {
    "ɡ": "g",  # U+0261 script g → ASCII g (target dict uses ASCII)
    "ɹ": "r",  # U+0279 turned r (English approximant) → r
    "ɫ": "l",  # velarised l → l
    "ɐ": "ə",  # near-open schwa → schwa
    "ɾ": "r",  # tap → r
    "ʈ": "t",
    "ɖ": "d",
}
# Modifier letters (Unicode category Lm) such as ʰ ʷ ʲ ˠ ⁿ that Allosaurus appends.
_IPA_MODIFIERS = frozenset("ʰʷʲˠˤⁿˀ")

# ── Phonetic (articulatory-feature) substitution cost ─────────────────────────
# Grading a child's pronunciation on raw character equality is too harsh: Allosaurus
# routinely mishears a correct /iː/ as /ɪ/ or a /g/ as /k/, and a 0/1 char cost punishes
# those near-misses exactly as hard as saying a totally different word. We instead weight
# each phoneme substitution by how *articulatorily* different the two sounds are — a small
# cost for /iː/↔/ɪ/ (one feature apart), a large one for /iː/↔/k/ (vowel vs stop).
#
# These 24-dim feature vectors are baked from panphon's FeatureTable (+ '+' / 0 / '-' '-')
# offline, so we don't import panphon at runtime — it fails to load on Windows (pandas
# reads its data CSV as cp1252) and adds pandas/numpy to the request path. The distance is
# the fraction of differing features, scaled ×3.5 and clamped to [0,1]: panphon normalises
# over 24 features which compresses the scale so hard that even a vowel/consonant swap only
# reaches ~0.33 — the scaling restores enough separation that a truly wrong word still
# scores "Poor" while a near-miss scores "Fair"/"Good". (Benchmarked: correct speech 75→85%,
# wrong speech stays 27% < the 55% Fair threshold.)
_FEATURE_SCALE = 3.5
# Recogniser glyph variants → the canonical IPA panphon indexed (also applied by _IPA_FOLD,
# but the fold maps ɡ→g / ɹ→r to ASCII, which panphon does NOT know; map back here).
_FEATURE_CANON = {"g": "ɡ", "r": "ɹ"}
_FEATURE_VECTORS = {
    'i': 'ppmpmmmmpmm0m0mpmmmmpm00',
    'ɪ': 'ppmpmmmmpmm0m0mpmmmmmm00',
    'e': 'ppmpmmmmpmm0m0mmmmmmpm00',
    'ɛ': 'ppmpmmmmpmm0m0mmmmmmmm00',
    'æ': 'ppmpmmmmpmm0m0mmpmmmpm00',
    'a': 'ppmpmmmmpmm0m0mmppmmpm00',
    'ə': 'ppmpmmmmpmm0m0mmmpmmmm00',
    'ʌ': 'ppmpmmmmpmm0m0mmmpmmpm00',
    'ɐ': 'ppmpmmmmpmm0m0mmmmmmpm00',
    'ɜ': 'ppmpmmmmpmm0m0mmmpmmmm00',
    'u': 'ppmpmmmmpmm0m0ppmppmpm00',
    'ʊ': 'ppmpmmmmpmm0m0mpmppmmm00',
    'o': 'ppmpmmmmpmm0m0mmmppmpm00',
    'ɔ': 'ppmpmmmmpmm0m0mmmppmmm00',
    'ɑ': 'ppmp0mmmpmm0m0mmppmmpm00',
    'ɒ': 'ppmpmmmmpmm0m0mmpppmpm00',
    'p': 'mmpmmmmmmmmpm0pmmmmm0m00',
    'b': 'mmpmmmmmpmmpm0pmmmmm0m00',
    'm': 'mppmmmpmpmmpm0pmmmmm0m00',
    'f': 'mmppmmmpmmmpm0pmmmmm0m00',
    'v': 'mmppmmmppmmpm0pmmmmm0m00',
    't': 'mmpmmmmmmmmppmmmmmmm0m00',
    'd': 'mmpmmmmmpmmppmmmmmmm0m00',
    'n': 'mppmmmpmpmmppmmmmmmm0m00',
    's': 'mmppmmmpmmmppmmmmmmm0m00',
    'z': 'mmppmmmppmmppmmmmmmm0m00',
    'θ': 'mmppmmmmmmmpppmmmmmm0m00',
    'ð': 'mmppmmmmpmmpppmmmmmm0m00',
    'l': 'mpppmpmmpmmppmmmmmmm0m00',
    'r': 'mpmpmmmmpmmppmmpmmpm0m00',
    'ɹ': 'mpmpmmmmpmmppmmpmmpm0m00',
    'ʃ': 'mmppmmmpmmmmppmmmmmm0m00',
    'ʒ': 'mmppmmmppmmmppmmmmmm0m00',
    'j': 'mpmpmmmmpmmmm0mpmmmm0m00',
    'k': 'mmpmmmmmmmmmm0mpmpmm0m00',
    'g': 'mmpmmmmmpmmmm0mpmpmm0m00',
    'ɡ': 'mmpmmmmmpmmmm0mpmpmm0m00',
    'ŋ': 'mppmmmpmpmmmm0mpmpmm0m00',
    'w': 'mpmpmmmmpmmmm0ppmppm0m00',
    'h': 'mpppmmmmmmmmm0mmmpmm0m00',
    'ɫ': 'mppp0pmmpmmppmmmmmmm0m00',
    'ɾ': 'mppp0mmmpmmppmm00mmm0m00',
    'tʃ': 'mmpmmmmmmmmppmmmmmmm0m00',
    'dʒ': 'mmpmmmmmpmmppmmmmmmm0m00',
}
_VOWELS = frozenset("iyɨʉɯuɪʏʊeøɘɵɤoəɛœɜɞʌɔæɐaɶɑɒ")
_phoneme_distance_cache: dict[tuple[str, str], float] = {}


def _phoneme_distance(a: str, b: str) -> float:
    """Articulatory distance between two phonemes, in [0, 1] (0 = identical).

    Uses the baked panphon feature vectors (fraction of differing features, scaled +
    clamped). Falls back to a coarse vowel-vs-consonant test for any phone not in the
    table so an unknown glyph still costs *something* sensible rather than a free pass.
    """
    if a == b:
        return 0.0
    key = (a, b)
    cached = _phoneme_distance_cache.get(key)
    if cached is not None:
        return cached
    va = _FEATURE_VECTORS.get(_FEATURE_CANON.get(a, a))
    vb = _FEATURE_VECTORS.get(_FEATURE_CANON.get(b, b))
    if va is not None and vb is not None:
        diff = sum(1 for x, y in zip(va, vb) if x != y)
        dist = min(1.0, (diff / len(va)) * _FEATURE_SCALE)
    else:
        dist = 1.0 if (a in _VOWELS) != (b in _VOWELS) else 0.6
    _phoneme_distance_cache[key] = dist
    return dist


# Lazy singleton recogniser + a lock so concurrent requests don't load it twice.
_recognizer = None
_recognizer_lock = threading.Lock()

# Lazy g2p backend (phonemizer/espeak-ng) for turning free-talk text into target IPA,
# where the target IPA isn't stored and must be generated from the child's transcript.
# _phonemizer is a sentinel: None = not tried, False = unavailable, else the callable.
_phonemizer = None
_phonemizer_lock = threading.Lock()


class IpaScoringError(Exception):
    """Raised when audio cannot be transcribed to IPA (bad audio, model missing…)."""

    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(message)


@dataclass
class WordScore:
    word: str
    target_ipa: str
    spoken_ipa: str
    score: int
    rating: str  # "Good" | "Fair" | "Poor"


def _get_recognizer():
    """Load the Allosaurus recogniser once. Raises IpaScoringError if unavailable."""
    global _recognizer
    if _recognizer is not None:
        return _recognizer
    with _recognizer_lock:
        if _recognizer is not None:
            return _recognizer
        try:
            from allosaurus.app import read_recognizer
        except Exception as error:  # pragma: no cover - import guard
            logger.warning("Allosaurus not installed: %s", error)
            raise IpaScoringError(
                503, "Pronunciation engine not installed — audio IPA scoring unavailable"
            ) from error
        try:
            _recognizer = read_recognizer()
        except Exception as error:  # pragma: no cover - model load failure
            logger.warning("Allosaurus model load failed: %s", error)
            raise IpaScoringError(503, "Pronunciation engine failed to load") from error
        return _recognizer


def _get_phonemizer():
    """Load the phonemizer/espeak-ng g2p backend once. Returns a callable or None.

    Used by the free-talk mode, where there is no pre-stored target IPA: we phonemize
    the child's recognised transcript word-by-word to build the "target" to grade the
    recording against. Returns None (not an error) if espeak-ng is unavailable, so the
    caller can degrade gracefully instead of failing the whole turn.
    """
    global _phonemizer
    if _phonemizer is not None:
        return _phonemizer or None
    with _phonemizer_lock:
        if _phonemizer is not None:
            return _phonemizer or None
        try:
            from phonemizer.backend import EspeakBackend

            backend = EspeakBackend("en-us", with_stress=True)
            _phonemizer = lambda word: backend.phonemize([word], strip=True)[0]
        except Exception as error:  # pragma: no cover - optional dependency / no espeak
            logger.warning("phonemizer/espeak-ng unavailable: %s", error)
            _phonemizer = False
            return None
        return _phonemizer


def text_to_ipa_per_word(words: list[str]) -> list[str]:
    """Phonemize each word to IPA (one token per input word, position-aligned).

    Phonemizing word-by-word (rather than the whole phrase) guarantees a 1:1 mapping —
    espeak merges some function words ("I am" → two tokens) which would desync the
    per-word lists. Returns "" for any word that fails or when g2p is unavailable.
    """
    phonemize = _get_phonemizer()
    if phonemize is None:
        return ["" for _ in words]
    out: list[str] = []
    for word in words:
        try:
            out.append(str(phonemize(word) or "").strip())
        except Exception:  # pragma: no cover - per-word best effort
            out.append("")
    return out


def warmup() -> None:
    """Eagerly load the Allosaurus model + espeak-ng backend so the first real request
    doesn't pay the ~5-6s cold-start. Safe to call at app startup: every failure is
    swallowed (the engines stay lazily-loadable and scoring degrades gracefully if a
    dependency is genuinely missing). Intended to run off the main thread.
    """
    try:
        _get_recognizer()
    except Exception as error:  # engine missing/unloadable → stays a no-op at request time
        logger.info("IPA warmup: recognizer unavailable (%s)", error)
    try:
        # A tiny phonemize both loads espeak-ng and primes its first-call cost.
        text_to_ipa_per_word(["hello"])
    except Exception as error:  # pragma: no cover - best effort
        logger.info("IPA warmup: g2p unavailable (%s)", error)


def _normalize_ipa(value: str) -> str:
    text = _IPA_NOISE.sub("", (value or ""))
    # Decompose so combining diacritics (e.g. the syllabic mark in "wɹ̩ld") become their
    # own code points, then drop every combining mark (category Mn) and modifier letter.
    decomposed = unicodedata.normalize("NFD", text)
    out: list[str] = []
    for char in decomposed:
        if char in _IPA_MODIFIERS:
            continue
        if unicodedata.category(char) in ("Mn", "Lm"):
            continue
        out.append(_IPA_FOLD.get(char, char))
    return "".join(out).strip()


def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    previous = list(range(len(b) + 1))
    for i, char_a in enumerate(a, start=1):
        current = [i]
        for j, char_b in enumerate(b, start=1):
            insert = current[j - 1] + 1
            delete = previous[j] + 1
            substitute = previous[j - 1] + (char_a != char_b)
            current.append(min(insert, delete, substitute))
        previous = current
    return previous[-1]


def _rating_for(score: int) -> str:
    if score >= 80:
        return "Good"
    if score >= 55:
        return "Fair"
    return "Poor"


def transcribe_audio_to_ipa(audio_bytes: bytes, lang_id: str = "eng") -> str:
    """Run Allosaurus on the uploaded WAV bytes and return the recognised IPA string.

    The client sends 16 kHz mono WAV (encoded in-browser) because Allosaurus reads WAV
    via `wave.open` and the server has no ffmpeg to transcode webm/opus.

    Raises IpaScoringError on empty audio, unreadable WAV, or engine failure so the
    caller can surface a clean 5xx instead of a stack trace.
    """
    if not audio_bytes:
        raise IpaScoringError(400, "Empty audio")

    recognizer = _get_recognizer()

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        try:
            spoken = recognizer.recognize(tmp_path, lang_id)
        except Exception as error:
            logger.warning("Allosaurus recognize failed: %s", error)
            raise IpaScoringError(
                400, "Could not read the audio — please record again"
            ) from error
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:  # pragma: no cover - best-effort cleanup
                pass

    return str(spoken or "").strip()


# Gap (insertion/deletion) cost in the feature-weighted alignment. Slightly below 1.0 so
# a missing/extra phone is penalised, but not harder than the worst substitution.
_GAP_COST = 0.85


def _align_feature_weighted(
    target_norm_words: list[str], spoken: str
) -> dict[int, dict]:
    """Globally align the spoken IPA stream to the concatenated target, weighting each
    substitution by articulatory distance (see `_phoneme_distance`) instead of a flat 0/1.

    Allosaurus emits one continuous phone string with no word boundaries. A single
    Needleman-Wunsch alignment over the concatenated target keeps a stray/dropped phone
    local instead of drifting every later word. Feature weighting means a near-miss
    (iː→ɪ) barely dents the score while a real error (iː→k) costs a full phone — so the
    score reflects *how wrong* the pronunciation is, not just whether the glyphs match.

    Returns, per target-word index: {cost, ops, heard} where cost is the summed alignment
    cost charged to that word, ops the number of charged operations, and heard the spoken
    phones attributed to it (for display).
    """
    target_chars: list[str] = []
    char_owner: list[int] = []
    for index, word_ipa in enumerate(target_norm_words):
        for char in word_ipa:
            target_chars.append(char)
            char_owner.append(index)

    result: dict[int, dict] = {
        index: {"cost": 0.0, "ops": 0, "heard": []} for index in range(len(target_norm_words))
    }
    m = len(target_chars)
    n = len(spoken)
    if m == 0:
        return result

    # Feature-weighted edit-distance DP: substitution costs _phoneme_distance (0..1),
    # gap costs _GAP_COST. Backpointers drive the traceback that attributes phones to words.
    dp = [[0.0] * (n + 1) for _ in range(m + 1)]
    bp = [[None] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        dp[i][0] = dp[i - 1][0] + _GAP_COST
        bp[i][0] = "del"
    for j in range(1, n + 1):
        dp[0][j] = dp[0][j - 1] + _GAP_COST
        bp[0][j] = "ins"
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            sub = dp[i - 1][j - 1] + _phoneme_distance(target_chars[i - 1], spoken[j - 1])
            dele = dp[i - 1][j] + _GAP_COST
            ins = dp[i][j - 1] + _GAP_COST
            best = min(sub, dele, ins)
            dp[i][j] = best
            bp[i][j] = "sub" if best == sub else ("del" if best == dele else "ins")

    # Traceback: charge each op to the target word that owns the target phone. Insertions
    # (extra spoken phones with no target) are not charged to any word — a stray sound is
    # noise, not a per-word penalty.
    i, j = m, n
    while i > 0 or j > 0:
        tag = bp[i][j]
        if tag == "sub":
            owner = char_owner[i - 1]
            result[owner]["cost"] += _phoneme_distance(target_chars[i - 1], spoken[j - 1])
            result[owner]["ops"] += 1
            result[owner]["heard"].append(spoken[j - 1])
            i -= 1
            j -= 1
        elif tag == "del":
            owner = char_owner[i - 1]
            result[owner]["cost"] += _GAP_COST  # target phone the child never produced
            result[owner]["ops"] += 1
            i -= 1
        else:
            j -= 1  # extra spoken phone, charged to nobody

    for entry in result.values():
        entry["heard"].reverse()
    return result


def align_ipa(
    target_words: list[str],
    target_ipa_per_word: list[str],
    spoken_ipa: str,
) -> list[WordScore]:
    """Score each target word against the spoken IPA stream.

    The spoken IPA has no word boundaries, so we globally align it to the concatenated
    target IPA (see `_align_feature_weighted`) and grade each word against the phones that
    aligned to it — robust to the child inserting or dropping a word mid-sentence, and
    weighting each mismatch by how far apart the phonemes actually are.
    """
    target_norm_words = [
        _normalize_ipa(target_ipa_per_word[index]) if index < len(target_ipa_per_word) else ""
        for index in range(len(target_words))
    ]
    aligned = _align_feature_weighted(target_norm_words, _normalize_ipa(spoken_ipa))

    scores: list[WordScore] = []
    for index, word in enumerate(target_words):
        target_raw = target_ipa_per_word[index] if index < len(target_ipa_per_word) else ""
        target_norm = target_norm_words[index]
        entry = aligned.get(index, {"cost": 0.0, "ops": 0, "heard": []})
        spoken_chunk = "".join(entry["heard"])

        if not target_norm:
            score = 100
        elif entry["ops"] == 0:
            score = 0  # word had target phones but nothing aligned to it (fully dropped)
        else:
            # Average cost per charged phone → accuracy. Feature-weighted, so a near-miss
            # costs a fraction of a phone and a real error costs close to a full one.
            ratio = 1 - (entry["cost"] / entry["ops"])
            score = max(0, min(100, round(ratio * 100)))

        scores.append(
            WordScore(
                word=word,
                target_ipa=target_raw,
                spoken_ipa=spoken_chunk,
                score=score,
                rating=_rating_for(score),
            )
        )
    return scores


def score_utterance(
    target_words: list[str],
    target_ipa_per_word: list[str],
    audio_bytes: bytes,
    lang_id: str = "eng",
) -> dict:
    """Full pipeline: audio → spoken IPA → per-word alignment → overall score."""
    spoken_ipa = transcribe_audio_to_ipa(audio_bytes, lang_id)
    word_scores = align_ipa(target_words, target_ipa_per_word, spoken_ipa)
    overall = (
        round(sum(item.score for item in word_scores) / len(word_scores))
        if word_scores
        else 0
    )
    return {
        "overall_score": overall,
        "spoken_ipa": spoken_ipa,
        "words": [
            {
                "word": item.word,
                "targetIpa": item.target_ipa,
                "spokenIpa": item.spoken_ipa,
                "score": item.score,
                "rating": item.rating,
            }
            for item in word_scores
        ],
    }


def score_free_utterance(transcript: str, audio_bytes: bytes, lang_id: str = "eng") -> dict:
    """Score a free-talk recording where there's no pre-stored target IPA.

    Unlike `score_utterance` (scripted lines carry hand-checked target IPA), free talk has
    no fixed sentence: the child says whatever they want. We take the browser's speech-
    recognition transcript as the intended words, phonemize it word-by-word to synthesise
    the target IPA, then grade the recording's IPA against that. If g2p is unavailable the
    per-word target is "", which `align_ipa` treats as full credit — so pronunciation
    scoring silently drops out rather than failing the free-talk turn.
    """
    words = [w for w in re.split(r"\s+", (transcript or "").strip()) if w]
    if not words:
        return {"overall_score": 0, "spoken_ipa": "", "words": [], "targetText": ""}

    per_word_ipa = text_to_ipa_per_word([w.strip(".,!?;:\"'").lower() for w in words])
    result = score_utterance(words, per_word_ipa, audio_bytes, lang_id)
    result["targetText"] = " ".join(words)
    return result

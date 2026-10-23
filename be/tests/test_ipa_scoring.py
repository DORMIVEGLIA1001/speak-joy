"""Unit tests for the audio→IPA role-play scoring service (notes 14/7 · mục 3.5).

These cover the pure alignment/scoring logic plus the transcription error handling,
with the Allosaurus recogniser mocked — so they run offline without loading the model.
"""

import unittest
from unittest.mock import MagicMock, patch

from be.app.services.ipa_scoring_service import (
    IpaScoringError,
    _levenshtein,
    _normalize_ipa,
    _rating_for,
    align_ipa,
    score_utterance,
    transcribe_audio_to_ipa,
)


class NormalizeAndDistanceTests(unittest.TestCase):
    def test_normalize_strips_stress_length_and_space(self) -> None:
        self.assertEqual(_normalize_ipa("ˈhɛlˌoʊ"), "hɛloʊ")
        self.assertEqual(_normalize_ipa("h ɛ l oʊ"), "hɛloʊ")
        self.assertEqual(_normalize_ipa("kæt."), "kæt")
        self.assertEqual(_normalize_ipa(""), "")

    def test_levenshtein_basics(self) -> None:
        self.assertEqual(_levenshtein("kæt", "kæt"), 0)
        self.assertEqual(_levenshtein("", "kæt"), 3)
        self.assertEqual(_levenshtein("kæt", ""), 3)
        self.assertEqual(_levenshtein("kæt", "kʌt"), 1)

    def test_rating_bands(self) -> None:
        self.assertEqual(_rating_for(95), "Good")
        self.assertEqual(_rating_for(80), "Good")
        self.assertEqual(_rating_for(79), "Fair")
        self.assertEqual(_rating_for(55), "Fair")
        self.assertEqual(_rating_for(54), "Poor")
        self.assertEqual(_rating_for(0), "Poor")


class AlignIpaTests(unittest.TestCase):
    def test_perfect_match_scores_full(self) -> None:
        words = ["hello", "cat"]
        target = ["hɛloʊ", "kæt"]
        # Spoken stream is the concatenation of the targets — greedy windows line up.
        result = align_ipa(words, target, "hɛloʊkæt")
        self.assertEqual([w.score for w in result], [100, 100])
        self.assertEqual([w.rating for w in result], ["Good", "Good"])

    def test_wrong_vowel_drops_the_affected_word(self) -> None:
        words = ["cat"]
        target = ["kæt"]
        result = align_ipa(words, target, "kʌt")  # one phoneme off
        self.assertLess(result[0].score, 100)
        self.assertGreater(result[0].score, 0)

    def test_missing_target_ipa_defaults_to_full_credit(self) -> None:
        result = align_ipa(["hi"], [""], "haɪ")
        self.assertEqual(result[0].score, 100)

    def test_word_count_preserved_when_ipa_list_short(self) -> None:
        result = align_ipa(["one", "two"], ["wʌn"], "wʌn")
        self.assertEqual(len(result), 2)
        self.assertEqual(result[1].target_ipa, "")

    def test_spaces_in_spoken_ipa_are_ignored(self) -> None:
        # Allosaurus emits space-separated phones; alignment should still line up.
        result = align_ipa(["cat"], ["kæt"], "k æ t")
        self.assertEqual(result[0].score, 100)

    def test_inserted_word_does_not_corrupt_later_words(self) -> None:
        # Child says an extra word ("very") between "am" and "fine". A fixed-window slice
        # would shift the cursor and wreck every later word; global alignment keeps the
        # stray phones local so "fine" still matches.
        words = ["I", "am", "fine"]
        target = ["aɪ", "æm", "faɪn"]
        result = align_ipa(words, target, "aɪæmvɛrifaɪn")
        self.assertEqual(result[0].score, 100)  # I
        self.assertEqual(result[2].score, 100)  # fine survives the inserted word

    def test_dropped_word_only_penalizes_the_missing_word(self) -> None:
        # Child omits "am" entirely. The missing word should score low, but the words
        # around it must still line up and score well.
        words = ["I", "am", "fine"]
        target = ["aɪ", "æm", "faɪn"]
        result = align_ipa(words, target, "aɪfaɪn")
        self.assertEqual(result[0].score, 100)  # I
        self.assertLess(result[1].score, 60)    # am is missing
        self.assertEqual(result[2].score, 100)  # fine still matches


class TranscribeTests(unittest.TestCase):
    def test_empty_audio_raises_400(self) -> None:
        with self.assertRaises(IpaScoringError) as raised:
            transcribe_audio_to_ipa(b"")
        self.assertEqual(raised.exception.status_code, 400)

    @patch("be.app.services.ipa_scoring_service._get_recognizer")
    def test_success_returns_recognized_ipa(self, mock_get) -> None:
        recognizer = MagicMock()
        recognizer.recognize.return_value = "h ɛ l oʊ"
        mock_get.return_value = recognizer
        self.assertEqual(transcribe_audio_to_ipa(b"RIFFwavdata"), "h ɛ l oʊ")
        recognizer.recognize.assert_called_once()

    @patch("be.app.services.ipa_scoring_service._get_recognizer")
    def test_unreadable_audio_raises_400(self, mock_get) -> None:
        recognizer = MagicMock()
        recognizer.recognize.side_effect = RuntimeError("bad wav")
        mock_get.return_value = recognizer
        with self.assertRaises(IpaScoringError) as raised:
            transcribe_audio_to_ipa(b"notwav")
        self.assertEqual(raised.exception.status_code, 400)

    @patch("be.app.services.ipa_scoring_service._get_recognizer")
    def test_engine_unavailable_propagates(self, mock_get) -> None:
        mock_get.side_effect = IpaScoringError(503, "engine missing")
        with self.assertRaises(IpaScoringError) as raised:
            transcribe_audio_to_ipa(b"audio")
        self.assertEqual(raised.exception.status_code, 503)


class ScoreUtteranceTests(unittest.TestCase):
    @patch("be.app.services.ipa_scoring_service.transcribe_audio_to_ipa")
    def test_full_pipeline_shape(self, mock_transcribe) -> None:
        mock_transcribe.return_value = "hɛloʊkæt"
        result = score_utterance(["hello", "cat"], ["hɛloʊ", "kæt"], b"audio")
        self.assertEqual(result["overall_score"], 100)
        self.assertEqual(result["spoken_ipa"], "hɛloʊkæt")
        self.assertEqual(len(result["words"]), 2)
        self.assertEqual(result["words"][0]["word"], "hello")
        self.assertIn("targetIpa", result["words"][0])
        self.assertIn("spokenIpa", result["words"][0])

    @patch("be.app.services.ipa_scoring_service.transcribe_audio_to_ipa")
    def test_empty_words_scores_zero(self, mock_transcribe) -> None:
        mock_transcribe.return_value = ""
        result = score_utterance([], [], b"audio")
        self.assertEqual(result["overall_score"], 0)
        self.assertEqual(result["words"], [])


if __name__ == "__main__":
    unittest.main()

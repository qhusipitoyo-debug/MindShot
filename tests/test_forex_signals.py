import unittest

import forex_signals
import news_feed
from live_signals import _levels
from mind_shot.strategies import STRATEGY_BY_ID

BASE = 1_800_000_000 - (1_800_000_000 % forex_signals.BAR_SECONDS)


def bar(hour, o, h, l, c, v):
    return (BASE + hour * 3600, o, h, l, c, v)


def event(ts, ccy, impact, title="Event", source="test"):
    return news_feed._make_event(
        ts=ts, ccy=ccy, impact=impact, title=title, source=source
    )


class Aggregate4hTest(unittest.TestCase):
    def test_builds_closed_utc_buckets(self):
        rows = [
            bar(0, 100, 102, 99, 101, 1),
            bar(1, 101, 103, 100, 102, 2),
            bar(2, 102, 104, 101, 103, 3),
            bar(3, 103, 105, 102, 104, 4),
            bar(4, 104, 106, 103, 105, 5),
            bar(5, 105, 107, 104, 106, 6),
            bar(6, 106, 108, 105, 107, 7),
            bar(7, 107, 109, 106, 108, 8),
        ]
        out = forex_signals.aggregate_4h(rows, now=BASE + 8 * 3600)

        self.assertEqual(len(out), 2)
        self.assertEqual(out[0], (BASE, 100, 105, 99, 104, 10))
        self.assertEqual(out[1], (BASE + 4 * 3600, 104, 109, 103, 108, 26))

    def test_drops_the_still_forming_bucket(self):
        rows = [
            bar(0, 100, 102, 99, 101, 1),
            bar(1, 101, 103, 100, 102, 2),
            bar(2, 102, 104, 101, 103, 3),
            bar(3, 103, 105, 102, 104, 4),
            bar(4, 104, 106, 103, 105, 5),
            bar(5, 105, 107, 104, 106, 6),
            bar(6, 106, 108, 105, 107, 7),
        ]
        out = forex_signals.aggregate_4h(rows, now=BASE + 7 * 3600)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0][0], BASE)

    def test_drops_partial_session_with_one_hour(self):
        out = forex_signals.aggregate_4h(
            [bar(0, 100, 102, 99, 101, 1)], now=BASE + 4 * 3600
        )
        self.assertEqual(out, [])

    def test_zero_volume_uses_hour_count_as_proxy(self):
        rows = [
            bar(0, 100, 102, 99, 101, 0),
            bar(1, 101, 103, 100, 102, 0),
            bar(2, 102, 104, 101, 103, 0),
            bar(3, 103, 105, 102, 104, 0),
        ]
        out = forex_signals.aggregate_4h(rows, now=BASE + 4 * 3600)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0][5], 4.0)

    def test_real_volume_is_summed(self):
        rows = [
            bar(0, 100, 102, 99, 101, 1.5),
            bar(1, 101, 103, 100, 102, 2.5),
            bar(2, 102, 104, 101, 103, 3.5),
            bar(3, 103, 105, 102, 104, 4.5),
        ]
        out = forex_signals.aggregate_4h(rows, now=BASE + 4 * 3600)
        self.assertEqual(out[0][5], 12.0)


class YahooParserTest(unittest.TestCase):
    def test_filters_nulls_and_non_positive_prices(self):
        doc = {"chart": {"result": [{
            "timestamp": [100, 200, 300, 400],
            "indicators": {"quote": [{
                "open": [1, None, 3, 4],
                "high": [1, None, 3, 4],
                "low": [1, None, 3, 4],
                "close": [1, None, 3, 0],
                "volume": [10, 0, None, 40],
            }]},
        }]}}
        rows = forex_signals._candles_from_yahoo(doc, "TEST=X")

        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0], (100, 1.0, 1.0, 1.0, 1.0, 10.0))
        self.assertEqual(rows[1], (300, 3.0, 3.0, 3.0, 3.0, 0.0))

    def test_skips_non_increasing_timestamps(self):
        doc = {"chart": {"result": [{
            "timestamp": [100, 200, 200, 300],
            "indicators": {"quote": [{
                "open": [1, 2, 3, 4],
                "high": [1, 2, 3, 4],
                "low": [1, 2, 3, 4],
                "close": [1, 2, 3, 4],
                "volume": [1, 2, 3, 4],
            }]},
        }]}}
        rows = forex_signals._candles_from_yahoo(doc, "TEST=X")
        self.assertEqual([r[0] for r in rows], [100, 200, 300])


class NewsGateTest(unittest.TestCase):
    NOW = 1_000_000

    def gate(self, events, currencies=("EUR", "USD")):
        return forex_signals.pair_news_gate(currencies, events, self.NOW)

    def test_high_is_blocked_fifteen_before_to_forty_five_after(self):
        ev = event(self.NOW + 10 * 60, "USD", "high", "NFP")
        out = self.gate([ev])
        self.assertTrue(out["blocked"])
        self.assertEqual(out["active"]["title"], "NFP")
        self.assertEqual(
            out["active"]["blackout"],
            [self.NOW - 5 * 60, self.NOW + 55 * 60],
        )

    def test_high_window_boundaries(self):
        at_start = self.gate([event(self.NOW + 15 * 60, "EUR", "high")])
        at_end = self.gate([event(self.NOW - 45 * 60, "EUR", "high")])
        after = self.gate([event(self.NOW - 46 * 60, "EUR", "high")])
        self.assertTrue(at_start["blocked"])
        self.assertTrue(at_end["blocked"])
        self.assertFalse(after["blocked"])
        self.assertIsNone(after["next"])

    def test_medium_is_blocked_ten_before_to_twenty_after(self):
        ev = event(self.NOW + 5 * 60, "GBP", "medium", "Retail Sales")
        out = self.gate([ev], currencies=("GBP",))
        self.assertTrue(out["blocked"])
        self.assertEqual(
            out["active"]["blackout"],
            [self.NOW - 5 * 60, self.NOW + 25 * 60],
        )

    def test_upcoming_is_sorted_and_far_event_is_not_blocked(self):
        later = event(self.NOW + 90 * 60, "USD", "high", "Later")
        sooner = event(self.NOW + 30 * 60, "EUR", "high", "Sooner")
        out = self.gate([later, sooner])
        self.assertFalse(out["blocked"])
        self.assertEqual(out["next"]["title"], "Sooner")

    def test_high_wins_when_medium_is_also_active(self):
        medium = event(self.NOW, "USD", "medium", "Medium")
        high = event(self.NOW + 5 * 60, "USD", "high", "High")
        out = self.gate([medium, high])
        self.assertTrue(out["blocked"])
        self.assertEqual(out["active"]["impact"], "high")

    def test_unrelated_currency_and_low_impact_are_ignored(self):
        events = [
            event(self.NOW, "JPY", "high", "BoJ"),
            event(self.NOW, "USD", "low", "Minor"),
        ]
        out = self.gate(events)
        self.assertFalse(out["blocked"])
        self.assertIsNone(out["next"])


class StatusTest(unittest.TestCase):
    def test_status_precedence(self):
        self.assertEqual(
            forex_signals.strategy_status(
                adx_ok=False, long_ok=True, short_ok=False,
                news_blocked=False, leg_valid=True,
            ),
            "trending",
        )
        self.assertEqual(
            forex_signals.strategy_status(
                adx_ok=True, long_ok=False, short_ok=False,
                news_blocked=False, leg_valid=True,
            ),
            "waiting",
        )
        self.assertEqual(
            forex_signals.strategy_status(
                adx_ok=True, long_ok=True, short_ok=False,
                news_blocked=False, leg_valid=False,
            ),
            "blocked-direction",
        )
        self.assertEqual(
            forex_signals.strategy_status(
                adx_ok=True, long_ok=True, short_ok=False,
                news_blocked=True, leg_valid=True,
            ),
            "news-blocked",
        )
        self.assertEqual(
            forex_signals.strategy_status(
                adx_ok=True, long_ok=True, short_ok=False,
                news_blocked=False, leg_valid=True,
            ),
            "locked-long",
        )
        self.assertEqual(
            forex_signals.strategy_status(
                adx_ok=True, long_ok=False, short_ok=True,
                news_blocked=False, leg_valid=True,
            ),
            "locked-short",
        )


class RevertDirectionTest(unittest.TestCase):
    """The forex panel reuses _levels, so revert legs must point at the mean."""

    STRAT = STRATEGY_BY_ID["vwap_revert_eth"]

    def levels(self, anchor):
        series = {
            "atr": [2.0],
            "closes": [100.0],
            "vwap": [float(anchor)],
        }
        return _levels(self.STRAT, series, 0)

    def test_anchor_below_entry_only_valid_for_sell(self):
        lv = self.levels(90.0)
        self.assertFalse(lv["buy"]["valid"])
        self.assertTrue(lv["sell"]["valid"])
        self.assertEqual(lv["sell"]["tp"], 90.0)

    def test_anchor_above_entry_only_valid_for_buy(self):
        lv = self.levels(110.0)
        self.assertTrue(lv["buy"]["valid"])
        self.assertFalse(lv["sell"]["valid"])
        self.assertEqual(lv["buy"]["tp"], 110.0)


if __name__ == "__main__":
    unittest.main()

import unittest
from datetime import datetime, timezone

import news_feed


def epoch(text: str) -> int:
    dt = datetime.strptime(text, "%Y-%m-%d %H:%M")
    return int(dt.replace(tzinfo=timezone.utc).timestamp())


class PipeFeedTest(unittest.TestCase):
    def test_parses_header_and_rows(self):
        text = (
            "# Automatisch generiert\n"
            "# Generiert: 2026-11-05 11:44 UTC\n"
            "# Format: YYYY-MM-DD HH:MM|CCY|IMPACT|Event-Name\n"
            "2026-11-06 15:30|USD|HIGH|Non-Farm Employment Change\n"
            "2026-11-06 15:30|usd|high|Unemployment Rate\n"
            "not a valid row\n"
            "2026-13-40 99:99|EUR|HIGH|Broken date\n"
        )
        events, generated = news_feed.parse_pipe(text)

        self.assertEqual(generated, epoch("2026-11-05 11:44"))
        self.assertEqual(len(events), 2)
        self.assertEqual(events[0]["ccy"], "USD")
        self.assertEqual(events[0]["impact"], "high")
        self.assertEqual(events[0]["t"], epoch("2026-11-06 15:30"))
        self.assertEqual(events[0]["blackout"], [
            epoch("2026-11-06 15:30") - 30 * 60,
            epoch("2026-11-06 15:30") + 30 * 60,
        ])


class TradingViewFeedTest(unittest.TestCase):
    def test_maps_importance_country_and_currency(self):
        doc = {
            "result": [
                {
                    "id": "1",
                    "kind": "economic",
                    "title": "CPI m/m",
                    "country": "US",
                    "currency": "USD",
                    "importance": 1,
                    "date": "2026-11-10T13:30:00.000Z",
                    "forecast": "0.3",
                    "previous": "0.2",
                },
                {
                    "id": "2",
                    "title": "GDP q/q",
                    "country": "GB",
                    "importance": 0,
                    "date": "2026-11-11T07:00:00+00:00",
                },
                {
                    "id": "3",
                    "title": "Bank Holiday",
                    "country": "JP",
                    "kind": "holiday",
                    "importance": -1,
                    "date": "2026-11-12T00:00:00.000Z",
                },
            ]
        }
        events = news_feed.parse_tradingview(doc)

        self.assertEqual(len(events), 3)
        self.assertEqual(events[0]["impact"], "high")
        self.assertEqual(events[0]["ccy"], "USD")
        self.assertEqual(events[0]["forecast"], "0.3")
        self.assertEqual(events[1]["impact"], "medium")
        self.assertEqual(events[1]["ccy"], "GBP")   # falls back to country code
        self.assertEqual(events[2]["impact"], "holiday")
        self.assertEqual(events[2]["ccy"], "JPY")

    def test_ignores_malformed_rows(self):
        doc = {"result": [
            "nope",
            {"title": "No date", "country": "US", "importance": 1},
            {"id": "x", "title": "", "country": "US", "importance": 1,
             "date": "2026-11-10T13:30:00Z"},
        ]}
        self.assertEqual(news_feed.parse_tradingview(doc), [])


class MergeTest(unittest.TestCase):
    @staticmethod
    def _event(ts, ccy, impact, title, source="tradingview"):
        return news_feed._make_event(
            ts=ts, ccy=ccy, impact=impact, title=title, source=source
        )

    def test_pipe_duplicate_within_ten_minutes_is_dropped(self):
        t = epoch("2026-11-06 15:30")
        primary = [self._event(t, "USD", "high", "Non-Farm Payrolls")]
        secondary = [self._event(t + 300, "USD", "HIGH", "Non-Farm Employment Change",
                                 source="news-calendar-feed")]
        merged = news_feed.merge_events(primary, secondary)
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["source"], "tradingview")

    def test_distinct_event_is_kept_and_sorted(self):
        t = epoch("2026-11-06 15:30")
        primary = [self._event(t + 3600, "USD", "high", "Later event")]
        secondary = [self._event(t, "EUR", "HIGH", "ECB rate",
                                 source="news-calendar-feed")]
        merged = news_feed.merge_events(primary, secondary)
        self.assertEqual(len(merged), 2)
        self.assertEqual(merged[0]["title"], "ECB rate")

    def test_dedupe_identical_rows(self):
        t = epoch("2026-11-06 15:30")
        rows = [
            self._event(t, "USD", "high", "CPI"),
            self._event(t, "USD", "high", "cpi"),
        ]
        self.assertEqual(len(news_feed.dedupe(rows)), 1)


class WindowTest(unittest.TestCase):
    def test_window_bounds(self):
        now = epoch("2026-11-07 12:00")
        self.assertTrue(news_feed.in_window(now, now))
        self.assertTrue(news_feed.in_window(now - 3600, now))       # 1h ago
        self.assertFalse(news_feed.in_window(now - 3 * 3600, now))  # too old
        self.assertTrue(news_feed.in_window(now + 9 * 86400, now))
        self.assertFalse(news_feed.in_window(now + 11 * 86400, now))


if __name__ == "__main__":
    unittest.main()

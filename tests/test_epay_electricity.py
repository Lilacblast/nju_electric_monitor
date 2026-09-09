import json
import subprocess
import sys
import unittest
from pathlib import Path


SRC_DIR = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC_DIR))

import epay_electricity  # noqa: E402
from epay_electricity import (  # noqa: E402
    ElectricityQueryError,
    QUERY_ELECTRICITY_SCRIPT,
    query_remaining_electricity,
    read_remaining_electricity,
)


class FakeDriver:
    def __init__(self, result):
        self.result = result

    def execute_async_script(self, _script):
        return self.result


class QueryRemainingElectricityTests(unittest.TestCase):
    def test_browser_script_posts_bound_room_fields_with_csrf(self):
        node_program = f"""
const code = {json.dumps(QUERY_ELECTRICITY_SCRIPT)};
let captured;
global.window = {{
  location: {{origin: "https://epay.nju.edu.cn"}},
  app: {{list: []}},
}};
setTimeout(() => {{
  window.app.list.push({{sysId: "SYS", roomId: "ROOM", areaId: "AREA", buildId: "BUILD"}});
}}, 5);
global.document = {{
  querySelector(selector) {{
    if (selector.includes("_csrf_header")) return {{content: "X-CSRF-TOKEN"}};
    if (selector.includes("_csrf")) return {{content: "csrf-value"}};
    return null;
  }},
}};
global.fetch = async (url, options) => {{
  captured = {{url, options}};
  return {{ok: true, json: async () => ({{restElecDegree: "7.75"}})}};
}};
(function(callback) {{ eval(code); }})(result => {{
  console.log(JSON.stringify({{result, captured}}));
}});
"""
        completed = subprocess.run(
            ["node", "-e", node_program],
            check=True,
            capture_output=True,
            text=True,
        )
        output = json.loads(completed.stdout)

        self.assertEqual(output["result"], {"ok": True, "value": "7.75"})
        self.assertEqual(output["captured"]["url"], "/epay/electric/queryelectricbill")
        self.assertEqual(
            output["captured"]["options"]["body"],
            "sysid=SYS&roomNo=ROOM&elcarea=AREA&elcbuis=BUILD",
        )
        self.assertEqual(
            output["captured"]["options"]["headers"]["X-CSRF-TOKEN"],
            "csrf-value",
        )

    def test_safe_url_removes_authentication_query_and_fragment(self):
        self.assertTrue(hasattr(epay_electricity, "safe_url_for_log"))
        safe_url = epay_electricity.safe_url_for_log(
            "https://authserver.nju.edu.cn/authserver/login?ticket=secret#state"
        )

        self.assertEqual(safe_url, "https://authserver.nju.edu.cn/authserver/login")

    def test_returns_numeric_balance_from_successful_query(self):
        driver = FakeDriver({"ok": True, "value": "18.75"})

        self.assertEqual(query_remaining_electricity(driver), 18.75)

    def test_rejects_a_malformed_balance(self):
        driver = FakeDriver({"ok": True, "value": "not-a-number"})

        with self.assertRaises(ElectricityQueryError):
            query_remaining_electricity(driver)

    def test_rejects_an_unsuccessful_query_response(self):
        driver = FakeDriver({"ok": False, "error": "HTTP 403"})

        with self.assertRaises(ElectricityQueryError):
            query_remaining_electricity(driver)

    def test_rejects_a_negative_balance(self):
        driver = FakeDriver({"ok": True, "value": -1})

        with self.assertRaises(ElectricityQueryError):
            query_remaining_electricity(driver)

    def test_uses_query_result_without_opening_fallback_page(self):
        def fallback():
            raise AssertionError("fallback must not run after a successful query")

        result = read_remaining_electricity(lambda: 12.5, fallback)

        self.assertEqual(result, 12.5)

    def test_uses_dom_fallback_when_query_fails(self):
        def query():
            raise ElectricityQueryError("query unavailable")

        result = read_remaining_electricity(query, lambda: 9.25)

        self.assertEqual(result, 9.25)

    def test_uses_dom_fallback_when_query_returns_no_value(self):
        result = read_remaining_electricity(lambda: None, lambda: 6.5)

        self.assertEqual(result, 6.5)


if __name__ == "__main__":
    unittest.main()

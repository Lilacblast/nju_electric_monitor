import math
from urllib.parse import urlsplit, urlunsplit


class ElectricityQueryError(RuntimeError):
    pass


def safe_url_for_log(url):
    try:
        parts = urlsplit(url)
        return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    except (TypeError, ValueError):
        return "<invalid-url>"


QUERY_ELECTRICITY_SCRIPT = r"""
const done = arguments[arguments.length - 1];

(async () => {
    if (window.location.origin !== "https://epay.nju.edu.cn") {
        throw new Error("unexpected origin");
    }

    const deadline = Date.now() + 5000;
    let binding = null;
    while (!binding && Date.now() < deadline) {
        binding = window.app && Array.isArray(window.app.list)
            ? window.app.list[0]
            : null;
        if (!binding) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
    if (!binding) {
        throw new Error("room binding unavailable");
    }

    const fields = {
        sysid: binding.sysId,
        roomNo: binding.roomId,
        elcarea: binding.areaId,
        elcbuis: binding.buildId,
    };
    if (Object.values(fields).some(value => value === null || value === undefined || value === "")) {
        throw new Error("room binding incomplete");
    }

    const headers = {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
    };
    const csrfHeader = document.querySelector('meta[name="_csrf_header"]')?.content;
    const csrfToken = document.querySelector('meta[name="_csrf"]')?.content;
    if (csrfHeader && csrfToken) {
        headers[csrfHeader] = csrfToken;
    }

    const response = await fetch("/epay/electric/queryelectricbill", {
        method: "POST",
        credentials: "same-origin",
        headers,
        body: new URLSearchParams(fields).toString(),
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    done({ok: true, value: payload.restElecDegree});
})().catch(error => done({ok: false, error: String(error)}));
"""


def query_remaining_electricity(driver):
    try:
        result = driver.execute_async_script(QUERY_ELECTRICITY_SCRIPT)
    except Exception as exc:
        raise ElectricityQueryError("browser query failed") from exc

    if not isinstance(result, dict) or result.get("ok") is not True:
        raise ElectricityQueryError("electricity query was rejected")

    try:
        value = float(result.get("value"))
    except (TypeError, ValueError) as exc:
        raise ElectricityQueryError("electricity query returned an invalid balance") from exc

    if not math.isfinite(value) or value < 0:
        raise ElectricityQueryError("electricity query returned an invalid balance")
    return value


def read_remaining_electricity(query, fallback):
    try:
        value = query()
    except ElectricityQueryError:
        return fallback()
    return fallback() if value is None else value

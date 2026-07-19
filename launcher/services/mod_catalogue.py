from urllib.parse import quote_plus

OFFICIAL_BROWSER = "https://gurrenm3.github.io/BTD-Mod-Helper/mod-browser?search="


def official_browser_url(query: str) -> str:
    return OFFICIAL_BROWSER + quote_plus(query)

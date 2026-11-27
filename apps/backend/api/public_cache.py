"""Cache policy for public catalog and viewer-dependent API responses."""

import re

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

_PLAYER_DETAIL_PATH = re.compile(r"/api/public/players/[^/]+/?")
_PUBLIC_CACHE_CONTROL = "public, max-age=300, s-maxage=300"
_PRIVATE_CACHE_CONTROL = "private, no-store"


class PublicApiCacheMiddleware:
    """Keep viewer responses out of HTTP caches while caching anonymous catalogs."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        if scope["type"] != "http" or not path.startswith("/api/public/"):
            await self.app(scope, receive, send)
            return

        request_headers = Headers(scope=scope)
        viewer_dependent = (
            "authorization" in request_headers
            or "cookie" in request_headers
            or _PLAYER_DETAIL_PATH.fullmatch(path) is not None
        )

        async def send_with_cache_policy(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                existing_policy = headers.get("Cache-Control", "").lower()
                private = (
                    viewer_dependent
                    or message["status"] >= 400
                    or scope.get("method") not in {"GET", "HEAD"}
                    or "no-store" in existing_policy
                    or "private" in existing_policy
                )
                headers["Cache-Control"] = (
                    _PRIVATE_CACHE_CONTROL if private else _PUBLIC_CACHE_CONTROL
                )
                # Anonymous catalog responses must not satisfy later requests
                # carrying an account's credentials at the same URL.
                vary = {
                    value.strip().lower() for value in headers.get("Vary", "").split(",")
                }
                for name in ("Authorization", "Cookie"):
                    if "*" not in vary and name.lower() not in vary:
                        headers.add_vary_header(name)
            await send(message)

        await self.app(scope, receive, send_with_cache_policy)

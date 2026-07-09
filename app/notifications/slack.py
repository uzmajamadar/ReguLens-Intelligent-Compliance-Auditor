import json
import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def _webhook_for_framework(framework: str) -> str | None:
    raw = settings.slack_webhooks_by_framework
    if not raw:
        return None
    try:
        mapping = json.loads(raw)
        return mapping.get(framework) or mapping.get("*")
    except (json.JSONDecodeError, TypeError):
        return None


def _build_blocks(text: str, actions: list[dict] | None = None) -> list[dict]:
    blocks: list[dict[str, Any]] = [
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": text},
        }
    ]
    if actions:
        blocks.append({
            "type": "actions",
            "elements": actions,
        })
    return blocks


def send_slack_message(
    text: str,
    webhook_url: str | None = None,
    framework: str | None = None,
    actions: list[dict] | None = None,
) -> bool:
    url = webhook_url or (_webhook_for_framework(framework) if framework else None) or settings.slack_webhook_url
    if not url:
        logger.warning("Slack webhook not configured — skipping message")
        return False

    payload: dict[str, Any] = {
        "blocks": _build_blocks(text, actions),
    }

    try:
        resp = httpx.post(url, json=payload, timeout=10)
        resp.raise_for_status()
        logger.info("Slack message sent to %s", url[:40])
        return True
    except Exception:
        logger.exception("Failed to send Slack message")
        return False

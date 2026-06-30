import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def send_slack_message(text: str, webhook_url: str | None = None) -> bool:
    url = webhook_url or settings.slack_webhook_url
    if not url:
        logger.warning("Slack webhook not configured — skipping message")
        return False

    try:
        resp = httpx.post(url, json={"text": text}, timeout=10)
        resp.raise_for_status()
        logger.info("Slack message sent")
        return True
    except Exception:
        logger.exception("Failed to send Slack message")
        return False

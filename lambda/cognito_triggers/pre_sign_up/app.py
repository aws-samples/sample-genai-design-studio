import os
import json
import logging

# ロガー設定
logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    """
    Cognitoのプレサインアップトリガーハンドラー
    指定されたメールドメインでのみサインアップを許可する

    Parameters:
    event (dict): Cognitoからのイベントデータ
    context (object): Lambda実行コンテキスト

    Returns:
    dict: 元のイベントデータ（許可する場合）または例外発生（拒否する場合）
    """
    logger.info("Pre SignUp Trigger invoked")

    # 環境変数から許可されたメールドメインのリストを取得
    allowed_domains_str = os.environ.get("ALLOWED_SIGN_UP_EMAIL_DOMAINS_STR", "[]")
    try:
        allowed_domains = json.loads(allowed_domains_str)
    except json.JSONDecodeError:
        logger.error(
            f"Invalid ALLOWED_SIGN_UP_EMAIL_DOMAINS_STR format: {allowed_domains_str}"
        )
        allowed_domains = []

    # 許可ドメインが設定されていない場合は全て許可
    if not allowed_domains:
        logger.info("No email domain restrictions configured, allowing all domains")
        return event

    # イベントからメールアドレスを取得
    email = event.get("request", {}).get("userAttributes", {}).get("email", "")

    if not email:
        logger.warning("Email not found in the event")
        return event

    # メールアドレスからドメイン部分を取得
    try:
        domain = email.split("@")[1].lower()
    except IndexError:
        logger.error(f"Invalid email format: {email}")
        raise Exception("Invalid email format")

    # ドメインがリストに含まれているか確認
    if domain not in allowed_domains:
        logger.warning(f"Email domain not allowed: {domain}")
        raise Exception(
            f"Sign up not allowed with email domain: {domain}. Please use an email from one of these domains: {', '.join(allowed_domains)}"
        )

    logger.info(f"Email domain allowed: {domain}")
    # 自動確認フラグを追加（オプション）
    event["response"]["autoConfirmUser"] = True

    return event

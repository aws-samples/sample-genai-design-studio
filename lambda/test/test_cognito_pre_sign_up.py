import os
import json
import unittest
import sys
from unittest.mock import patch, MagicMock

# Add the cognito_triggers/pre_sign_up directory to the path
sys.path.insert(
    0, os.path.join(os.path.dirname(__file__), "../cognito_triggers/pre_sign_up")
)
import app


class TestPreSignUp(unittest.TestCase):
    """
    PreSignUp Lambda関数のテストケース
    """

    def setUp(self):
        # テスト前に環境変数をクリア
        if "ALLOWED_SIGN_UP_EMAIL_DOMAINS_STR" in os.environ:
            del os.environ["ALLOWED_SIGN_UP_EMAIL_DOMAINS_STR"]

        # 基本的なイベントテンプレート
        self.event = {
            "request": {"userAttributes": {"email": "test@example.com"}},
            "response": {},
        }

    def test_no_domain_restrictions(self):
        """制限ドメインが設定されていない場合は全てのドメインを許可する"""
        # 環境変数を設定
        os.environ["ALLOWED_SIGN_UP_EMAIL_DOMAINS_STR"] = "[]"

        result = app.handler(self.event, {})
        # イベントがそのまま返されること
        self.assertEqual(result, self.event)

    def test_allowed_domain(self):
        """許可されたドメインからのサインアップは許可する"""
        # 環境変数を設定
        os.environ["ALLOWED_SIGN_UP_EMAIL_DOMAINS_STR"] = (
            '["example.com", "test.co.jp"]'
        )

        # 許可ドメインでテスト
        self.event["request"]["userAttributes"]["email"] = "user@example.com"
        result = app.handler(self.event, {})
        # イベントが修正されて返されること
        self.assertEqual(result, self.event)
        self.assertTrue(result["response"].get("autoConfirmUser"))

    def test_disallowed_domain(self):
        """許可されていないドメインからのサインアップは拒否する"""
        # 環境変数を設定
        os.environ["ALLOWED_SIGN_UP_EMAIL_DOMAINS_STR"] = (
            '["example.com", "test.co.jp"]'
        )

        # 不許可ドメインでテスト
        self.event["request"]["userAttributes"]["email"] = "user@different.com"

        # 例外が発生することを確認
        with self.assertRaises(Exception) as context:
            app.handler(self.event, {})

        # エラーメッセージに不許可ドメインと許可ドメインのリストが含まれていることを確認
        self.assertIn("different.com", str(context.exception))
        self.assertIn("example.com", str(context.exception))
        self.assertIn("test.co.jp", str(context.exception))

    def test_invalid_email_format(self):
        """不正な形式のメールアドレスの場合は例外が発生する"""
        # 環境変数を設定
        os.environ["ALLOWED_SIGN_UP_EMAIL_DOMAINS_STR"] = '["example.com"]'

        # 不正なメールアドレスでテスト
        self.event["request"]["userAttributes"]["email"] = "invalid-email"

        # 例外が発生することを確認
        with self.assertRaises(Exception) as context:
            app.handler(self.event, {})

        self.assertIn("Invalid email format", str(context.exception))

    def test_invalid_allowed_domains_format(self):
        """環境変数の形式が不正な場合は全てのドメインを許可する"""
        # 不正な環境変数を設定
        os.environ["ALLOWED_SIGN_UP_EMAIL_DOMAINS_STR"] = "invalid-json"

        result = app.handler(self.event, {})
        # イベントがそのまま返されること
        self.assertEqual(result, self.event)

    def test_missing_email(self):
        """メールアドレスが含まれていない場合はそのまま通過させる"""
        # 環境変数を設定
        os.environ["ALLOWED_SIGN_UP_EMAIL_DOMAINS_STR"] = '["example.com"]'

        # メールアドレスなしのイベント
        event_without_email = {"request": {"userAttributes": {}}, "response": {}}

        result = app.handler(event_without_email, {})
        # イベントがそのまま返されること
        self.assertEqual(result, event_without_email)

    def test_case_insensitive_domain(self):
        """ドメイン比較は大文字小文字を区別しない"""
        # 環境変数を設定（小文字）
        os.environ["ALLOWED_SIGN_UP_EMAIL_DOMAINS_STR"] = '["example.com"]'

        # 大文字のドメインでテスト
        self.event["request"]["userAttributes"]["email"] = "user@EXAMPLE.COM"

        result = app.handler(self.event, {})
        # イベントが修正されて返されること
        self.assertEqual(result, self.event)
        self.assertTrue(result["response"].get("autoConfirmUser"))


if __name__ == "__main__":
    unittest.main()

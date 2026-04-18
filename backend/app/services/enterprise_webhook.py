import time
import hmac
import base64
import hashlib
import xml.etree.ElementTree as ET
from typing import Optional
import httpx

from app.config import settings


class WecomCallback:
    def __init__(self, token: str, encoding_aes_key: str, corp_id: str):
        self.token = token
        self.encoding_aes_key = encoding_aes_key
        self.corp_id = corp_id
        self.encoding_aes_key += "="

    def verify_url(
        self, msg_signature: str, timestamp: str, nonce: str, echostr: str
    ) -> str:
        sort_list = sorted([self.token, timestamp, nonce, echostr])
        signature = hashlib.sha1("".join(sort_list).encode()).hexdigest()
        if signature != msg_signature:
            return ""
        return echostr

    def decrypt_message(
        self, msg_signature: str, timestamp: str, nonce: str, post_data: str
    ) -> Optional[dict]:
        try:
            xml_tree = ET.fromstring(post_data)
            encrypt = xml_tree.find("Encrypt").text
        except Exception:
            encrypt = post_data

        sort_list = sorted([self.token, timestamp, nonce, encrypt])
        signature = hashlib.sha1("".join(sort_list).encode()).hexdigest()
        if signature != msg_signature:
            return None

        try:
            import Crypto.Cipher as PKCS7
        except Exception:
            try:
                from Cryptodome.Cipher import PKCS7
            except Exception:
                return None

        cipher = PKCS7.new(base64.b64decode(self.encoding_aes_key))
        decrypted = cipher.decrypt(base64.b64decode(encrypt))
        content = decrypted[: -PKCS7.block_size]
        xml_content = content[16:].decode("utf-8")

        xml_tree = ET.fromstring(xml_content)
        return {
            "msg_type": xml_tree.find("MsgType").text,
            "content": xml_tree.find("Content").text
            if xml_tree.find("Content") is not None
            else "",
            "user_id": xml_tree.find("FromUserName").text,
            "agent_id": xml_tree.find("AgentID").text
            if xml_tree.find("AgentID") is not None
            else "",
        }

    def encrypt_message(self, reply_msg: str, nonce: str) -> str:
        try:
            import Crypto.Cipher as PKCS7
        except Exception:
            try:
                from Cryptodome.Cipher import PKCS7
            except Exception:
                return ""

        random_str = "".join(
            __import__("random").choices("abcdefghijklmnopqrstuvwxyz0123456789", k=16)
        )
        content = (
            random_str.encode()
            + len(reply_msg).to_bytes(4, "big")
            + reply_msg.encode()
            + self.corp_id.encode()
        )

        cipher = PKCS7.new(base64.b64decode(self.encoding_aes_key))
        encrypted = base64.b64encode(cipher.encrypt(content)).decode()

        timestamp = str(int(time.time()))
        sort_list = sorted([self.token, timestamp, nonce, encrypted])
        signature = hashlib.sha1("".join(sort_list).encode()).hexdigest()

        return f"<xml><Encrypt><![CDATA[{encrypted}]]></Encrypt><MsgSignature><![CDATA[{signature}]]></MsgSignature><TimeStamp>{timestamp}</TimeStamp><Nonce><![CDATA[{nonce}]]></Nonce></xml>"


class DingTalkCallback:
    def __init__(self, token: str, secret: str):
        self.token = token
        self.secret = secret

    def verify_url(
        self, signature: str, timestamp: str, nonce: str, echostr: str
    ) -> bool:
        string_to_sign = timestamp + "\n" + nonce + "\n" + echostr
        calc_signature = base64.b64encode(
            hmac.new(
                self.secret.encode("utf-8"),
                string_to_sign.encode("utf-8"),
                hashlib.sha256,
            ).digest()
        ).decode()
        return calc_signature == signature

    def verify_callback(
        self, signature: str, timestamp: str, nonce: str, post_data: str
    ) -> bool:
        calc_signature = base64.b64encode(
            hmac.new(
                self.secret.encode("utf-8"),
                (timestamp + nonce + post_data).encode("utf-8"),
                hashlib.sha256,
            ).digest()
        ).decode()
        return calc_signature == signature

    def parse_message(self, post_data: str) -> Optional[dict]:
        try:
            import json

            return json.loads(post_data)
        except Exception:
            return None


class FeishuCallback:
    def __init__(self, verification_token: str):
        self.verification_token = verification_token

    def verify_url(self, verification_token: str) -> bool:
        return verification_token == self.verification_token

    def parse_message(self, post_data: str) -> Optional[dict]:
        try:
            import json

            data = json.loads(post_data)
            msg_type = data.get("type", "")
            if msg_type == "text":
                return {
                    "msg_type": "text",
                    "content": data.get("content", {}).get("text", ""),
                    "user_id": data.get("sender_id", {}).get("user_id", ""),
                }
            return None
        except Exception:
            return None


class DingTalkBot:
    def __init__(self, webhook_url: str, secret: str = ""):
        self.webhook_url = webhook_url
        self.secret = secret or ""

    def _build_url(self) -> str:
        base = self.webhook_url
        if not self.secret:
            return base
        ts = str(int(time.time() * 1000))
        string_to_sign = ts + "\n" + self.secret
        signature = base64.b64encode(
            hmac.new(
                self.secret.encode("utf-8"),
                string_to_sign.encode("utf-8"),
                hashlib.sha256,
            ).digest()
        ).decode()
        sep = "&" if "?" in base else "?"
        return f"{base}{sep}timestamp={ts}&sign={signature}"

    def _sign(self) -> Optional[tuple]:
        if not self.secret:
            return None
        ts = str(int(time.time() * 1000))
        string_to_sign = ts + "\n" + self.secret
        sign = base64.b64encode(
            hmac.new(
                self.secret.encode("utf-8"),
                string_to_sign.encode("utf-8"),
                hashlib.sha256,
            ).digest()
        ).decode()
        return ts, sign

    async def send_text(self, content: str, at_all: bool = False) -> bool:
        payload = {
            "msgtype": "text",
            "text": {"content": content},
            "at": {"isAtAll": at_all},
        }
        url = self._build_url()
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, timeout=5.0)
        return resp.status_code == 200

    async def send_markdown(self, title: str, text: str) -> bool:
        payload = {
            "msgtype": "markdown",
            "markdown": {"title": title, "text": text},
        }
        url = self._build_url()
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, timeout=5.0)
        return resp.status_code == 200


class FeishuBot:
    def __init__(self, webhook_url: str):
        self.webhook_url = webhook_url

    async def send_text(self, content: str) -> bool:
        payload = {
            "msg_type": "text",
            "content": {"text": content},
        }
        async with httpx.AsyncClient() as client:
            resp = await client.post(self.webhook_url, json=payload, timeout=5.0)
        return resp.status_code == 200


class WeComBot:
    def __init__(self, webhook_url: str):
        self.webhook_url = webhook_url

    async def send_text(self, content: str) -> bool:
        payload = {
            "msgtype": "text",
            "text": {"content": content},
        }
        async with httpx.AsyncClient() as client:
            resp = await client.post(self.webhook_url, json=payload, timeout=5.0)
        return resp.status_code == 200

    async def send_markdown(self, content: str) -> bool:
        payload = {
            "msgtype": "markdown",
            "markdown": {"content": content},
        }
        async with httpx.AsyncClient() as client:
            resp = await client.post(self.webhook_url, json=payload, timeout=5.0)
        return resp.status_code == 200


class EnterpriseIntegration:
    def __init__(self):
        self.dingtalk = (
            DingTalkBot(settings.DINGTALK_WEBHOOK, settings.DINGTALK_SECRET)
            if settings.DINGTALK_WEBHOOK
            else None
        )
        self.feishu = (
            FeishuBot(settings.FEISHU_WEBHOOK) if settings.FEISHU_WEBHOOK else None
        )
        self.wecom = (
            WeComBot(settings.WECOM_WEBHOOK) if settings.WECOM_WEBHOOK else None
        )
        self.wecom_callback = (
            WecomCallback(
                settings.WECOM_TOKEN,
                settings.WECOM_ENCODING_AES_KEY,
                settings.WECOM_CORP_ID,
            )
            if settings.WECOM_TOKEN
            and settings.WECOM_ENCODING_AES_KEY
            and settings.WECOM_CORP_ID
            else None
        )
        self.dingtalk_callback = (
            DingTalkCallback(settings.DINGTALK_WEBHOOK, settings.DINGTALK_SECRET)
            if settings.DINGTALK_WEBHOOK and settings.DINGTALK_SECRET
            else None
        )
        self.feishu_callback = (
            FeishuCallback(settings.FEISHU_VERIFICATION_TOKEN)
            if settings.FEISHU_VERIFICATION_TOKEN
            else None
        )

    def is_platform_configured(self, platform: str) -> bool:
        plat = platform.lower()
        if plat == "dingtalk":
            return self.dingtalk is not None
        if plat == "feishu":
            return self.feishu is not None
        if plat == "wecom":
            return self.wecom is not None
        return False

    def is_wecom_callback_configured(self) -> bool:
        return self.wecom_callback is not None

    def is_dingtalk_callback_configured(self) -> bool:
        return self.dingtalk_callback is not None

    def is_feishu_callback_configured(self) -> bool:
        return self.feishu_callback is not None

    async def send_wecom_reply(
        self, user_id: str, content: str, agent_id: str = ""
    ) -> bool:
        if not self.wecom:
            return False
        return await self.wecom.send_text(content)

    async def send_dingtalk_reply(self, user_id: str, content: str) -> bool:
        if not self.dingtalk:
            return False
        return await self.dingtalk.send_text(content)

    async def send_feishu_reply(self, user_id: str, content: str) -> bool:
        if not self.feishu:
            return False
        return await self.feishu.send_text(content)

    async def send_answer(self, platform: str, answer: str, question: str = "") -> bool:
        content = f"Q: {question}\nA: {answer}" if question else answer
        plat = platform.lower()
        if plat == "dingtalk" and self.dingtalk:
            return await self.dingtalk.send_text(content)
        if plat == "feishu" and self.feishu:
            return await self.feishu.send_text(content)
        if plat == "wecom" and self.wecom:
            return await self.wecom.send_text(content)
        return False


# Singleton instance
enterprise_integration = EnterpriseIntegration()

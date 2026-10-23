import os
import smtplib
from email.message import EmailMessage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from be.app.core.config import settings

GMAIL_USER = os.getenv("GMAIL_USER", "").strip()
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "").strip()

_BRAND_HEADER = """
<div style="background: linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%);
            border-radius: 16px 16px 0 0; padding: 28px 32px; text-align: center;">
  <div style="display: inline-block;">
    <span style="font-family: 'Comic Sans MS', 'Chalkboard SE', cursive;
                 font-size: 28px; font-weight: 900; color: #ffffff;
                 letter-spacing: -0.5px;">
      speak<span style="color: #a5f3fc;">joy</span>
    </span>
    <span style="display: inline-block; background: #7c3aed; color: #e9d5ff;
                 font-family: sans-serif; font-size: 10px; font-weight: 700;
                 padding: 2px 7px; border-radius: 20px; margin-left: 6px;
                 vertical-align: middle; letter-spacing: 0.5px;">
      Kids VN
    </span>
  </div>
  <p style="margin: 4px 0 0; color: #e0f2fe; font-family: sans-serif;
             font-size: 12px; letter-spacing: 0.3px;">
    by <strong>Chainz</strong>
  </p>
</div>
"""

_BRAND_FOOTER = """
<div style="background: #f8fafc; border-radius: 0 0 16px 16px;
            padding: 20px 32px; text-align: center;
            border-top: 1px solid #e2e8f0;">
  <p style="margin: 0; font-family: sans-serif; font-size: 12px; color: #94a3b8;">
    © 2025 <strong>Chainz</strong> · SpeakJoy Kids VN
  </p>
  <p style="margin: 6px 0 0; font-family: sans-serif; font-size: 11px; color: #cbd5e1;">
    Nếu bạn không yêu cầu email này, vui lòng bỏ qua nhé.
  </p>
</div>
"""


def _smtp_from_email() -> str:
    return settings.smtp_effective_from_email or GMAIL_USER


def _smtp_username() -> str:
    return settings.smtp_effective_username or GMAIL_USER


def _smtp_password() -> str:
    return settings.smtp_effective_password or GMAIL_APP_PASSWORD


def _smtp_ready() -> bool:
    return bool(settings.smtp_effective_host and _smtp_from_email() and _smtp_password())


def _send_message(message: EmailMessage | MIMEMultipart) -> None:
    if not _smtp_ready():
        if settings.node_env.lower() != "production":
            return
        raise RuntimeError("SMTP is not configured")

    smtp_client = smtplib.SMTP_SSL if settings.smtp_use_ssl else smtplib.SMTP
    with smtp_client(settings.smtp_effective_host, settings.smtp_effective_port, timeout=15) as client:
        if settings.smtp_use_tls and not settings.smtp_use_ssl:
            client.starttls()
        username = _smtp_username()
        password = _smtp_password()
        if username:
            client.login(username, password)
        client.send_message(message)


def send_password_reset_email(email: str, reset_url: str) -> None:
    if not _smtp_ready():
        if settings.node_env.lower() != "production":
            print(f"Password reset link for {email}: {reset_url}")
            return
        raise RuntimeError("SMTP is not configured")

    html_body = f"""
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #f0f9ff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f0f9ff; padding: 32px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
             style="max-width: 520px; width: 100%; border-radius: 16px; overflow: hidden;
                    box-shadow: 0 4px 24px rgba(124,58,237,0.10);">
        <tr><td>{_BRAND_HEADER}</td></tr>
        <tr><td style="background: #ffffff; padding: 36px 32px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <span style="font-size: 52px;">🔑</span>
          </div>
          <h1 style="margin: 0 0 8px; font-family: 'Comic Sans MS', cursive;
                     font-size: 22px; color: #1e1b4b; text-align: center;">
            Đặt lại mật khẩu
          </h1>
          <p style="margin: 0 0 24px; font-family: sans-serif; font-size: 14px;
                    color: #64748b; text-align: center; line-height: 1.6;">
            Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.<br>
            Nhấn nút bên dưới để tiếp tục nhé.
          </p>
          <div style="text-align: center; margin: 0 0 28px;">
            <a href="{reset_url}"
               style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #06b6d4);
                      color: #ffffff; font-family: sans-serif; font-size: 16px;
                      font-weight: 700; text-decoration: none; padding: 14px 36px;
                      border-radius: 50px; letter-spacing: 0.3px;
                      box-shadow: 0 4px 14px rgba(124,58,237,0.35);">
              🚀 Đặt lại mật khẩu
            </a>
          </div>
          <div style="background: #fef9c3; border-left: 4px solid #facc15;
                      border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
            <p style="margin: 0; font-family: sans-serif; font-size: 13px; color: #854d0e;">
              ⏰ Đường link có hiệu lực trong <strong>30 phút</strong>.
            </p>
          </div>
          <p style="font-family: sans-serif; font-size: 12px; color: #94a3b8;
                    word-break: break-all; text-align: center;">
            Nếu nút không hoạt động, copy đường link này:<br>
            <a href="{reset_url}" style="color: #7c3aed;">{reset_url}</a>
          </p>
        </td></tr>
        <tr><td>{_BRAND_FOOTER}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""

    message = EmailMessage()
    message["Subject"] = "🔑 Đặt lại mật khẩu SpeakJoy"
    message["From"] = _smtp_from_email()
    message["To"] = email
    message.set_content(
        f"Dùng đường link này để đặt lại mật khẩu (hiệu lực 30 phút):\n\n{reset_url}\n\n"
        "Nếu bạn không yêu cầu, hãy bỏ qua email này."
    )
    message.add_alternative(html_body, subtype="html")
    _send_message(message)


def send_password_reset_otp_email(to_email: str, otp: str) -> None:
    if not _smtp_ready():
        if settings.node_env.lower() != "production":
            print(f"Password reset OTP for {to_email}: {otp}")
            return
        raise RuntimeError("SMTP is not configured")

    digit_boxes = "".join(
        f'<span style="display: inline-block; width: 44px; height: 52px; line-height: 52px;'
        f'background: #ede9fe; border: 2px solid #7c3aed; border-radius: 10px;'
        f'font-size: 26px; font-weight: 900; color: #4c1d95; text-align: center;'
        f'margin: 0 4px; font-family: monospace;">{digit}</span>'
        for digit in str(otp)
    )

    html_body = f"""
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #f0f9ff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f0f9ff; padding: 32px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
             style="max-width: 520px; width: 100%; border-radius: 16px; overflow: hidden;
                    box-shadow: 0 4px 24px rgba(124,58,237,0.10);">
        <tr><td>{_BRAND_HEADER}</td></tr>
        <tr><td style="background: #ffffff; padding: 36px 32px;">
          <div style="text-align: center; margin-bottom: 16px;">
            <span style="font-size: 52px;">✨</span>
          </div>
          <h1 style="margin: 0 0 8px; font-family: 'Comic Sans MS', cursive;
                     font-size: 22px; color: #1e1b4b; text-align: center;">
            Mã xác nhận đặt lại mật khẩu
          </h1>
          <p style="margin: 0 0 28px; font-family: sans-serif; font-size: 14px;
                    color: #64748b; text-align: center; line-height: 1.6;">
            Hãy nhập mã dưới đây vào SpeakJoy để tiếp tục đổi mật khẩu.
          </p>
          <div style="text-align: center; margin: 0 0 12px;">
            {digit_boxes}
          </div>
          <p style="text-align: center; font-family: sans-serif; font-size: 13px;
                    color: #94a3b8; margin: 0 0 24px;">
            ⏰ Mã hết hạn sau <strong style="color: #7c3aed;">10 phút</strong>
          </p>
          <div style="background: #fff7ed; border-left: 4px solid #fb923c;
                      border-radius: 8px; padding: 12px 16px;">
            <p style="margin: 0; font-family: sans-serif; font-size: 13px; color: #9a3412;">
              🔒 Đừng chia sẻ mã này với bất kỳ ai.
            </p>
          </div>
        </td></tr>
        <tr><td>{_BRAND_FOOTER}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""

    message = EmailMessage()
    message["Subject"] = "🔐 Mã OTP đặt lại mật khẩu SpeakJoy"
    message["From"] = _smtp_from_email()
    message["To"] = to_email
    message.set_content(
        f"Mã OTP đặt lại mật khẩu của bạn là: {otp}\n\n"
        "Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này."
    )
    message.add_alternative(html_body, subtype="html")
    _send_message(message)


def send_otp_email(to_email: str, otp: str, username: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "🌟 Mã xác nhận SpeakJoy của bạn"
    msg["From"] = _smtp_from_email()
    msg["To"] = to_email

    digit_boxes = "".join(
        f'<span style="display: inline-block; width: 44px; height: 52px; line-height: 52px;'
        f'background: #ede9fe; border: 2px solid #7c3aed; border-radius: 10px;'
        f'font-size: 26px; font-weight: 900; color: #4c1d95; text-align: center;'
        f'margin: 0 4px; font-family: monospace;">{digit}</span>'
        for digit in str(otp)
    )

    html = f"""
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #f0f9ff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f0f9ff; padding: 32px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
             style="max-width: 520px; width: 100%; border-radius: 16px; overflow: hidden;
                    box-shadow: 0 4px 24px rgba(124,58,237,0.10);">
        <tr><td>{_BRAND_HEADER}</td></tr>
        <tr><td style="background: #ffffff; padding: 36px 32px;">
          <div style="text-align: center; margin-bottom: 16px;">
            <span style="font-size: 52px;">✨</span>
          </div>
          <h1 style="margin: 0 0 8px; font-family: 'Comic Sans MS', cursive;
                     font-size: 22px; color: #1e1b4b; text-align: center;">
            Xin chào {username}! 👋
          </h1>
          <p style="margin: 0 0 28px; font-family: sans-serif; font-size: 14px;
                    color: #64748b; text-align: center; line-height: 1.6;">
            Đây là mã xác nhận để tiếp tục sử dụng SpeakJoy.
          </p>
          <div style="text-align: center; margin: 0 0 12px;">
            {digit_boxes}
          </div>
          <p style="text-align: center; font-family: sans-serif; font-size: 13px;
                    color: #94a3b8; margin: 0 0 24px;">
            ⏰ Mã hết hạn sau <strong style="color: #7c3aed;">5 phút</strong>
          </p>
        </td></tr>
        <tr><td>{_BRAND_FOOTER}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""

    msg.attach(MIMEText(html, "html", "utf-8"))
    _send_message(msg)

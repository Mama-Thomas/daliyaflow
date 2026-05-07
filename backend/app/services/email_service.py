"""Email sending.

Decision: chose AWS SES rather than Resend because we already depend on boto3
for S3 audio storage; SES needs no extra dependency, and the production AWS
footprint already includes SES IAM policies. The provider is pluggable via the
EMAIL_PROVIDER setting if we want to swap to Resend later.

Local dev / overnight builds with SEND_EMAILS=False log the rendered HTML
to stdout instead of sending. This is the documented decision.
"""
from __future__ import annotations

import html
import logging

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import settings

logger = logging.getLogger(__name__)


# ---------- Templates ----------

_BASE_STYLE = (
    "font-family: 'DM Sans', system-ui, sans-serif; "
    "color: #1A1F2E; line-height: 1.5;"
)


def _wrap(body_html: str, preheader: str = "") -> str:
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>DaliyaFlow</title>
  </head>
  <body style="margin:0; padding:24px; background:#F7F9FB; {_BASE_STYLE}">
    <span style="display:none; max-height:0; overflow:hidden;">{html.escape(preheader)}</span>
    <table role="presentation" align="center" width="100%" style="max-width:500px; background:#FFFFFF; border-radius:12px; padding:32px;">
      <tr>
        <td>
          <div style="font-family:'Fraunces', Georgia, serif; font-size:22px; color:#2B6CB0; font-weight:600; margin-bottom:24px;">
            DaliyaFlow
          </div>
          {body_html}
          <hr style="border:none; border-top:1px solid #DDE3E8; margin:32px 0 16px;" />
          <p style="font-size:12px; color:#8898A4; margin:0;">
            DaliyaFlow · AI handoffs and care continuity for senior care teams.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def _magic_link_html(*, user_name: str, link: str) -> str:
    safe_name = html.escape(user_name or "there")
    body = f"""
    <h1 style="font-family:'Fraunces', Georgia, serif; font-size:24px; color:#1A1F2E; margin:0 0 8px;">
      Hi {safe_name}, here is your sign-in link
    </h1>
    <p style="margin:0 0 24px; color:#4A5568;">
      Click the button below to sign in to DaliyaFlow.
    </p>
    <p style="margin:0 0 24px;">
      <a href="{link}" style="display:inline-block; background:#2B6CB0; color:#FFFFFF; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:500;">
        Sign in to DaliyaFlow
      </a>
    </p>
    <p style="font-size:13px; color:#8898A4; margin:0 0 8px;">
      This link expires in 15 minutes.
    </p>
    <p style="font-size:13px; color:#8898A4; margin:0;">
      If you did not request this, you can safely ignore this email.
    </p>
    """
    return _wrap(body, preheader="Your DaliyaFlow sign-in link")


def _flag_escalation_html(
    *,
    coordinator_name: str,
    client_name: str,
    flag_category: str,
    caregiver_name: str,
    shift_time: str,
    dashboard_link: str,
) -> str:
    safe = {
        "coord": html.escape(coordinator_name or "there"),
        "client": html.escape(client_name),
        "category": html.escape(flag_category),
        "caregiver": html.escape(caregiver_name),
        "when": html.escape(shift_time),
    }
    body = f"""
    <h1 style="font-family:'Fraunces', Georgia, serif; font-size:22px; color:#1A1F2E; margin:0 0 8px;">
      Hi {safe['coord']},
    </h1>
    <p style="margin:0 0 16px; color:#4A5568;">
      A risk flag was escalated for your attention.
    </p>
    <table role="presentation" cellpadding="6" style="border-collapse:collapse; margin:8px 0 24px;">
      <tr><td style="color:#8898A4; padding-right:12px;">Client</td><td style="color:#1A1F2E;">{safe['client']}</td></tr>
      <tr><td style="color:#8898A4; padding-right:12px;">Flag</td><td style="color:#C0392B; font-weight:500;">{safe['category']}</td></tr>
      <tr><td style="color:#8898A4; padding-right:12px;">Caregiver</td><td style="color:#1A1F2E;">{safe['caregiver']}</td></tr>
      <tr><td style="color:#8898A4; padding-right:12px;">Shift</td><td style="color:#1A1F2E;">{safe['when']}</td></tr>
    </table>
    <p style="margin:0 0 24px;">
      <a href="{dashboard_link}" style="display:inline-block; background:#2B6CB0; color:#FFFFFF; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:500;">
        Open coordinator dashboard
      </a>
    </p>
    """
    return _wrap(body, preheader=f"{safe['category']} escalated for {safe['client']}")


# ---------- Send ----------

def _send_console(*, to: str, subject: str, body_html: str) -> bool:
    logger.info(
        "email_console_logged",
        extra={
            "to_hash": _safe_hash(to),
            "subject": subject,
            "body_chars": len(body_html),
        },
    )
    return True


def _send_ses(*, to: str, subject: str, body_html: str) -> bool:
    try:
        client = boto3.client(
            "ses",
            region_name=settings.AWS_REGION,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID or None,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY or None,
        )
        client.send_email(
            Source=f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM_ADDRESS}>",
            Destination={"ToAddresses": [to]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {"Html": {"Data": body_html, "Charset": "UTF-8"}},
            },
        )
        return True
    except (BotoCoreError, ClientError):
        logger.exception("email_ses_failed", extra={"to_hash": _safe_hash(to)})
        return False


def _safe_hash(s: str) -> str:
    import hashlib
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:12]


def _send(*, to: str, subject: str, body_html: str) -> bool:
    if not settings.SEND_EMAILS or settings.EMAIL_PROVIDER == "console":
        return _send_console(to=to, subject=subject, body_html=body_html)
    if settings.EMAIL_PROVIDER == "ses":
        return _send_ses(to=to, subject=subject, body_html=body_html)
    logger.warning(
        "email_provider_unknown",
        extra={"provider": settings.EMAIL_PROVIDER},
    )
    return False


# ---------- Public API ----------

def send_magic_link(*, email: str, token: str, user_name: str) -> bool:
    link = f"{settings.APP_BASE_URL.rstrip('/')}/auth/magic-link/verify?token={token}"
    return _send(
        to=email,
        subject="Your DaliyaFlow sign-in link",
        body_html=_magic_link_html(user_name=user_name, link=link),
    )


def _invitation_html(
    *,
    first_name: str,
    invited_by_name: str,
    organization_name: str,
    role: str,
    link: str,
) -> str:
    safe = {
        "first": html.escape(first_name or "there"),
        "by": html.escape(invited_by_name),
        "org": html.escape(organization_name),
        "role": html.escape(role.replace("_", " ").title()),
    }
    body = f"""
    <h1 style="font-family:'Fraunces', Georgia, serif; font-size:24px; color:#1A1F2E; margin:0 0 8px;">
      Hi {safe['first']}, you've been invited to {safe['org']}
    </h1>
    <p style="margin:0 0 24px; color:#4A5568;">
      {safe['by']} has invited you to join {safe['org']} on DaliyaFlow as a
      {safe['role']}.
    </p>
    <p style="margin:0 0 24px;">
      <a href="{link}" style="display:inline-block; background:#2B6CB0; color:#FFFFFF; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:500;">
        Accept Invitation
      </a>
    </p>
    <p style="font-size:13px; color:#8898A4; margin:0 0 8px;">
      This invitation expires in 48 hours.
    </p>
    <p style="font-size:13px; color:#8898A4; margin:0;">
      If you did not expect this invitation, you can safely ignore this email.
    </p>
    """
    return _wrap(body, preheader=f"Join {safe['org']} on DaliyaFlow")


def send_invitation(
    *,
    email: str,
    first_name: str,
    invited_by_name: str,
    organization_name: str,
    role: str,
    token: str,
) -> bool:
    link = f"{settings.APP_BASE_URL.rstrip('/')}/auth/invite/{token}"
    subject = f"You've been invited to join {organization_name} on DaliyaFlow"
    return _send(
        to=email,
        subject=subject,
        body_html=_invitation_html(
            first_name=first_name,
            invited_by_name=invited_by_name,
            organization_name=organization_name,
            role=role,
            link=link,
        ),
    )


def _digest_html(
    *,
    organization_name: str,
    today: str,
    yesterday_stats: dict,
    today_outlook: dict,
    top_clients: list,
    dashboard_link: str,
) -> str:
    safe_org = html.escape(organization_name)
    safe_today = html.escape(today)

    rows_html = ""
    for c in top_clients:
        rows_html += (
            f"<tr><td style='padding:8px 0; border-bottom:1px solid #EEF2F5;'>"
            f"<strong>{html.escape(c.get('client_name', 'Client'))}</strong>"
            f"<br><span style='font-size:12px; color:#8898A4;'>"
            f"{html.escape(c.get('summary', ''))}</span></td></tr>"
        )

    body = f"""
    <h1 style="font-family:'Fraunces', Georgia, serif; font-size:22px; color:#1A1F2E; margin:0 0 4px;">
      Morning brief — {safe_today}
    </h1>
    <p style="font-size:14px; color:#4A5568; margin:0 0 24px;">
      {safe_org}
    </p>

    <h3 style="font-size:15px; color:#1A1F2E; margin:0 0 8px;">Yesterday</h3>
    <ul style="font-size:14px; color:#4A5568; padding-left:18px; margin:0 0 24px;">
      <li>{yesterday_stats.get('submissions', 0)} shift submissions</li>
      <li>{yesterday_stats.get('new_high_flags', 0)} new high-severity flags</li>
      <li>{yesterday_stats.get('flags_confirmed', 0)} flags confirmed,
          {yesterday_stats.get('flags_dismissed', 0)} dismissed</li>
      <li>{yesterday_stats.get('shifts_at_risk', 0)} at-risk shifts</li>
    </ul>

    <h3 style="font-size:15px; color:#1A1F2E; margin:0 0 8px;">Today</h3>
    <ul style="font-size:14px; color:#4A5568; padding-left:18px; margin:0 0 24px;">
      <li>{today_outlook.get('shifts_scheduled', 0)} shifts scheduled</li>
      <li>{today_outlook.get('shifts_at_risk', 0)} already at risk</li>
      <li>{today_outlook.get('clients_with_high_flags', 0)} clients with open high-severity flags</li>
    </ul>

    <h3 style="font-size:15px; color:#1A1F2E; margin:0 0 8px;">Needs attention</h3>
    <table role="presentation" width="100%" style="border-collapse:collapse; margin-bottom:24px;">
      {rows_html or '<tr><td style="padding:8px 0; color:#8898A4;">No urgent items.</td></tr>'}
    </table>

    <p style="margin:0 0 24px;">
      <a href="{dashboard_link}" style="display:inline-block; background:#2B6CB0; color:#FFFFFF; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:500;">
        Open Dashboard
      </a>
    </p>
    <p style="font-size:12px; color:#8898A4; margin:0;">
      You're receiving this because you're a coordinator at {safe_org}.
      Manage preferences in your DaliyaFlow profile.
    </p>
    """
    return _wrap(body, preheader=f"DaliyaFlow morning brief — {safe_today}")


def send_morning_digest(
    *,
    email: str,
    organization_name: str,
    today: str,
    yesterday_stats: dict,
    today_outlook: dict,
    top_clients: list,
) -> bool:
    subject = f"DaliyaFlow Morning Brief — {organization_name} — {today}"
    return _send(
        to=email,
        subject=subject,
        body_html=_digest_html(
            organization_name=organization_name,
            today=today,
            yesterday_stats=yesterday_stats,
            today_outlook=today_outlook,
            top_clients=top_clients,
            dashboard_link=f"{settings.APP_BASE_URL.rstrip('/')}/coordinator/dashboard",
        ),
    )


def send_flag_escalation_notification(
    *,
    coordinator_email: str,
    coordinator_name: str,
    client_name: str,
    flag_category: str,
    caregiver_name: str,
    shift_time: str,
) -> bool:
    subject = f"DaliyaFlow Alert: {flag_category} flagged for {client_name}"
    return _send(
        to=coordinator_email,
        subject=subject,
        body_html=_flag_escalation_html(
            coordinator_name=coordinator_name,
            client_name=client_name,
            flag_category=flag_category,
            caregiver_name=caregiver_name,
            shift_time=shift_time,
            dashboard_link=f"{settings.APP_BASE_URL.rstrip('/')}/coordinator/dashboard",
        ),
    )

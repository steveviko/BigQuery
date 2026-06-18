import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

# Color mapping for release note types
TYPE_COLORS = {
    'feature': '#10b981',        # Green
    'announcement': '#3b82f6',   # Blue
    'breaking': '#ef4444',       # Red
    'change': '#f59e0b',         # Orange
    'issue': '#8b5cf6'           # Purple
}
DEFAULT_COLOR = '#64748b'        # Slate Gray

def is_email_configured():
    """Verify if the necessary SMTP settings are defined in the environment variables."""
    required_vars = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'NOTIFICATION_EMAIL_TO']
    missing = [var for var in required_vars if not os.environ.get(var)]
    
    if missing:
        logger.warning(f"SMTP configuration is incomplete. Missing variables: {', '.join(missing)}")
        return False
    return True

def build_html_email(notes):
    """Generate a high-quality, responsive HTML template for release notes email notifications."""
    notes_list_html = ""
    
    for note in notes:
        note_type = note.get('type', 'Update')
        color = TYPE_COLORS.get(note_type.lower(), DEFAULT_COLOR)
        
        # Format the item
        notes_list_html += f"""
        <div style="margin-bottom: 24px; padding: 20px; border-radius: 8px; background-color: #1e293b; border-left: 4px solid {color}; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                <span style="display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; background-color: {color}1a; color: {color}; border: 1px solid {color}33;">
                    {note_type}
                </span>
                <span style="font-size: 12px; color: #94a3b8; font-weight: 500;">
                    {note.get('date', 'Unknown Date')}
                </span>
            </div>
            <div style="font-size: 14px; line-height: 1.6; color: #cbd5e1; margin-bottom: 12px;">
                {note.get('content_html', '')}
            </div>
            {"<div style='margin-top: 12px;'><a href='" + note.get('link') + "' style='display: inline-flex; align-items: center; font-size: 13px; color: #3b82f6; text-decoration: none; font-weight: 600;' target='_blank'>View Official Release Log &rarr;</a></div>" if note.get('link') else ""}
        </div>
        """
        
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New BigQuery Release Notes</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc;">
        <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">
            <!-- Header -->
            <div style="text-align: center; padding: 24px 0; border-bottom: 1px solid #334155; margin-bottom: 24px;">
                <div style="display: inline-block; padding: 10px; border-radius: 8px; background-color: #3b82f61a; border: 1px solid #3b82f633; margin-bottom: 12px;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;">
                        <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                        <path d="M3 5V19A9 3 0 0 0 21 19V5"></path>
                        <path d="M3 12A9 3 0 0 0 21 12"></path>
                    </svg>
                </div>
                <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.025em; color: #f8fafc;">BigQuery Release Notes Explorer</h1>
                <p style="margin: 4px 0 0 0; font-size: 14px; color: #64748b;">New updates have been detected in the feed</p>
            </div>
            
            <!-- Notes List -->
            <div>
                {notes_list_html}
            </div>
            
            <!-- Footer -->
            <div style="text-align: center; padding-top: 24px; border-top: 1px solid #334155; margin-top: 32px; font-size: 12px; color: #64748b;">
                <p style="margin: 0 0 8px 0;">This is an automated notification from your BigQuery Release Notes Explorer.</p>
                <p style="margin: 0;">Configure your notification settings in the local <code>.env</code> file.</p>
            </div>
        </div>
    </body>
    </html>
    """
    return html_body

def send_email_notification(notes):
    """Send an HTML email notification containing the list of new release notes."""
    if not notes:
        logger.info("No new notes to email.")
        return False
        
    if not is_email_configured():
        logger.info("Email notifications not sent due to missing SMTP configuration.")
        return False

    smtp_host = os.environ.get('SMTP_HOST')
    try:
        smtp_port = int(os.environ.get('SMTP_PORT', 587))
    except ValueError:
        smtp_port = 587
        
    smtp_user = os.environ.get('SMTP_USER')
    smtp_password = os.environ.get('SMTP_PASSWORD')
    smtp_use_tls = os.environ.get('SMTP_USE_TLS', 'true').lower() == 'true'
    smtp_use_ssl = os.environ.get('SMTP_USE_SSL', 'false').lower() == 'true'
    to_email = os.environ.get('NOTIFICATION_EMAIL_TO')
    from_email = os.environ.get('NOTIFICATION_EMAIL_FROM', smtp_user)
    
    logger.info(f"Preparing to send email to {to_email} via {smtp_host}:{smtp_port}")
    
    # Create email message
    msg = MIMEMultipart('alternative')
    msg['Subject'] = f"BigQuery Updates: {len(notes)} New Release Note{'s' if len(notes) > 1 else ''}"
    msg['From'] = from_email
    msg['To'] = to_email
    
    # Plain text fallback
    text_content = "New BigQuery Release Notes:\n\n"
    for note in notes:
        text_content += f"- [{note.get('type', 'Update')}] {note.get('date')}: {note.get('content_text')}\n"
        if note.get('link'):
            text_content += f"  Link: {note.get('link')}\n"
        text_content += "\n"
        
    # HTML content
    html_content = build_html_email(notes)
    
    msg.attach(MIMEText(text_content, 'plain'))
    msg.attach(MIMEText(html_content, 'html'))
    
    try:
        # Establish connection
        if smtp_use_ssl:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15)
        else:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=15)
            
        if smtp_use_tls and not smtp_use_ssl:
            server.ehlo()
            server.starttls()
            server.ehlo()
            
        if smtp_password:
            server.login(smtp_user, smtp_password)
            
        server.sendmail(from_email, to_email, msg.as_string())
        server.quit()
        logger.info("Email notification sent successfully.")
        return True
    except Exception as e:
        logger.error(f"Failed to send email notification: {e}")
        return False

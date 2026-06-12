"""
Notification Service Lambda (Python).

Handles sending and managing notifications:
  - sendNotification: send an email/push/sms notification
  - getNotification: retrieve a notification by ID
  - listNotifications: list notifications for a user

Standard AWS Lambda handler — no simulator-specific code.
"""

import uuid
from datetime import datetime, timezone

# In-memory notification store
notifications = {}


def handler(event, context):
    """Main Lambda handler — routes based on payload.operation."""
    payload = event.get("payload", {})
    operation = payload.get("operation", "")
    data = payload.get("payload", payload)

    print(f"[NotificationLambda] Processing: {operation}", flush=True)

    handlers = {
        "sendNotification": send_notification,
        "getNotification": get_notification,
        "listNotifications": list_notifications,
    }

    handler_fn = handlers.get(operation)
    if not handler_fn:
        return {"error": f"Unknown operation: {operation}"}

    return handler_fn(data, event)


def send_notification(data, event):
    """Send a notification (email, push, or sms)."""
    user_id = data.get("userId")
    channel = data.get("channel", "email")  # email | push | sms
    subject = data.get("subject", "")
    message = data.get("message", "")

    if not user_id:
        return {"error": "userId is required"}
    if not message:
        return {"error": "message is required"}
    if channel not in ("email", "push", "sms"):
        return {"error": f"Invalid channel: {channel}. Use email, push, or sms"}

    notification_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    notification = {
        "id": notification_id,
        "userId": user_id,
        "channel": channel,
        "subject": subject,
        "message": message,
        "status": "SENT",
        "sentAt": now,
        "createdAt": now,
    }

    # Store it
    notifications[notification_id] = notification

    # Simulate sending based on channel
    if channel == "email":
        print(f"[NotificationLambda] 📧 Email to {user_id}: {subject}", flush=True)
    elif channel == "push":
        print(f"[NotificationLambda] 📱 Push to {user_id}: {message[:50]}", flush=True)
    elif channel == "sms":
        print(f"[NotificationLambda] 💬 SMS to {user_id}: {message[:50]}", flush=True)

    return notification


def get_notification(data, event):
    """Get a notification by ID."""
    notification_id = data.get("id") or data.get("notificationId")
    if not notification_id:
        return {"error": "id is required"}

    notification = notifications.get(notification_id)
    if not notification:
        return {"error": f"Notification {notification_id} not found"}

    return notification


def list_notifications(data, event):
    """List notifications for a user."""
    user_id = data.get("userId")
    if not user_id:
        return {"error": "userId is required"}

    user_notifications = [
        n for n in notifications.values()
        if n["userId"] == user_id
    ]

    # Sort by creation time, newest first
    user_notifications.sort(key=lambda n: n["createdAt"], reverse=True)

    limit = data.get("limit", 20)
    return {"items": user_notifications[:limit]}

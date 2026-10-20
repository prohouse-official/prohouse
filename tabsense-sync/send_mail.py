# يرسل تقريرين عبداللطيف جميل ليوم واحد بالإيميل (Gmail SMTP) — نفس الملفين بدون تعديل.
# الاستخدام: python3 -I send_mail.py YYYY-MM-DD <summary.pdf> <summary name> <orders.xlsx> <orders name>
# من البيئة: MAIL_FROM, MAIL_TO (مفصولة بفاصلة), GMAIL_APP_PASSWORD
# المستودع عام: ما يطبع الإيميلات ولا كلمة المرور.
import os
import smtplib
import sys
from datetime import date
from email.message import EmailMessage

iso, summary_path, summary_name, orders_path, orders_name = sys.argv[1:6]
sender = os.environ["MAIL_FROM"].strip()
to = [x.strip() for x in os.environ["MAIL_TO"].split(",") if x.strip()]
if not to:
    sys.exit("no recipients")

d = date.fromisoformat(iso)

msg = EmailMessage()
# العنوان والنص نفس اللي بيبعته حسن يدوي: «Orders (1 oct)» ونص عربي بتاريخ اليوم
msg["Subject"] = orders_name.rsplit(".", 1)[0]
msg["From"] = f"Pro House <{sender}>"
msg["To"] = ", ".join(to)
msg.set_content(
    "تحية طيبة\n"
    f"مرفق التقرير اليومي لتاريخ {d.day}/{d.month}/{d.year}\n"
    "مع أطيب التحيات\n"
    "حسن.\n"
)
with open(summary_path, "rb") as f:
    msg.add_attachment(f.read(), maintype="application", subtype="pdf", filename=summary_name)
with open(orders_path, "rb") as f:
    msg.add_attachment(f.read(), maintype="application",
                       subtype="vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=orders_name)

with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=60) as s:
    s.login(sender, os.environ["GMAIL_APP_PASSWORD"].replace(" ", ""))
    s.send_message(msg)
print(f"sent to {len(to)}")

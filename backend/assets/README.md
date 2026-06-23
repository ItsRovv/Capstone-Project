# Clinic Assets

## Logo for Email Templates

**Important:** Gmail (and most email clients) block base64 images for security.
Your logo must be hosted on a **public URL** to appear in OTP emails.

### Steps to set your logo in emails

1. Upload your logo to a free image host:
   - Go to [imgur.com](https://imgur.com) and upload your logo
   - Right-click the uploaded image → **"Copy image address"**
   - The URL should end in `.png` or `.jpg`

2. Open `backend/.env` and add:
   ```env
   CLINIC_LOGO_URL=https://imgur.com/a/25YTMo8
   ```

3. Restart the backend server.

The logo will now appear in all OTP emails (password reset & account verification).

**Tip:** Use a square image (1:1 ratio) for best results in the circular email header.

---

### Local logo file (optional)

You can still keep a copy of your logo in this folder (`logo.png`, `logo.jpg`, or `logo.jpeg`)
for other uses like PDF generation or the web app frontend.

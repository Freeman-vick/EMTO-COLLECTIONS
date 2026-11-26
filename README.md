# EMTO COLLECTIONS website

## First-time admin setup

This project now includes a small Node.js server with password-protected admin routes. Node.js is required; no packages need to be installed.

1. Open a PowerShell terminal in this project folder.
2. Run `powershell -ExecutionPolicy Bypass -File .\setup-admin.ps1` and create a password of at least 16 characters. The setup script saves it in `.env.local`, which is excluded from Git and never served by the website.
3. Start the shop with `node .\server.js`.
4. Open `http://127.0.0.1:3000` for the customer shop, then choose **Admin sign in** in the footer. Sign in with the password you created.
5. Add each product with its collection, actual price, stock quantity, description, and photo. Product changes are saved on the server and are shown on the public product pages.
6. Customers can add in-stock items to their bag and send an order request to WhatsApp. Final availability and delivery are confirmed directly with the customer.

Keep the terminal running while using the site. Stop the server with Ctrl+C. The previous VS Code Live Server address on port 5500 does not provide the protected admin API; use the Node server at port 3000 for inventory changes.

## Deploying to Vercel

The local Node server stores inventory on disk and cannot be deployed as a persistent Vercel server. Vercel uses serverless API functions instead; this project includes those functions and stores inventory in Neon Postgres and product photos in Vercel Blob.

1. Push the project to GitHub and import the repository in Vercel.
2. Create a Neon Postgres database. In the Neon SQL Editor, run the contents of [`schema.sql`](./schema.sql).
3. In the Vercel project, create and connect a Blob store. The integration supplies `BLOB_READ_WRITE_TOKEN` to the deployment.
4. Add these environment variables in **Vercel → Project Settings → Environment Variables**:
   - `DATABASE_URL`: the connection string from Neon.
   - `EMTO_ADMIN_PASSWORD`: a private password of at least 16 characters.
   - `EMTO_SESSION_SECRET`: a private random value of at least 32 characters. Generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`.
5. Redeploy after setting the variables, then visit `https://your-domain/login.html`.
6. To move existing products, download a backup from the local admin page, then use **Restore backup** on the deployed admin page. Uploaded photos are copied to Vercel Blob as part of the restore.

Keep the Neon connection string, Blob token, admin password, and session secret private. Never commit them to Git. Admin sessions expire after eight hours. Public hosting must use HTTPS.

## Local development and security

For local use, the Node server continues to store inventory in `data/inventory.json`. Vercel deployments instead use Neon and Blob, so changes made in one environment do not automatically appear in the other.

The admin panel and its APIs require server-side sign-in. Vercel sessions use signed HttpOnly/SameSite cookies and expire after eight hours; failed sign-in attempts are rate limited using Neon. Locally, inventory is saved in `data/inventory.json`; keep regular downloads from **Download backup**. Do not share `.env.local` or publish it.

The local server listens on this computer only by default. Do not expose it directly to the internet. Card or M-Pesa payments are not connected; orders currently go through WhatsApp.

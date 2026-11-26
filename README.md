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

## Security and deployment

The admin panel is served only after server-side sign-in. Passwords are checked on the server, sessions use HttpOnly/SameSite cookies and expire after eight hours, and repeated failed attempts are rate limited. Inventory is saved in `data/inventory.json`; keep regular downloads from **Download backup**. Do not share `.env.local` or publish it.

The server listens on this computer only by default. To run the shop publicly, it must be deployed to a trusted Node.js host behind HTTPS, with `EMTO_ADMIN_PASSWORD` configured as a private hosting environment variable. Do not expose the local development server directly to the internet. Card or M-Pesa payments are not connected; orders currently go through WhatsApp.

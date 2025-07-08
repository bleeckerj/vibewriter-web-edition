# Deploying Vibewriter Web Edition on Digital Ocean

This guide explains how to set up, build, and run the Vibewriter web app on a Digital Ocean server using Node.js, PM2, and nginx.

---

## 1. Directory Structure

- `/var/www/vibewriter/` — Project root
- `/var/www/vibewriter/server/` — Node.js backend (Express)
- `/var/www/vibewriter/vanilla/` — Static frontend files (HTML, CSS, JS)

---

## 2. Prerequisites
- Node.js (v18+ recommended for best compatibility)
- npm
- PM2 (`npm install -g pm2`)
- nginx (for serving static files and reverse proxy)

---

## 3. Install Dependencies

```sh
cd /var/www/vibewriter
npm install
cd server
npm install
```

---

## 4. Build Tailwind CSS

Before starting the server, build the Tailwind CSS:

```sh
cd /var/www/vibewriter
npx postcss vanilla/tailwind.css -o vanilla/tailwind-build.css
```

Or use the npm script:

```sh
npm run build:css
```

---

## 5. Start the Backend with PM2

From the project root:

```sh
pm run start
# or, directly:
pm2 start server/index.js --name vibewriter
```

- PM2 will keep your backend running and restart it on crashes.
- To see status: `pm2 list`
- To view logs: `pm2 logs vibewriter`
- To restart: `pm2 restart vibewriter`

---

## 6. (Optional) Automate CSS Build on Start

Create a shell script (e.g. `start-server.sh`):

```sh
#!/bin/bash
npx postcss vanilla/tailwind.css -o vanilla/tailwind-build.css
cd server
node index.js
```

Make it executable:

```sh
chmod +x start-server.sh
```

Start with PM2:

```sh
pm2 start ./start-server.sh --name vibewriter
```

---

## 7. nginx Setup (Frontend)

- nginx serves static files from `/var/www/vibewriter/vanilla/`.
- nginx can reverse proxy API/backend requests to your Node.js server (e.g., `localhost:3000`).
- To reload nginx after config changes:

```sh
sudo systemctl reload nginx
```

---

## 8. Useful Commands

- **Deploy new code:**
  - `git pull` (or `scp` files)
  - `npm install` (if dependencies changed)
  - `npm run build:css` (if frontend changed)
  - `pm2 restart vibewriter`
- **Check PM2 status:** `pm2 list`
- **View logs:** `pm2 logs vibewriter`
- **SSH to server:** `ssh youruser@your.server.ip`
- **Copy files:** `scp localfile youruser@your.server.ip:/var/www/vibewriter/vanilla/`

---

## 9. Troubleshooting

- If CSS changes don't show up, rebuild with `npm run build:css`.
- If backend changes don't show up, restart PM2: `pm2 restart vibewriter`.
- If `scp` hangs, check SSH/firewall/network.
- If you get 404s for pages, make sure the files exist in `vanilla/` and nginx is serving the correct directory.

---


## 10. Firebase Service Account JSON (Backend Secret)

- The Firebase service account JSON file (e.g., `vibewriter-xxxx-firebase-adminsdk-xxxx.json`) is a private key you download from the Firebase Console under Project Settings > Service Accounts > Generate new private key.
- This file is required for your backend (Node.js/Express) to verify Firebase Auth tokens, manage users, and access Firestore, Storage, etc.
- **Never commit this file to git or share it publicly.**
- Place it in a secure location on your server, such as `/var/www/vibewriter/server/`.
- Reference it in your backend code, for example:
  ```js
  const serviceAccount = require('./vibewriter-xxxx-firebase-adminsdk-xxxx.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // ...other config
  });
  ```
- If the file is ever leaked, revoke it and generate a new one in the Firebase Console.

## 11. Security
- Never commit `.env` files or secrets to git.
- Use strong passwords and SSH keys.
- Keep your server and dependencies up to date.

---

For more help, see the main README or contact the maintainer.

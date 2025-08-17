
TOW DISPATCH — REALTIME GPS (NO-CODE SETUP)
===========================================

WHAT YOU'RE GETTING
-------------------
• A ready-to-host web app: dispatcher dashboard + driver panel + live GPS.
• Uses Firebase (Auth + Realtime Database) and free Leaflet maps.
• No build step. Just host these files over HTTPS.

STEP 1 — CREATE A FREE FIREBASE PROJECT
---------------------------------------
1) Go to https://console.firebase.google.com and create a project.
2) In 'Build → Authentication → Sign-in method', enable 'Email/Password'.
3) In 'Build → Realtime Database', create a database (Production mode).
4) In 'Build → Realtime Database → Rules', paste the contents of database.rules.json (from this folder) and Publish.
5) In 'Project settings → General → Your apps', add a Web app.
   - Copy the config object (apiKey, authDomain, etc).
   - Open firebase-config.js and REPLACE the placeholder values with your config.

IMPORTANT: Authentication → Settings → Authorized domains
---------------------------------------------------------
Add your hosting domain here (e.g., *.web.app if you use Firebase Hosting, or *.netlify.app if Netlify).

STEP 2a — HOST ON FIREBASE (FREE LINK like yourproject.web.app)
---------------------------------------------------------------
• In Firebase console → Hosting → Get started → Choose 'Drag and drop' (no CLI).
• Drag the *contents* of this folder (index.html, app.js, styles.css, firebase-config.js) into the drop zone.
• After deploy, you get a https://YOURNAME.web.app link.
• If 'Drag and drop' is unavailable in your console, use the CLI method:
    - Install Node.js (only once), then in a Terminal:
      npm i -g firebase-tools
      firebase login
      firebase init hosting   (select the project, choose 'dist public folder' = this folder, single-page app = 'N')
      firebase deploy
  But the drag-and-drop pane is the easiest and usually available.

STEP 2b — HOST ON NETLIFY (also free, super easy)
--------------------------------------------------
• Go to https://app.netlify.com/drop and drag the folder there.
• Netlify gives you a https://SITENAME.netlify.app link.
• In Firebase console → Authentication → Authorized domains, add SITENAME.netlify.app.

STEP 3 — CREATE ACCOUNTS
------------------------
• Open your site link.
• Create your dispatcher account by checking 'Dispatcher account' when signing up.
• For drivers: sign up without 'Dispatcher account' checked.
• Drivers use 'Driver' tab to Start/Stop sharing location. Dispatchers use 'Dashboard'.

NOTES
-----
• GPS requires HTTPS (both Firebase and Netlify provide it).
• Some phones need to keep the page open or screen on for continuous GPS.
• You can customize labels and services in index.html (the <select> for 'Service').

SUPPORT
-------
If anything is confusing, send me your Firebase project id and I’ll adjust instructions.

# Nova Backend Setup

`Nova` stands for `Network for Organization, Vision, and Academics`.

This student dashboard now supports:

- `Appwrite` as backend database and auth provider
- manual `PDF links` for uploaded files
- a browser-side `Admin Login` panel for managing content
- a protected `Uploader` page for admin or uploader users only

## Current status

Appwrite is connected in [config.js](C:/Users/Admin/Desktop/clgapp/config.js) with:

- endpoint: `https://fra.cloud.appwrite.io/v1`
- project ID: `69f36044003919260400`
- database ID: `nova`

## Appwrite setup

Create one Appwrite database:

- `nova`

Create these tables:

- `subjects`
- `chapters`
- `assignments`
- `uploads`
- `site_settings`

The dashboard reads:

- subject cards from `subjects`
- chapter cards from `chapters`
- assignment cards from `assignments`
- notices, chapter cards, and daily topic lists from `uploads`
- hero text from `site_settings`

## Required columns

`subjects`

- `slug` string
- `name` string
- `accent` string
- `description` string
- `display_order` integer

`chapters`

- `subject` string
- `stream` string
- `chapter_name` string
- `chapter_order` integer

`assignments`

- `subject` string
- `chapter` string
- `title` string
- `deadline` datetime
- `question_link` string
- `solution_link` string

`uploads`

- `subject` string
- `stream` string
- `chapter` string
- `topic` string
- `notice_title` string
- `pdf_link` string
- `uploaded_on` datetime

`site_settings`

- `hero_eyebrow` string
- `hero_title` string
- `hero_copy` string

## Platform setup

In Appwrite, add Web platforms for the hosts where the app runs.

Examples:

- `localhost`
- `tirthpatel3118-del.github.io`

Do not use `file:///...` to open the app. Run it through a web server or GitHub Pages.

## Upload flow

When you submit the upload form:

1. You paste your PDF link.
2. The upload record is saved to Appwrite.
3. The notice board updates automatically.
4. Subject, theory/practical, chapter, and topic pages update from the same data source.

## Admin login

Admin login uses `Appwrite Auth` with email and password.

Set your admin Appwrite user ID in [config.js](C:/Users/Admin/Desktop/clgapp/config.js):

- `adminUserId`

Only the signed-in Appwrite user with that ID can open the full admin panel.

Admin can manage:

- subjects
- chapters
- assignments
- uploads
- hero section text
- edit and delete records after saving

## Uploader access

The public upload page has been removed.

Now uploads are only available inside the protected `Uploader` page.

Access rules:

- `adminUserId` always has access
- any ID inside `uploaderUserIds` also gets access

Set uploader IDs in [config.js](C:/Users/Admin/Desktop/clgapp/config.js):

```js
uploaderUserIds: [
  "appwrite-user-id-1",
  "appwrite-user-id-2",
],
```

## Deployment note

For GitHub Pages, confirm that these files are published:

- `index.html`
- `styles.css`
- `script.js`
- `config.js`

If login fails after deployment, first check:

- Appwrite endpoint is the region endpoint for your project
- Web platform hostname is added correctly
- Email/password auth is enabled
- table permissions allow the logged-in browser user to read and write

## Android APK

This project now includes a Capacitor Android wrapper so the same app can be built as an APK.

Files added for Android packaging:

- [capacitor.config.json](C:/Users/Admin/Desktop/clgapp/capacitor.config.json)
- [prepare-web.mjs](C:/Users/Admin/Desktop/clgapp/prepare-web.mjs)
- [package.json](C:/Users/Admin/Desktop/clgapp/package.json)
- `android/`

Useful commands:

```bash
npm run build:web
npm run android:sync
npm run android:open
```

GitHub Actions:

- The workflow at `.github/workflows/android-apk.yml` builds `app-debug.apk`
- Push the project to GitHub, then open `Actions`
- Run `Build Android APK`
- Download the `nova-debug-apk` artifact from the completed workflow

Build flow:

1. `npm run build:web` copies `index.html`, `styles.css`, `script.js`, and `config.js` into `web/`
2. `npm run android:sync` pushes that bundle into the Android project
3. Open the `android` project in Android Studio
4. Let Android Studio install the Android SDK if prompted
5. Build `debug` or `release` APK from Android Studio

Note:

- Opening the app with `file:///...` will not work for auth
- The Android wrapper uses a WebView and keeps the app behavior as close as possible to the current web version

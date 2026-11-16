# Studio Sign-Up

A free class sign-up page for a small Pilates studio. Clients open one link, type their first name, and tap a spot. No accounts, no app to install.

- Sign-up can open at a set time, so nobody has to race a surprise text.
- Full classes have a waitlist. When someone cancels, the next person moves up automatically.
- The instructor (PIN-protected) adds classes, repeats last week in one tap, adds or removes names, and copies a ready-made text for clients.

## Files

- `index.html`, `app.css`, `app.js`: the page.
- `core.js`: the sign-up rules, shared by the page and the backend.
- `backend/Code.gs`: the free backend (Google Apps Script + a Google Sheet). It contains a copy of `core.js`.

## Demo mode

With `apiUrl` empty in `index.html`, the page runs as a demo: sample classes, and sign-ups are saved only on that device. Instructor PIN is `1234`.

## Going live (about 10 minutes, free)

1. Create a new Google Sheet (any Google account; the instructor's is best so she owns the data).
2. In the Sheet: **Extensions → Apps Script**. Delete what is there and paste in all of `backend/Code.gs`.
3. Change `ADMIN_PIN` at the top to the instructor's PIN.
4. **Project Settings** (gear icon): set the time zone to the studio's.
5. **Deploy → New deployment → Web app**. Execute as: **Me**. Who has access: **Anyone**. Deploy, approve the permission prompt, and copy the web app URL.
6. Paste that URL into `apiUrl` in `index.html`, and set `studioName`.
7. Host the folder anywhere static and free (GitHub Pages works). Send clients the link.

The Sheet gets a `Roster` tab that always shows who is in each class, and a `Data` tab the app uses (leave that one alone).

If `Code.gs` is edited later, use **Deploy → Manage deployments → Edit → New version** so the same URL keeps working.

## Good to know

- Clients are remembered by their phone's browser. To cancel from a different device, they ask the instructor, who can remove them.
- The page does not send notifications. Someone who moves up from the waitlist sees it when they open the link.

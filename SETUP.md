# Setup: Google Cloud steps

Reno Logbook stores a project's data in the homeowner's own Google Drive — a
spreadsheet for the budget and record, a doc for the human-readable Command
Center report, and a folder for uploaded invoices and photos. None of that
needs a server-side database connection, but Google does need to know about
this app before it'll let anyone sign in or touch their Drive. These are the
steps you click through yourself, once, in the Google Cloud Console.

## 1. Create a Google Cloud project

Go to [console.cloud.google.com](https://console.cloud.google.com), and from
the project picker at the top, create a new project (or pick an existing one
you want to use for this). Give it a name like "Reno Logbook".

## 2. Enable the APIs

Go to **APIs & Services → Library** and enable each of these (search the
name, open it, click Enable):

- **Google Drive API**
- **Google Sheets API**
- **Google Docs API**
- **Google Picker API**

## 3. Configure the OAuth consent screen

Go to **APIs & Services → OAuth consent screen**.

- User type: **External**.
- App name: "Reno Logbook" (or whatever you've named this).
- User support email and developer contact: your email.
- **Publishing status: Testing.** Leave it in Testing — that's fine for you
  and a spouse to use, and skips Google's app-verification review, which
  only matters once a lot of strangers are signing in.
- Under **Test users**, add every Google account that should be able to
  sign in (yourself, your spouse, anyone else you're inviting). Testing-mode
  apps only let listed test users through.
- Scopes: you don't need to add anything here manually — the app requests
  `openid`, `email`, `profile` and `drive.file` at sign-in time, and
  `drive.file` is a "non-sensitive" scope that doesn't need a Google
  reviewer to approve its use in Testing mode.

## 4. Create the OAuth client

Go to **APIs & Services → Credentials → Create Credentials → OAuth client
ID**.

- Application type: **Web application**.
- Name: anything, e.g. "Reno Logbook web".
- **Authorized JavaScript origins**: add every URL this app runs at —
  `http://localhost:3000` for local dev, plus your Vercel production URL and
  any preview URLs you want to sign in from (Vercel preview URLs change per
  branch; add the stable production one at minimum, and add a preview URL
  here if you need to test sign-in on a specific preview deploy).
- **Authorized redirect URIs**: not needed — this app uses Google Identity
  Services' token flow, which doesn't redirect through Google's domain.
- Save, then copy the **Client ID**. That's your
  `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.

## 5. Create the Picker API key

Still under **Credentials → Create Credentials**, this time choose **API
key**. Click into it and, under **API restrictions**, restrict it to just
the **Google Picker API** (the Picker is the only thing that uses an API
key here — everything else uses the OAuth client above). Copy the key —
that's your `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY`.

## 6. Set the Vercel environment variables

In your Vercel project, **Settings → Environment Variables**, add:

```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<the OAuth client id from step 4>
NEXT_PUBLIC_GOOGLE_PICKER_API_KEY=<the API key from step 5>
```

Both are safe to expose to the browser — neither is a secret the way a
service-role key would be; they just name the app and the key to Google.
Redeploy after adding them.

## What you don't need to touch

You don't need to create a Google Cloud service account, a server-side
Google API client, or store any Google token anywhere — the browser talks
to Drive, Sheets and Docs directly with the signed-in user's own access
token, and the server never sees or stores it. See `CLAUDE.md` for why.

## Still on Supabase, for now

Budget, decisions, chat, and documents haven't moved off Supabase yet — see
the main `README.md`'s Supabase section for that setup, which is still
needed until those features are rebuilt against the Google Sheet.

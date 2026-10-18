# Supabase email templates

Paste these in Supabase → Authentication → Email Templates. The links use `token_hash`, so they log in
whichever browser opens them (the default `{{ .ConfirmationURL }}` links only work in the browser that asked
for the email). On iPhone a link always opens in Safari, never the home-screen app, so the email also shows
the code for typing into the app.

Authentication → URL Configuration → Site URL must be the live site (e.g. `https://your-app.vercel.app`).

## Magic Link

Subject: `Your Roommate Tab login code`

```html
<h2>Log in to Roommate Tab</h2>
<p>Your code: <b style="font-size:24px;letter-spacing:4px">{{ .Token }}</b></p>
<p>Using the home-screen app? Type the code there.</p>
<p>In a browser? <a href="{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=email">Tap here to log in</a>.</p>
```

## Confirm signup

Subject: `Confirm your Roommate Tab account`

```html
<h2>Welcome to Roommate Tab</h2>
<p><a href="{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=email">Confirm your email</a>, then sign in with your password.</p>
```

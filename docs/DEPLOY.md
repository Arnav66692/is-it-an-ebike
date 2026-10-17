# Deploy steps (Arnav runs these, because they use your accounts)

Nothing here costs money. There are no API keys and no database.

## 1. Private GitHub repo, about 2 minutes

```bash
cd ~/Desktop/Competitions/is-it-an-ebike
```

```bash
gh repo create is-it-an-ebike --private --source . --remote origin --push
```

That creates a private repo under your account and pushes every commit. Keep it private until you flip it public yourself before submitting.

## 2. Vercel, about 5 minutes

1. Go to https://vercel.com/new and sign in with GitHub.
2. Under "Import Git Repository," pick `is-it-an-ebike`. If it isn't listed, click "Adjust GitHub App Permissions" and give Vercel access to just that repo.
3. The framework shows as Next.js. Leave the build settings alone. No environment variables are needed.
4. Click Deploy. It takes about a minute and gives you an address like `https://is-it-an-ebike.vercel.app`, or one with a suffix if that name is taken.
5. Optional. In Project Settings, Environment Variables, add `NEXT_PUBLIC_SITE_URL` with your live address, then redeploy. The QR flyer prints that address. Without it, the flyer uses whatever address it's opened at, which is also fine.

After this, every push to `main` redeploys on its own. The free Hobby plan allows non-commercial projects.

## 3. Check it on your phone

1. Open the live address. Type age 11, keep City of San Diego, tick Encinitas and An SDUHSD campus.
2. Tap "Type it in." Choose pedals Yes, Class 2, 500 rated watts, throttle Yes at 20 mph, assisted speed 20 mph. Tap Check, then answer No to both fast-mode questions.
3. You should see California allowed, City of San Diego not allowed, Encinitas allowed, and the campus allowed after the course and tag.
4. Tap Español and check that the cards switch.
5. Open `/qr` and print the flyer.
6. Try one product link, such as a Rad Power Bikes or Aventon product page.

## 4. Before you submit (Thu Oct 22)

- Flip the repo public yourself.
- Put the live address in the Devpost entry and at the top of the README.
- Rerun `npm run results` so RESULTS.md has the final numbers.

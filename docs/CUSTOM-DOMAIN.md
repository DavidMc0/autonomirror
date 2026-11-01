# Serving the buttons from get.autonomirror.com

Embed snippets bake in the site's origin at build time. Without a custom domain that's the GitHub Pages address, so every button would depend on `davidmc0.github.io`. With `get.autonomirror.com` (a subdomain of `autonomirror.com`, which David owns), the buttons point at that domain. The page can then move to any static host (Cloudflare Pages, Netlify, a mirror) by changing one DNS record, and no publisher has to edit their embed code.

Buttons keep working **as long as `autonomirror.com` is renewed**, so keep it on auto-renew.

**How the origin is set:** the deploy workflow takes `VITE_PUBLIC_ORIGIN` from the Pages settings. Once `get.autonomirror.com` is set as the Pages custom domain, new builds write that domain into embed snippets automatically. Until then they use the github.io address, so snippets never point at a domain whose DNS isn't live yet.

## Steps (GitHub Pages)

1. DNS for `autonomirror.com`: add a `CNAME` record with name `get` and target `davidmc0.github.io`. (If the DNS provider proxies traffic, e.g. Cloudflare, start with "DNS only" until GitHub has issued the certificate.)
2. Repo *Settings → Pages → Custom domain*: enter `get.autonomirror.com` and save. Wait for the DNS check, then tick **Enforce HTTPS** (the SDK needs a secure context). With the Actions deploy, no `CNAME` file is needed in the repo; GitHub stores the setting.
3. Recommended: verify `autonomirror.com` under your GitHub account's *Settings → Pages → Verified domains*, so no one else can claim its subdomains on Pages.
4. Nothing else to set: the next deploy picks up the custom domain from the Pages settings. (If a host other than GitHub Pages is used, set `VITE_PUBLIC_ORIGIN=https://get.autonomirror.com` at build time.)
5. Re-run the *Deploy to GitHub Pages* workflow. With a custom domain the Pages base path becomes `/`, so links become `https://get.autonomirror.com/d/?a=…`.
6. Check: open https://get.autonomirror.com, make a snippet, and confirm the link starts with `https://get.autonomirror.com/`.

## Moving hosts later

Build anywhere with `VITE_PUBLIC_ORIGIN=https://get.autonomirror.com BASE_PATH=/ npm run build`, upload `dist/`, and point the `get` record at the new host. Existing buttons keep working because the URL doesn't change.

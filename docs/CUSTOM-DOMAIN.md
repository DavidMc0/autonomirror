# Serving the buttons from an owned domain

> **Decision for David:** no domain has been chosen or bought yet. `get.example.org` below is a **placeholder**. Pick and register a real domain (and set it to auto-renew) before following these steps.

Embed snippets bake in the site's origin at build time. Today that is the GitHub Pages address, so every button ever pasted depends on `davidmc0.github.io` staying up. With an owned domain the buttons point at that domain, and the page can move to any static host (Cloudflare Pages, Netlify, a mirror) by changing DNS. No publisher has to edit their embed code.

Buttons keep working only **as long as the domain is renewed**. Snippets made before the switch keep pointing at the old GitHub Pages address.

## Steps (GitHub Pages)

1. Register the domain (placeholder: `get.example.org`). A subdomain of a domain David already controls also works.
2. DNS: add a `CNAME` record `get` → `davidmc0.github.io`. For an apex domain use `A` records to GitHub's Pages IPs (185.199.108.153, .109.153, .110.153, .111.153) and `AAAA` if wanted. See GitHub's docs: "Managing a custom domain for your GitHub Pages site".
3. Repo *Settings → Pages → Custom domain*: enter `get.example.org`, wait for the DNS check, then tick **Enforce HTTPS** (the SDK needs a secure context). With the Actions deploy, no `CNAME` file is needed in the repo; the setting is stored by GitHub.
4. Optional but recommended: verify the domain under your account's *Settings → Pages* to stop takeovers.
5. Repo *Settings → Secrets and variables → Actions → Variables*: add `PUBLIC_ORIGIN` = `https://get.example.org` (no trailing slash). The deploy workflow passes it as `VITE_PUBLIC_ORIGIN`. If unset, it falls back to the Pages origin.
6. Re-run the *Deploy to GitHub Pages* workflow. With a custom domain the Pages base path becomes `/`, so links become `https://get.example.org/d/?a=…`.
7. Check: open the generator, make a snippet, and confirm the link starts with the new domain.

## Moving hosts later

Build anywhere with `VITE_PUBLIC_ORIGIN=https://get.example.org BASE_PATH=/ npm run build`, upload `dist/`, and point the domain's DNS at the new host. Old snippets keep working because the URL doesn't change.

# Connect showsouk.com to ShowSouk

## Current state
The project is already published at **https://emirates-showtime.lovable.app**. The next step is to connect your custom domain from GoDaddy so visitors see `showsouk.com` instead of the Lovable subdomain.

## What we'll do
1. Open the custom domain flow in Lovable.
2. Add `showsouk.com` and `www.showsouk.com`.
3. Add the required DNS records in GoDaddy.
4. Wait for DNS propagation and verify the domain is live.

## Step-by-step

### 1. In Lovable: open the domain flow
- Go to **Project Settings → Project → Domains**, OR click **Publish → Add custom domain**.
- Choose **Connect Domain**.

### 2. Enter the domain
- Type `showsouk.com`.
- Lovable will ask you to add the domain. Add `www.showsouk.com` as a separate entry too (Lovable does not auto-create `www`).

### 3. Add DNS records in GoDaddy
Go to **My Products → DNS** for your `showsouk.com` domain in GoDaddy and add the following records.

| Type | Name | Value |
| ---- | ---- | ----- |
| A    | `@`  | `185.158.133.1` |
| A    | `www`| `185.158.133.1` |
| TXT  | `_lovable` | `lovable_verify=ABC` (copy the exact value from Lovable) |

Do not keep any old A records for `@` or `www` pointing elsewhere. Remove or update them.

### 4. Back in Lovable: verify and wait
- Click **Verify** in Lovable.
- DNS changes can take up to 72 hours to propagate. Status will move from **Verifying** → **Setting up** → **Active**.
- Once Active, choose `www.showsouk.com` or `showsouk.com` as the **Primary** domain; the other will redirect to it.

### 5. SSL
Lovable provisions SSL automatically once the domain is Active. No manual certificate is needed.

## Notes
- The Lovable subdomain **https://emirates-showtime.lovable.app** will keep working; the custom domain will sit on top of it.
- If you want to rename the Lovable subdomain to `showsouk` as well, that can be done separately in Lovable after the custom domain is connected.

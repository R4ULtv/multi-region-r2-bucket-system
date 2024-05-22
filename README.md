[![CloudFlare Worker - Multi-Region Download System](https://www.raulcarini.dev/api/dynamic-og?title=CloudFlare%20Worker&description=Multi-Region%20Download%20Sysyem)

This repository provides an example of how to set up a multi-region bucket with Cloudflare Workers and R2. The configuration allows you to download data quickly and securely across multiple regions, with low-latency access from anywhere in the world.

## Prerequisites
- Node.js: Download and install the LTS version of Node.js from the official website: https://nodejs.org/en/download/package-manager.
- Wrangler: Wrangler is the tool for deploying Cloudflare Workers. You can install it using npm by running this command in the terminal.
```bash
npm install -g wrangler
```

Cloudflare Account: A free or paid Cloudflare account is required. You can create an account at https://www.cloudflare.com/.

## Installation

### 1. Create a Cloudflare account and copy the account ID:

- Go to https://www.cloudflare.com/ and create a new account or log in to your existing account.
- Once logged in, access the Cloudflare dashboard.
- In the left-hand menu, click on "Workers".
- Copy the account ID displayed in the right-hand section.

### 2. Create R2 buckets on Cloudflare in different regions:

- In the Cloudflare dashboard, click on "R2" in the left-hand menu.
- Click on "Create bucket".
- Give your bucket a name and select the region where you want to create it.
- Repeat the previous steps to create buckets in all the desired regions (in the example, all 5 regions).

### 3. Install the repository locally:

- Open a terminal and go to the directory where you want to install the repository.
- Run the following command to clone the repository:

```bash
git clone https://github.com/cloudflare/multi-region-bucket.git
```

### 4. Modify the wrangler.toml file:

- Go to the directory of the cloned repository.
- Open the wrangler.toml file with a text editor.
- Replace YOUR_ACCOUNT_ID with the Cloudflare account ID you copied in step 1.
- Replace the placeholder values for REGION_1_BUCKET, REGION_2_BUCKET, ..., REGION_5_BUCKET with the names of the R2 buckets you created in step 2.
- Save the wrangler.toml file.

### 5. Deploy the Cloudflare Workers application:

In the repository directory, run the following command to deploy the Cloudflare Workers application:

```bash
wrangler deploy
```

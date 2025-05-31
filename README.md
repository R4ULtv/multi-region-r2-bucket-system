![CloudFlare Worker - Multi-Region Download System](https://www.raulcarini.dev/api/dynamic-og?title=CloudFlare%20Worker&description=Multi-Region%20Download%20System)

This project implements a Cloudflare Worker that handles multi-region file downloads from R2 buckets. It automatically selects the closest bucket to the user based on geolocation, improving download speeds and reliability.

## Features

- **Geo-location based routing**: Automatically selects the closest R2 bucket to the user
- **Multiple regions support**: Distributes content across regions for global availability
- **Multi-part upload**: Supports chunked uploads for large files
- **Range requests**: Allows partial content downloads with proper HTTP range headers
- **Conditional requests**: Supports ETags for caching and conditional requests
- **Error handling**: Gracefully handles missing files and other error conditions

## Regions

The worker supports the following regions:

| Code | Name | Location |
|------|------|----------|
| EEUR | EU East | Vienna, Austria |
| WEUR | EU West | Dublin, Ireland |
| ENAM | US East | Washington D.C., USA |
| WNAM | US West | Los Angeles, USA |
| APAC | Asia Pacific | Singapore |

## Prerequisites
- Node.js: Download and install the LTS version of Node.js from the official website: https://nodejs.org/en/download/package-manager.
- Wrangler: Wrangler is the tool for deploying Cloudflare Workers.

- Cloudflare Account: A free or paid Cloudflare account is required. You can create an account at https://www.cloudflare.com/.

## Setup

1. Clone this repository
2. Install dependencies with `pnpm i`
3. Configure your R2 buckets in `wrangler.jsonc`
4. Deploy with `pnpm run deploy`

## Configuration

The `wrangler.jsonc` file should be updated with your actual R2 bucket names:

```jsonc
{
  "r2_buckets": [
    {
      "binding": "EEUR_BUCKET",
      "bucket_name": "EURR"
    },
    {
      "binding": "WEUR_BUCKET",
      "bucket_name": "WEUR"
    },
    {
      "binding": "ENAM_BUCKET",
      "bucket_name": "ENAM"
    },
    {
      "binding": "WNAM_BUCKET",
      "bucket_name": "WNAM"
    },
    {
      "binding": "APAC_BUCKET",
      "bucket_name": "APAC"
    }
  ],
}
```

## API Endpoints

### GET /:objectName

Downloads a file from the closest R2 bucket.

**Response:**
- 200 OK: File content with appropriate headers
- 206 Partial Content: For range requests
- 304 Not Modified: For conditional requests
- 404 Not Found: If the file doesn't exist

### POST /:objectName

Handles multipart upload operations.

**Parameters:**
- `action`: Action to perform ('mpu-create' or 'mpu-complete')
- `uploadId`: Required for 'mpu-complete'

**Headers:**
- `X-Bucket-Name`: Required - Specifies which bucket to use (EEUR, WEUR, ENAM, WNAM, APAC)

### PUT /:objectName

Handles part uploads for multipart operations.

**Parameters:**
- `action`: Must be 'mpu-uploadpart'
- `uploadId`: Required - The upload ID from mpu-create
- `partNumber`: Required - The part number to upload

**Headers:**
- `X-Bucket-Name`: Required - Specifies which bucket to use

## Upload Tool

A Python script is included to upload files to the R2 buckets. See [./src/upload/README.md](./src/upload/README.md) for details.

## Security

The code includes commented out token validation using Redis which can be enabled for better security:

```javascript
// Middleware for token validation
app.use('*', async (c, next) => {
  const redis = Redis.fromEnv(c.env);
  const isValid = await bearerAuth({ token: async (token) => !(await redis.sismember('tokens', token)) })(c, next);
  if (!isValid.response) {
    return c.json({ error: 'Invalid Token' }, 401);
  }
  await next();
});
```

## License

This project is licensed under the [MIT License](LICENSE).

## Support

If you find this project helpful, please consider:
- Giving it a ⭐️ on GitHub
- [Becoming a sponsor](https://github.com/sponsors/R4ULtv/)

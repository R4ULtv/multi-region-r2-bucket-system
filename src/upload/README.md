<img alt="CloudFlare Worker - Multi-Region Download System" src="https://www.raulcarini.dev/api/dynamic-og?title=Upload%20Files&description=Multi-Region%20Upload%20System">

You can use this python script to upload files to R2 buckets in single or multiple cloudflare regions.

## Prerequisites
- Python: 3.8 or higher. You can install it here: https://www.python.org/downloads/.
- Cloudflare Workers: You can use my example worker (check [here](./README.md)) or you can create your own worker.

## Installation

Clone this repository.
You need to install the required dependencies with:

```bash 
pip install -r requirements.txt
```

## Usage

Run the file with:

```bash 
python main.py -f {file_path} -e {endpoint} -r {region}
```

- `-f`, `--file` (required): This argument specifies the file you want to upload. You must provide the file path.
- `-e`, `--endpoint` (required): This argument defines the endpoint URL of your Cloudflare Worker that will handle the upload.
- `-b`, `--bucket` (required): This argument indicates the bucket(s) where the file will be uploaded in your Cloudflare Worker. You can provide a single bucket name or a comma-separated list of buckets for redundancy.
- `-p`, `--partsize` (optional, default: 10): This argument sets the size (in megabytes) of each chunk during the multipart upload process. The default value is 10MB. Min: 1, Max: 100.
- `-a`, `--auth` (optional): This argument allows you to specify an authentication token if required by your Cloudflare Worker for authorization.
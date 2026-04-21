terraform {
  required_version = ">= 1.5"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
    b2 = {
      source  = "Backblaze/b2"
      version = "~> 0.9"
    }
  }

  # Cloudflare R2 as S3-compatible Terraform state backend.
  # One-time manual setup:
  #   1. Create bucket: npx wrangler r2 bucket create srn-terraform-state
  #   2. Create R2 API token with read/write on that bucket (separate from CF API token).
  #   3. Set TF_VAR_r2_access_key_id and TF_VAR_r2_secret_access_key in GitHub Secrets.
  backend "s3" {
    bucket = "srn-terraform-state"
    key    = "srn/terraform.tfstate"
    region = "auto"

    # endpoint is set via TF_BACKEND_ENDPOINT env var in CI, or passed with -backend-config
    # e.g. https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    force_path_style            = true
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

provider "b2" {
  # Credentials are read from the standard Backblaze environment variables:
  #   B2_APPLICATION_KEY_ID and B2_APPLICATION_KEY
  # Set these as GitHub Secrets (B2_MASTER_KEY_ID / B2_MASTER_APP_KEY);
  # terraform.yml maps them to the expected env var names at plan/apply time.
}

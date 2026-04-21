# Discover the account's S3 endpoint automatically — no need to hardcode region.
data "b2_account_info" "current" {}

resource "b2_bucket" "backup" {
  bucket_name = var.b2_bucket_name
  bucket_type = "allPrivate"
}

# Worker 专用 scoped key（只能读写这个 bucket）
resource "b2_application_key" "worker" {
  key_name     = "srn-worker-backup"
  capabilities = ["readFiles", "writeFiles", "listFiles", "listBuckets"]
  bucket_id    = b2_bucket.backup.bucket_id
}

output "b2_worker_key_id" {
  value     = b2_application_key.worker.application_key_id
  sensitive = true
}

output "b2_worker_app_key" {
  value     = b2_application_key.worker.application_key
  sensitive = true
}

output "b2_bucket_name" {
  value = b2_bucket.backup.bucket_name
}

# Derived from account info — always matches the region where the bucket lives.
output "b2_endpoint" {
  value = data.b2_account_info.current.s3_api_url
}

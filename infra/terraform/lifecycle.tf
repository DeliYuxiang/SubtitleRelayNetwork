resource "cloudflare_r2_bucket_lifecycle" "backup_expiry" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.production_backup.name

  rules = [
    {
      id     = "expire-old-backups"
      status = "enabled"

      conditions = {
        prefix = "backup-"
      }

      actions = {
        delete_object = {
          enabled = true
        }
      }

      object_size_greater_than = null
      object_size_less_than    = null
      upload_date_greater_than = null
      upload_date_less_than    = null
      expiration = {
        days = var.backup_retention_days
      }
    }
  ]
}

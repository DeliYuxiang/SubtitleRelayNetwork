resource "cloudflare_d1_database" "production" {
  account_id = var.cloudflare_account_id
  name       = var.production_d1_name
}

resource "cloudflare_r2_bucket" "production_assets" {
  account_id = var.cloudflare_account_id
  name       = var.production_r2_name
}

resource "cloudflare_r2_bucket" "production_backup" {
  account_id = var.cloudflare_account_id
  name       = var.production_backup_r2_name
}
